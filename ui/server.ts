// Local web overview: a Pending tab of signals waiting on the owner, a Later tab of the ones tabled for when there is time
// and a History tab of the rest, with the same buttons as Telegram, plus a read-only Employers tab of the employers on
// the watch list.
// Unauthenticated by design: it is the owner's desk view. It listens on loopback unless PIPELINE_UI_HOST names another
// address (a private network only, never the open internet), and refuses button presses another website sends.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import {
  composeTitles, droppedCount, escapeHtml, GONE, kindTag, pendingSignals, SIGNAL_ORDER, signalRows, type SignalRow,
} from '../bot/notify.ts';
import { markApplied, markLater, markSkipped, reopen, SKIP_REASONS, snooze } from '../bot/server.ts';
import { composeMailto } from '../bot/templates.ts';
import { loadCompanies } from '../core/companies.ts';
import { openDb } from '../core/db.ts';
import { routeTag, withFlag } from '../core/flag.ts';
import { type Company, EMPLOYER_BARS, EMPLOYER_GROUPS } from '../core/types.ts';

// headers: lower-case names, as node:http gives them; absent when a caller (the tests) drives handle() directly.
export interface Req { method: string; url: string; body?: string; headers?: Record<string, string | undefined> }
export interface Res { status: number; headers: Record<string, string>; body: string }

const SIGNAL_ACTION = /^\/signal\/([0-9a-f]{64})\/([a-z]+)$/;

const text = (status: number, body: string): Res => ({ status, headers: { 'content-type': 'text/plain; charset=utf-8' }, body });

// Vendored Pico CSS (classless, MIT, ui/LICENSE-pico.txt); the page loads nothing from the network.
const PICO = readFileSync(new URL('./pico.classless.min.css', import.meta.url), 'utf8');

// What classless Pico lacks: a width cap, the tab bar, the inline button row, secondary outline buttons and status badges.
const STYLE = `
  :root { --pico-font-size: 100%; }
  body > header, body > main { max-width: 860px; }
  article ul { margin-bottom: 0; } article li { overflow-wrap: anywhere; }
  article li small, .meta { color: var(--pico-muted-color); } .meta { font-size: .875em; }
  article > footer { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
  article > footer :is(form, fieldset, select, button, [role=button]) { width: auto; margin: 0; }
  #theme, #tabs button, article > footer :is(select, button, [role=button]) { --pico-form-element-spacing-vertical: .3rem; --pico-form-element-spacing-horizontal: .75rem; font-size: .875rem; }
  #tabs { display: flex; gap: .5rem; justify-content: flex-start; margin-bottom: var(--pico-spacing); } #tabs button { width: auto; margin: 0; }
  .secondary.outline { --pico-background-color: transparent; --pico-color: var(--pico-secondary); --pico-border-color: var(--pico-secondary); }
  .secondary.outline:is(:hover, :active, :focus) { --pico-background-color: transparent; --pico-color: var(--pico-secondary-hover); --pico-border-color: var(--pico-secondary-hover); }
  .badge { display: inline-block; font-size: .75em; padding: 0 .5em; border-radius: 1em; color: #fff; background: #777; vertical-align: middle; }
  .b-new { background: #2563eb; } .b-notified { background: #7c3aed; } .b-applied, .b-sent, .b-replied, .b-yes { background: #15803d; }
  .b-skipped { background: #6b7280; } .b-snoozed { background: #b45309; }
  :is(.b-unsent, .b-later, .b-muted) { background: transparent; color: var(--pico-muted-color); border: 1px solid var(--pico-muted-border-color); }
  #theme { float: right; width: auto; margin-top: .25rem; }
  #sec-employers article p { margin-bottom: .25rem; }`;

// Light or dark on demand. Pico follows the system setting unless <html data-theme> says otherwise; the choice is kept
// in the browser's localStorage and applied before the body renders, so a reload does not flash the other theme.
const THEME_SCRIPT = `
  const stored = localStorage.getItem('theme');
  if (stored) document.documentElement.dataset.theme = stored;
  function toggleTheme() {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
  }`;

// The tab from the address: #later, #history or #employers, or the anchor of a card in that tab (a direct link to
// /#s-<id> or /#e-<company id>), opens that tab; anything else Pending. Runs at the end of the body, once the sections exist. The section ids differ from the
// hash words so a tab click does not scroll the page.
const TABS_SCRIPT = `
  function showTab(name) {
    for (const t of ['pending', 'later', 'history', 'employers']) {
      document.getElementById('sec-' + t).hidden = t !== name;
      document.getElementById('tab-' + t).className = t === name ? '' : 'secondary outline';
    }
  }
  function fromHash() {
    const target = location.hash.length > 1 ? document.getElementById(location.hash.slice(1)) : null;
    showTab(['later', 'history', 'employers'].find((t) => location.hash === '#' + t || target?.closest('#sec-' + t)) ?? 'pending');
    // The browser could not scroll to a card while its section was hidden.
    target?.scrollIntoView();
  }
  addEventListener('hashchange', fromHash);
  fromHash();`;

// A history card that is still new is an older signal the next notify supersedes, or one whose postings are all
// gone that the next notify expires, so it gets no buttons. past is true for a Later or History card.
function actions(rows: SignalRow[], past: boolean): string {
  const { id, list, status, name } = rows[0];
  const form = (action: string, inner: string) => `<form method="post" action="/signal/${id}/${action}">${inner}</form>`;
  const secondary = (label: string) => `<button class="secondary outline">${label}</button>`;
  const out: string[] = [];
  if (!past || ['notified', 'snoozed', 'later'].includes(status)) {
    if (list === 'apply') out.push(form('applied', '<button>Mark applied</button>'));
    else {
      // Same titles as the Telegram Compose reply.
      out.push(`<a role="button" href="${escapeHtml(composeMailto(name, composeTitles(rows)))}">Compose</a>`);
    }
    const options = SKIP_REASONS.map(([code, label]) => `<option value="${code}">${escapeHtml(label)}</option>`).join('');
    out.push(form('skip', `<fieldset role="group"><select name="reason">${options}</select>${secondary('Skip')}</fieldset>`),
      form('snooze', secondary('Snooze 7d')));
    if (!past) out.push(form('later', secondary('Later')));
  }
  if (['skipped', 'applied', 'snoozed', 'later'].includes(status)) out.push(form('reopen', secondary('Reopen')));
  return out.length ? `<footer>${out.join('')}</footer>` : '';
}

interface Past { id: string; run_date: string; skip_reason: string | null; snooze_until: string | null }

// Local time of day (the service's TZ) of a run's started_at, or nothing when the run has no row or an odd value.
export function runTime(startedAt: string | undefined): string {
  const d = new Date(startedAt ?? '');
  if (Number.isNaN(d.getTime())) return '';
  return ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// A Later or History card (past given) also shows status, skip reason and snooze date; skip_reason and snooze_until are not in SignalRow.
// A pending card only marks what the digest has not sent yet: the owner can act on it here before it reaches Telegram.
function card(rows: SignalRow[], runs: Map<string, string>, past?: Past): string {
  const { id, run_date, list, status, name, country, ats_vendor, warm, kind } = rows[0];
  const isPast = past !== undefined;
  const { skip_reason, snooze_until } = past ?? { skip_reason: null, snooze_until: null };
  const badge = isPast ? ` <span class="badge b-${escapeHtml(status)}">${escapeHtml(status)}</span>`
    : ['new', 'snoozed'].includes(status) ? ' <span class="badge b-unsent">not sent yet</span>' : '';
  const head = `${warm ? '🔥 warm · ' : ''}<b>${escapeHtml(name)}</b> · ${escapeHtml(withFlag(country))} · ${escapeHtml(ats_vendor)}` +
    ` · <b>${list.toUpperCase()}</b>${kindTag(kind)} · run ${escapeHtml(run_date)}${runTime(runs.get(run_date))}${badge}`;
  const meta = [skip_reason && `skipped: ${escapeHtml(skip_reason)}`, snooze_until && `snoozed until ${escapeHtml(snooze_until)}`]
    .filter(Boolean);
  const postings = rows.map((p) => {
    const link = `<a href="${escapeHtml(p.url)}">${escapeHtml(p.title)}</a>`;
    return `<li>${p.gone ? `<s>${link}</s>` : link} — ${escapeHtml(p.location ?? 'no location')}` +
      ` <small>[${escapeHtml(routeTag(p.route_reason))}]${p.gone ? ` · ${GONE}` : ''}</small></li>`;
  });
  return `<article id="s-${id.slice(0, 16)}"><header>${head}</header>` +
    (meta.length ? `<p class="meta">${meta.join(' · ')}</p>` : '') + `<ul>${postings.join('')}</ul>${actions(rows, isPast)}</article>`;
}

const GROUP_LABELS: Record<(typeof EMPLOYER_GROUPS)[number], string> = {
  'payments-fintech': 'Payments and fintech', 'commerce-platforms': 'Commerce platforms',
  'commerce-adjacent': 'Commerce-adjacent', 'devtools-ai': 'Developer tools and AI', 'remote-first-europe': 'Remote-first Europe',
};

interface Board { live: number; engineering: number; kept: number; last_seen: string }

// What the board says today, from postings: live ones, the engineering ones among them (the filter's title rule), and
// the ones the filter kept. The gap between engineering and kept is what the employer rule dropped; it is shown, not hidden.
function boardLine(c: Company, board: Board | undefined): string {
  const vendor = c.ats ? escapeHtml(c.ats.vendor) : 'not read';
  if (!board) return c.ats ? `${vendor} · not polled yet` : vendor;
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  return `${vendor} · ${n(board.live, 'live posting')}, ${board.engineering} engineering, ${board.kept} kept · ` +
    `last seen ${escapeHtml(board.last_seen)}`;
}

// The link text of a source: its host, or the whole value when it is not a URL.
const sourceText = (source: string) => {
  try {
    return new URL(source).host || source;
  } catch {
    return source;
  }
};

// One card per employer, read-only. The profile comes from the yaml, so the tab works before the first nightly; the
// board line from the database.
function employerCard(c: Company, board: Board | undefined): string {
  const e = c.employer!;
  const name = c.careers_url ? `<a href="${escapeHtml(c.careers_url)}"><b>${escapeHtml(c.name)}</b></a>` : `<b>${escapeHtml(c.name)}</b>`;
  const europe = `<span class="badge ${e.remote.europe === 'yes' ? 'b-yes' : 'b-muted'}">Europe: ${escapeHtml(e.remote.europe)}</span>`;
  const head = `${name} · ${escapeHtml(withFlag(c.country))} <span class="badge">${escapeHtml(e.bar)}</span> ${europe}`;
  const remote = `Remote: ${escapeHtml(e.remote.says)} (<a href="${escapeHtml(e.remote.source)}">${escapeHtml(sourceText(e.remote.source))}</a>)`;
  return `<article id="e-${escapeHtml(c.id)}"><header>${head}</header><p>${escapeHtml(e.why)}</p>` +
    `<p class="meta">${remote}</p><p class="meta">Board: ${boardLine(c, board)}</p></article>`;
}

// Grouped in EMPLOYER_GROUPS order, within a group by bar (reach, fit, stretch) then name.
function employersSection(db: DatabaseSync, companies: Company[]): { html: string; count: number } {
  const employers = companies.filter((c) => c.kind === 'employer' && c.employer);
  const boards = new Map((db.prepare(`
    select company_id, count(case when gone_at is null then 1 end) as live,
      count(case when gone_at is null and route_reason not in ('non-engineering', 'evergreen') then 1 end) as engineering,
      count(case when gone_at is null and route != 'drop' then 1 end) as kept, max(last_seen) as last_seen
    from postings where company_id in (select value from json_each(?)) group by company_id`)
    .all(JSON.stringify(employers.map((c) => c.id))) as unknown as (Board & { company_id: string })[])
    .map((b) => [b.company_id, b]));
  const groups = EMPLOYER_GROUPS.map((g) => {
    const cards = employers.filter((c) => c.employer!.group === g)
      .sort((a, b) => EMPLOYER_BARS.indexOf(a.employer!.bar) - EMPLOYER_BARS.indexOf(b.employer!.bar) ||
        a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
      .map((c) => employerCard(c, boards.get(c.id)));
    return cards.length ? `<h3>${GROUP_LABELS[g]}</h3>${cards.join('')}` : '';
  });
  return { html: groups.join('') || '<p>No employers on the watch list.</p>', count: employers.length };
}

// Pending is what waits on the owner: what the digest will send (pendingSignals, shared with bot/notify.ts, so left as
// it is) plus what it sent that has no answer yet (notified). Later is what the owner tabled (status later, never pending,
// so the nightly leaves it alone). History is everything else.
function page(db: DatabaseSync, today: string, companies: Company[]): string {
  const bySignal = pendingSignals(db, today);
  const employers = employersSection(db, companies);

  // Same order as the digest within a run date.
  const all = db.prepare(`
    select s.id, s.run_date, s.status, s.skip_reason, s.snooze_until from signals s join companies c on c.id = s.company_id
    order by s.run_date desc, ${SIGNAL_ORDER}`)
    .all() as unknown as (Past & { status: string })[];
  // A notified card shows its gone postings struck through, as its Telegram message does.
  const waiting = all.filter((s) => bySignal.has(s.id) || s.status === 'notified')
    .map((s) => bySignal.get(s.id) ?? signalRows(db, s.id));
  const later = all.filter((s) => s.status === 'later');
  const others = all.filter((s) => !bySignal.has(s.id) && !['notified', 'later'].includes(s.status));

  const apply = waiting.filter((s) => s[0].list === 'apply').length;
  const header = `${apply} apply · ${waiting.length - apply} outreach waiting · ${droppedCount(db, today)} dropped postings today`;

  // When each run started, for the card header.
  const runs = new Map((db.prepare('select run_date, started_at from runs').all() as { run_date: string; started_at: string }[])
    .map((r) => [r.run_date, r.started_at]));
  const byDate = new Map<string, string[]>();
  for (const s of others) byDate.set(s.run_date, [...(byDate.get(s.run_date) ?? []), card(signalRows(db, s.id), runs, s)]);
  const history = [...byDate].map(([date, cards]) => `<h3>${escapeHtml(date)}</h3>${cards.join('')}`).join('');

  // Rendered with Pending open; TABS_SCRIPT switches by the address before the page shows.
  const tab = (name: string, label: string, count: number, active: boolean) =>
    `<button id="tab-${name}"${active ? '' : ' class="secondary outline"'} onclick="location.hash = '${name}'">${label} (${count})</button>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Pipeline ${escapeHtml(today)}</title><link rel="stylesheet" href="/pico.css"><style>${STYLE}</style><script>${THEME_SCRIPT}</script></head><body>` +
    `<header><button id="theme" class="secondary outline" onclick="toggleTheme()">light / dark</button>` +
    `<h1>Pipeline overview ${escapeHtml(today)}</h1><p>${header}</p></header><main>` +
    `<nav id="tabs">${tab('pending', 'Pending', waiting.length, true)}${tab('later', 'Later', later.length, false)}` +
    `${tab('history', 'History', others.length, false)}${tab('employers', 'Employers', employers.count, false)}</nav>` +
    `<section id="sec-pending">${waiting.map((rows) => card(rows, runs)).join('') || '<p>Nothing pending.</p>'}</section>` +
    `<section id="sec-later" hidden>${later.map((s) => card(signalRows(db, s.id), runs, s)).join('') || '<p>Nothing for later.</p>'}</section>` +
    `<section id="sec-history" hidden>${history || '<p>No past signals.</p>'}</section>` +
    `<section id="sec-employers" hidden>${employers.html}</section></main>` +
    `<script>${TABS_SCRIPT}</script></body></html>`;
}

// Cross-site request forgery check for button presses. A browser marks where a POST comes from with Origin, or failing
// that Sec-Fetch-Site; either saying "another site" refuses it. A POST with neither is not from a browser and passes.
export function crossSite(headers: Req['headers'] = {}): boolean {
  const origin = headers.origin;
  if (origin !== undefined) {
    // "null" (sandboxed frames, some redirects) and anything unparsable count as foreign.
    let from: URL;
    try {
      from = new URL(origin);
    } catch {
      return true;
    }
    if (!headers.host) return true;
    try {
      // Host read with the origin's scheme, so a default port written out (":443") compares equal to an omitted one.
      return new URL(`${from.protocol}//${headers.host}`).host !== from.host;
    } catch {
      return true;
    }
  }
  const site = headers['sec-fetch-site'];
  return site !== undefined && site !== 'same-origin' && site !== 'none';
}

// companies: the watch list for the Employers tab, read from universe/companies.yaml on each page load unless given
// (the tests pass their own).
export function handle(
  db: DatabaseSync, req: Req, today = new Date().toISOString().slice(0, 10), companies?: Company[],
): Res {
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  if (req.method === 'POST' && crossSite(req.headers)) return text(403, 'cross-site request refused');
  if (req.method === 'GET' && path === '/') {
    return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: page(db, today, companies ?? loadCompanies()) };
  }
  if (req.method === 'GET' && path === '/pico.css') {
    return { status: 200, headers: { 'content-type': 'text/css', 'cache-control': 'max-age=86400' }, body: PICO };
  }

  const [, id, action] = (req.method === 'POST' && path.match(SIGNAL_ACTION)) || [];
  if (!id || !db.prepare('select 1 from signals where id = :id').get({ id })) return text(404, 'not found');
  switch (action) {
    case 'applied':
      markApplied(db, id);
      break;
    case 'skip': {
      const code = new URLSearchParams(req.body ?? '').get('reason');
      const label = SKIP_REASONS.find(([c]) => c === code)?.[1];
      if (!label) return text(400, 'unknown skip reason');
      markSkipped(db, id, label);
      break;
    }
    case 'snooze':
      snooze(db, id, today);
      break;
    case 'later':
      markLater(db, id);
      break;
    case 'reopen':
      // Back on Pending, at the card.
      reopen(db, id);
      return { status: 303, headers: { location: `/#s-${id.slice(0, 16)}` }, body: '' };
    default:
      return text(404, 'not found');
  }
  // The Pending tab, where the owner works through the list, not the tab the card moved to.
  return { status: 303, headers: { location: '/' }, body: '' };
}

export interface Running {
  // Settles when the service ends: resolves after stop(), rejects if it fails on its own.
  done: Promise<void>;
  // Idempotent; resolves once the service is down and its database closed.
  stop(): Promise<void>;
}

// Resolves once listening; rejects (database closed) if the address cannot be bound.
export function startUi(env: NodeJS.ProcessEnv = process.env): Promise<Running> {
  const port = Number(env.PIPELINE_UI_PORT ?? 8787);
  const host = env.PIPELINE_UI_HOST || '127.0.0.1';
  const db = openDb();
  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => (body += chunk));
    req.on('end', () => {
      let out: Res;
      try {
        out = handle(db, { method: req.method ?? 'GET', url: req.url ?? '/', body, headers: req.headers as Req['headers'] });
      } catch (err) {
        console.error(err);
        out = text(500, 'internal error');
      }
      res.writeHead(out.status, out.headers).end(out.body);
    });
  });

  let dbOpen = true;
  const closeDb = () => {
    if (dbOpen) db.close();
    dbOpen = false;
  };
  const done = new Promise<void>((resolve, reject) => {
    server.once('close', () => (closeDb(), resolve()));
    server.once('error', (err) => (closeDb(), reject(err)));
  });
  // Marked handled here; a caller that awaits done still sees the rejection.
  done.catch(() => {});
  let stopping: Promise<void> | undefined;
  const stop = () => {
    if (!stopping) {
      // closeAllConnections drops keep-alive and in-flight connections, so an open browser tab does not hold the close.
      server.close();
      server.closeAllConnections();
      stopping = done.catch(() => {});
    }
    return stopping;
  };

  return new Promise((resolve, reject) => {
    const failed = (err: Error) => (closeDb(), reject(err));
    server.once('error', failed);
    try {
      server.listen(port, host, () => {
        server.off('error', failed);
        const { address, family, port: bound } = server.address() as AddressInfo;
        console.log(`ui: http://${family === 'IPv6' ? `[${address}]` : address}:${bound}/`);
        resolve({ done, stop });
      });
    } catch (err) {
      failed(err as Error);
    }
  });
}

async function main() {
  const ui = await startUi();
  const shutdown = () => void ui.stop();
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
