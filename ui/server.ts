// Local web overview: the pending digest on top, every past signal below, with the same buttons as Telegram.
// Unauthenticated by design: it is the owner's desk view. It listens on loopback unless PIPELINE_UI_HOST names another
// address (a private network only, never the open internet), and refuses button presses another website sends.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { composeTitles, droppedCount, escapeHtml, GONE, pendingSignals, signalRows, type SignalRow } from '../bot/notify.ts';
import { markApplied, markSkipped, reopen, SKIP_REASONS, snooze } from '../bot/server.ts';
import { composeMailto } from '../bot/templates.ts';
import { openDb } from '../core/db.ts';
import { routeTag, withFlag } from '../core/flag.ts';

// headers: lower-case names, as node:http gives them; absent when a caller (the tests) drives handle() directly.
export interface Req { method: string; url: string; body?: string; headers?: Record<string, string | undefined> }
export interface Res { status: number; headers: Record<string, string>; body: string }

const SIGNAL_ACTION = /^\/signal\/([0-9a-f]{64})\/([a-z]+)$/;

const text = (status: number, body: string): Res => ({ status, headers: { 'content-type': 'text/plain; charset=utf-8' }, body });

// Vendored Pico CSS (classless, MIT, ui/LICENSE-pico.txt); the page loads nothing from the network.
const PICO = readFileSync(new URL('./pico.classless.min.css', import.meta.url), 'utf8');

// What classless Pico lacks: a width cap, the inline button row, secondary outline buttons and status badges.
const STYLE = `
  :root { --pico-font-size: 100%; }
  body > header, body > main { max-width: 860px; }
  article ul { margin-bottom: 0; } article li { overflow-wrap: anywhere; }
  article li small, .meta { color: var(--pico-muted-color); } .meta { font-size: .875em; }
  article > footer { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
  article > footer :is(form, fieldset, select, button, [role=button]) { width: auto; margin: 0; }
  article > footer :is(select, button, [role=button]) { --pico-form-element-spacing-vertical: .3rem; --pico-form-element-spacing-horizontal: .75rem; font-size: .875rem; }
  .secondary.outline { --pico-background-color: transparent; --pico-color: var(--pico-secondary); --pico-border-color: var(--pico-secondary); }
  .secondary.outline:is(:hover, :active, :focus) { --pico-background-color: transparent; --pico-color: var(--pico-secondary-hover); --pico-border-color: var(--pico-secondary-hover); }
  .badge { display: inline-block; font-size: .75em; padding: 0 .5em; border-radius: 1em; color: #fff; background: #777; vertical-align: middle; }
  .b-new { background: #2563eb; } .b-notified { background: #7c3aed; } .b-applied, .b-sent, .b-replied { background: #15803d; }
  .b-skipped { background: #6b7280; } .b-snoozed { background: #b45309; }`;

// A history card that is still new is an older signal the next notify supersedes, or one whose postings are all
// gone that the next notify expires, so it gets no buttons.
function actions(rows: SignalRow[], history: boolean): string {
  const { id, list, status, name } = rows[0];
  const form = (action: string, inner: string) => `<form method="post" action="/signal/${id}/${action}">${inner}</form>`;
  const secondary = (label: string) => `<button class="secondary outline">${label}</button>`;
  const out: string[] = [];
  if (!history || ['notified', 'snoozed'].includes(status)) {
    if (list === 'apply') out.push(form('applied', '<button>Mark applied</button>'));
    else {
      // Same titles as the Telegram Compose reply.
      out.push(`<a role="button" href="${escapeHtml(composeMailto(name, composeTitles(rows)))}">Compose</a>`);
    }
    const options = SKIP_REASONS.map(([code, label]) => `<option value="${code}">${escapeHtml(label)}</option>`).join('');
    out.push(form('skip', `<fieldset role="group"><select name="reason">${options}</select>${secondary('Skip')}</fieldset>`),
      form('snooze', secondary('Snooze 7d')));
  }
  if (['skipped', 'applied', 'snoozed'].includes(status)) out.push(form('reopen', secondary('Reopen')));
  return out.length ? `<footer>${out.join('')}</footer>` : '';
}

interface Past { id: string; run_date: string; skip_reason: string | null; snooze_until: string | null }

// A history card (past given) also shows status, skip reason and snooze date; skip_reason and snooze_until are not in SignalRow.
function card(rows: SignalRow[], past?: Past): string {
  const { id, run_date, list, status, name, country, ats_vendor, warm } = rows[0];
  const history = past !== undefined;
  const { skip_reason, snooze_until } = past ?? { skip_reason: null, snooze_until: null };
  const head = `${warm ? '🔥 warm · ' : ''}<b>${escapeHtml(name)}</b> · ${escapeHtml(withFlag(country))} · ${escapeHtml(ats_vendor)}` +
    ` · <b>${list.toUpperCase()}</b> · run ${escapeHtml(run_date)}` +
    (history ? ` <span class="badge b-${escapeHtml(status)}">${escapeHtml(status)}</span>` : '');
  const meta = [skip_reason && `skipped: ${escapeHtml(skip_reason)}`, snooze_until && `snoozed until ${escapeHtml(snooze_until)}`]
    .filter(Boolean);
  const postings = rows.map((p) => {
    const link = `<a href="${escapeHtml(p.url)}">${escapeHtml(p.title)}</a>`;
    return `<li>${p.gone ? `<s>${link}</s>` : link} — ${escapeHtml(p.location ?? 'no location')}` +
      ` <small>[${escapeHtml(routeTag(p.route_reason))}]${p.gone ? ` · ${GONE}` : ''}</small></li>`;
  });
  return `<article id="s-${id.slice(0, 16)}"><header>${head}</header>` +
    (meta.length ? `<p class="meta">${meta.join(' · ')}</p>` : '') + `<ul>${postings.join('')}</ul>${actions(rows, history)}</article>`;
}

function page(db: DatabaseSync, today: string): string {
  const bySignal = pendingSignals(db, today);
  const pending = [...bySignal.values()];
  const apply = pending.filter((s) => s[0].list === 'apply');
  const outreach = pending.filter((s) => s[0].list === 'outreach');
  const header = `${apply.length} apply · ${outreach.length} outreach · ${droppedCount(db, today)} dropped postings`;

  // Same order as the digest within a run date.
  const others = (db.prepare(`
    select s.id, s.run_date, s.skip_reason, s.snooze_until from signals s join companies c on c.id = s.company_id
    order by s.run_date desc, c.warm desc, case s.list when 'apply' then 0 else 1 end, c.name collate nocase`)
    .all() as unknown as Past[])
    .filter((s) => !bySignal.has(s.id));
  const byDate = new Map<string, string[]>();
  for (const s of others) byDate.set(s.run_date, [...(byDate.get(s.run_date) ?? []), card(signalRows(db, s.id), s)]);

  const history = [...byDate].map(([date, cards]) => `<h3>${escapeHtml(date)}</h3>${cards.join('')}`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Pipeline ${escapeHtml(today)}</title><link rel="stylesheet" href="/pico.css"><style>${STYLE}</style></head><body>` +
    `<header><h1>Pipeline overview ${escapeHtml(today)}</h1><p>${header}</p></header><main>` +
    `<section><h2>Pending</h2>${[...apply, ...outreach].map((rows) => card(rows)).join('') || '<p>Nothing pending.</p>'}</section>` +
    `<section><h2>History</h2>${history || '<p>No past signals.</p>'}</section></main></body></html>`;
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

export function handle(db: DatabaseSync, req: Req, today = new Date().toISOString().slice(0, 10)): Res {
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  if (req.method === 'POST' && crossSite(req.headers)) return text(403, 'cross-site request refused');
  if (req.method === 'GET' && path === '/') {
    return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: page(db, today) };
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
    case 'reopen':
      reopen(db, id);
      break;
    default:
      return text(404, 'not found');
  }
  return { status: 303, headers: { location: `/#s-${id.slice(0, 16)}` }, body: '' };
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
