// Stage 7: send the run's signals to the owner's Telegram chat: a header, one message per agency signal with action
// buttons, then one overview message for all employer signals, whose actions are on the overview page.
import type { DatabaseSync } from 'node:sqlite';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { Bot, GrammyError } from 'grammy';
import type { InlineKeyboardButton } from 'grammy/types';
import { openDb } from '../core/db.ts';
import { flag, routeTag, withFlag } from '../core/flag.ts';
import { HOME } from '../core/location.ts';
import { stamp } from '../core/log.ts';

// signal_ids: the signals the message carries, marked notified once it is sent. None for the header, one for an
// agency signal, every employer signal listed in it for the employer overview.
export interface DigestMessage { signal_ids: string[]; text: string; buttons: InlineKeyboardButton[][] }

export interface SignalRow {
  id: string; run_date: string; list: 'apply' | 'outreach'; status: string; company_id: string; name: string; country: string;
  ats_vendor: string; warm: number; title: string; location: string | null; url: string; route: string; route_reason: string;
  gone: number; // 1 once the posting left the company's board (postings.gone_at set)
  kind: string; // companies.kind: agency | employer
}

// ` · employer` after the list name for an employer's signal, so it never reads as an agency contract. Shared with
// core/publish.ts and the UI page.
export const kindTag = (kind: string) => (kind === 'employer' ? ' · employer' : '');

// Marker after a posting that left the company's board; the UI page uses the same word.
export const GONE = 'gone';

// callback_data is `${action}:${id16}`: Telegram caps it at 64 bytes and signal ids are 64-hex sha256.
export const CALLBACK_ID_LEN = 16;

// Telegram caps a message at 4096 characters after entity parsing; leave room for the status line edits add.
const MAX_VISIBLE = 3500;
// Telegram applies at most 100 formatting entities (bold, links) to a message and shows the rest as plain text
// (its published limits; not tested against the API here). The employer overview is the one message that can pass it.
const MAX_ENTITIES = 100;
const entityCount = (html: string) => (html.match(/<(?:b|a)[ >]/g) ?? []).length;

// A live posting with a B2B reason (core/filter.ts): the owner's preferred contract form, so its signal leads the apply list.
// `cross join` fixes the loop order: json_each outside, postings looked up by id. Left to itself SQLite scans every live
// posting and re-parses ref_ids for each, which cost 5 ms per signal per evaluation (11 s page loads on 4,500 postings).
const hasB2b = (s: string) =>
  `exists (select 1 from json_each(${s}.ref_ids) bj cross join postings bp on bp.id = bj.value where bp.gone_at is null and bp.route_reason like 'b2b:%')`;

// Signal order of the digest, shared with the UI page (aliases s and c): warm first, then apply before outreach,
// apply signals with a B2B posting first, then by name.
export const SIGNAL_ORDER = `c.warm desc, case s.list when 'apply' then 0 else 1 end, ${hasB2b('s')} desc, c.name collate nocase`;

// One row per posting, in SIGNAL_ORDER; in a signal live postings before gone ones, within each B2B postings first,
// then the other contract postings.
const rowsQuery = (where: string) => `
  select s.id, s.run_date, s.list, s.status, c.id as company_id, c.name, c.country, c.ats_vendor, c.warm,
    p.title, p.location, p.url, p.route, p.route_reason, p.gone_at is not null as gone, c.kind
  from signals s join companies c on c.id = s.company_id, json_each(s.ref_ids) j join postings p on p.id = j.value
  where ${where}
  order by ${SIGNAL_ORDER}, p.gone_at is not null,
    case when p.route_reason like 'b2b:%' then 0 when p.route = 'apply' then 1 else 2 end, p.title`;

// Pending on :run_date: new and never sent (also from a night notify did not run), or snoozed and now due.
const pending = (s: string) =>
  `((${s}.status = 'new' and ${s}.run_date <= :run_date) or (${s}.status = 'snoozed' and ${s}.snooze_until <= :run_date))`;

// At least one of the signal's postings is still on the company's board.
const hasLive = (s: string) =>
  `exists (select 1 from json_each(${s}.ref_ids) lj cross join postings lp on lp.id = lj.value where lp.gone_at is null)`;

// A newer pending signal only counts while it has a live posting, so an emptied newer signal never hides an older live one.
const newerPending = (s: string) =>
  `exists (select 1 from signals n where n.company_id = ${s}.company_id and n.run_date > ${s}.run_date and ${pending('n')} and ${hasLive('n')})`;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const visibleLength = (html: string) =>
  html.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"' })[e]!).length;

// Every posting of the signal, gone ones included (last, marked by render).
export function signalRows(db: DatabaseSync, signalId: string): SignalRow[] {
  const rows = db.prepare(rowsQuery('s.id = :id')).all({ id: signalId }) as unknown as SignalRow[];
  if (!rows.length) throw new Error(`signal ${signalId} has no postings`);
  return rows;
}

// One signal, whatever its status; the server re-renders with it.
export function signalMessage(db: DatabaseSync, signalId: string): DigestMessage {
  return render(signalRows(db, signalId));
}

function render(rows: SignalRow[]): DigestMessage {
  const { id, list, name, country, warm, kind } = rows[0];
  const lines = [
    `${warm ? '🔥 warm · ' : ''}<b>${escapeHtml(name)}</b> · ${escapeHtml(withFlag(country))} · <b>${list.toUpperCase()}</b>${kindTag(kind)}`,
  ];
  let length = visibleLength(lines[0]);
  for (const [i, p] of rows.entries()) {
    const link = `<a href="${escapeHtml(p.url)}">${escapeHtml(p.title)}</a>`;
    const line = `• ${p.gone ? `<s>${link}</s>` : link} — ${escapeHtml(p.location ?? 'no location')}` +
      ` [${escapeHtml(routeTag(p.route_reason))}]${p.gone ? ` · ${GONE}` : ''}`;
    length += 1 + visibleLength(line);
    if (length > MAX_VISIBLE) {
      lines.push(`… and ${rows.length - i} more`);
      break;
    }
    lines.push(line);
  }

  const id16 = id.slice(0, CALLBACK_ID_LEN);
  const first = list === 'apply'
    ? { text: 'Applied', callback_data: `applied:${id16}` }
    : { text: 'Compose', callback_data: `compose:${id16}` };
  const buttons = [[
    first, { text: 'Skip', callback_data: `skip:${id16}` }, { text: 'Snooze 7d', callback_data: `snooze:${id16}` },
    { text: 'Later', callback_data: `later:${id16}` },
  ]];
  return { signal_ids: [id], text: lines.join('\n'), buttons };
}

// --- Employer overview -----------------------------------------------------------------------------------------------
// All pending employer signals go out as one overview message a night, one line per company. The per-company actions
// (applied, skip, snooze, later) are on the overview page's Pending tab, so the message has no per-signal buttons.

// Where an employer posting may be worked from, from the location tag at the end of its route_reason (core/filter.ts:
// `employer · remote:europe`, `employer · hybrid:HR`, `b2b:… · payroll · remote:global`). Croatia is any `:HR` tag and
// `onsite:split` (the city Split); then the scopes employerRule() in core/location.ts tags; anything else last, as written.
const SCOPES = ['remote:europe', 'remote:emea', 'remote:global', 'remote:unstated'];
export function employerScope(reason: string): { rank: number; word: string } {
  const tag = reason.split(' · ').at(-1) ?? '';
  if (/:HR\b/.test(tag) || tag === 'onsite:split') return { rank: 0, word: HOME };
  const i = SCOPES.indexOf(tag);
  return i >= 0 ? { rank: i + 1, word: tag.slice('remote:'.length) } : { rank: SCOPES.length + 1, word: tag };
}

// `b2b` when a posting has a B2B reason, else `contract` when one has a title or body contract reason, else nothing.
function contractWord(rows: SignalRow[]): string | null {
  if (rows.some((r) => r.route_reason.startsWith('b2b:'))) return 'b2b';
  return rows.some((r) => /^(title|body):/.test(r.route_reason)) ? 'contract' : null;
}

const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' });

// One employer signal on the overview: its live postings ordered by scope then title, the best scope among them.
export interface EmployerEntry { rows: SignalRow[]; rank: number; scope: string; contract: string | null }

// Ordered by scope, then warm, then name. Shared with core/publish.ts, so summary.md lists employers in the same order.
export function employerEntries(signals: SignalRow[][]): EmployerEntry[] {
  return signals.filter((rows) => rows.length).map((rows) => {
    const sorted = rows.map((r) => ({ r, s: employerScope(r.route_reason) }))
      .sort((a, b) => a.s.rank - b.s.rank || byName(a.r.title, b.r.title) || (a.r.url < b.r.url ? -1 : a.r.url > b.r.url ? 1 : 0));
    const best = sorted[0].s;
    return { rows: sorted.map((x) => x.r), rank: best.rank, scope: best.word, contract: contractWord(rows) };
  }).sort((a, b) => a.rank - b.rank || b.rows[0].warm - a.rows[0].warm || byName(a.rows[0].name, b.rows[0].name) ||
    (a.rows[0].id < b.rows[0].id ? -1 : 1));
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// `<b>n8n</b> 🇭🇷 · 2 · <a>…</a>, <a>…</a>`, `<b>Supabase</b> · global · 4 · <a>…</a>, +3`: at most maxTitles links.
function employerLine(e: EmployerEntry, maxTitles: number): string {
  const { name, warm } = e.rows[0];
  const scope = e.scope === HOME ? ` ${flag(HOME)}` : ` · ${escapeHtml(e.scope)}`;
  const links = e.rows.slice(0, maxTitles).map((p) => `<a href="${escapeHtml(p.url)}">${escapeHtml(p.title)}</a>`);
  const rest = e.rows.length - links.length;
  return `${warm ? '🔥 ' : ''}<b>${escapeHtml(name)}</b>${scope}${e.contract ? ` · ${e.contract}` : ''} · ${e.rows.length} · ` +
    `${links.join(', ')}${rest ? `, +${rest}` : ''}`;
}

// `${PIPELINE_UI_URL}/#pending`, the overview page's Pending tab, when the value is an http(s) URL; otherwise null.
export function dashboardUrl(value: string | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hash = 'pending';
  return url.href;
}

// The log line when the overview goes out without its Open dashboard button; null when the value is usable. The value
// itself is not repeated: it is an address, but a mistyped variable could hold anything.
export function dashboardWarning(value: string | undefined): string | null {
  if (dashboardUrl(value)) return null;
  const why = value ? 'is set but is not an http(s) URL' : 'is not set';
  return `notify: WARNING: PIPELINE_UI_URL ${why}, so the employer overview has no Open dashboard button`;
}

// The overview, one message when it fits under MAX_VISIBLE with three titles per company, else with one; if one title
// per company is still too long, several messages split at company boundaries, each headed `(i/n)`. The Open dashboard
// button goes under the last one, only with a dashboard URL. Empty without employer signals.
export function employerOverview(entries: EmployerEntry[], runDate: string, dashboard: string | null): DigestMessage[] {
  if (!entries.length) return [];
  const roles = entries.reduce((n, e) => n + e.rows.length, 0);
  const head = (part: string) =>
    `<b>Employers ${escapeHtml(runDate)}${part}</b> · ${count(entries.length, 'company', 'companies')} · ${count(roles, 'role', 'roles')}`;

  let parts: { lines: string[]; ids: string[] }[] | undefined;
  for (const max of [3, 1]) {
    const lines = entries.map((e) => employerLine(e, max));
    const text = [head(''), ...lines].join('\n');
    if (visibleLength(text) <= MAX_VISIBLE && entityCount(text) <= MAX_ENTITIES) {
      parts = [{ lines, ids: entries.map((e) => e.rows[0].id) }];
      break;
    }
  }
  if (!parts) {
    // Room for the widest part label: there are never more parts than companies.
    const reserved = visibleLength(head(` (${entries.length}/${entries.length})`));
    const headEntities = entityCount(head(''));
    parts = [];
    let length = 0;
    let entities = 0;
    for (const e of entries) {
      const line = employerLine(e, 1);
      const add = 1 + visibleLength(line);
      const last = parts.at(-1);
      if (last && length + add <= MAX_VISIBLE && entities + entityCount(line) <= MAX_ENTITIES) {
        last.lines.push(line);
        last.ids.push(e.rows[0].id);
        length += add;
        entities += entityCount(line);
      } else {
        parts.push({ lines: [line], ids: [e.rows[0].id] });
        length = reserved + add;
        entities = headEntities + entityCount(line);
      }
    }
  }

  const n = parts.length;
  return parts.map((p, i) => ({
    signal_ids: p.ids,
    text: [head(n > 1 ? ` (${i + 1}/${n})` : ''), ...p.lines].join('\n'),
    buttons: i === n - 1 && dashboard ? [[{ text: 'Open dashboard', url: dashboard }]] : [],
  }));
}

// Titles for a Compose draft: live postings only, all of them when none is live, each once, at most ten
// (more reads as a dump; the message carries the full list).
export function composeTitles(rows: SignalRow[]): string[] {
  const live = rows.filter((r) => !r.gone);
  return [...new Set((live.length ? live : rows).map((r) => r.title))].slice(0, 10);
}

// Pending signals, only the newest per company, grouped by signal in digest order, live postings only: a signal
// with none left is not pending. Shared with core/publish.ts so the out/ files and the Telegram messages carry the same set.
export function pendingSignals(db: DatabaseSync, runDate: string): Map<string, SignalRow[]> {
  const rows = db.prepare(rowsQuery(`${pending('s')} and p.gone_at is null and not ${newerPending('s')}`))
    .all({ run_date: runDate }) as unknown as SignalRow[];
  const bySignal = new Map<string, SignalRow[]>();
  for (const r of rows) bySignal.set(r.id, [...(bySignal.get(r.id) ?? []), r]);
  return bySignal;
}

// Same count as report() in core/filter.ts.
export function droppedCount(db: DatabaseSync, runDate: string): number {
  return (db.prepare(`
    select count(distinct p.id) as dropped
    from events e join postings p on p.id = e.posting_id join companies c on c.id = e.company_id
    where e.run_date = :run_date and e.kind != 'posting_gone' and c.status = 'active' and p.route = 'drop'`)
    .get({ run_date: runDate }) as { dropped: number }).dropped;
}

// Pure: the output matches before and after expireGone() and supersede(). Empty when there is nothing to send.
// The header, the agency signals one message each, then the employer overview. The header counts agency apply and
// outreach signals and employer signals apart. dashboard: dashboardUrl() of PIPELINE_UI_URL.
export function buildDigest(db: DatabaseSync, runDate: string, dashboard: string | null = null): DigestMessage[] {
  const bySignal = pendingSignals(db, runDate);
  if (!bySignal.size) return [];

  const dropped = droppedCount(db, runDate);
  const all = [...bySignal.values()];
  const agencies = all.filter((ps) => ps[0].kind !== 'employer');
  const employers = employerEntries(all.filter((ps) => ps[0].kind === 'employer'));
  const apply = agencies.filter((ps) => ps[0].list === 'apply').length;
  const header = `<b>Digest ${escapeHtml(runDate)}</b> · ${apply} apply · ${agencies.length - apply} outreach · ` +
    `${employers.length} employers · ${dropped} dropped postings`;
  return [
    { signal_ids: [], text: header, buttons: [] }, ...agencies.map(render), ...employerOverview(employers, runDate, dashboard),
  ];
}

// Pending signals whose postings have all left the company's board. Runs before supersede().
export function expireGone(db: DatabaseSync, runDate: string): number {
  return Number(db.prepare(`
    update signals set status = 'skipped', skip_reason = 'gone', updated_at = datetime('now')
    where ${pending('signals')} and not ${hasLive('signals')}`).run({ run_date: runDate }).changes);
}

// Older pending signals of a company are superseded by its newest one, so one message per company and never both lists.
export function supersede(db: DatabaseSync, runDate: string): number {
  return Number(db.prepare(`
    update signals set status = 'skipped', skip_reason = 'superseded', updated_at = datetime('now')
    where ${pending('signals')} and ${newerPending('signals')}`).run({ run_date: runDate }).changes);
}

// Marks the signals of each message notified with its message id right after its send, all of one message in one
// transaction, so a crash mid-run resumes without re-sending. The employer overview shares one message id among all
// the signals it lists; nothing reads the id back to edit the message (the bot edits the message a button was pressed on).
export async function sendDigest(db: DatabaseSync, messages: DigestMessage[], send: (m: DigestMessage) => Promise<number>): Promise<void> {
  const markNotified = db.prepare(`
    update signals set status = 'notified', telegram_message_id = :message_id, snooze_until = null, updated_at = datetime('now')
    where id = :id`);
  for (const m of messages) {
    const messageId = await send(m);
    if (!m.signal_ids.length) continue;
    db.exec('begin');
    try {
      for (const id of m.signal_ids) markNotified.run({ id, message_id: String(messageId) });
      db.exec('commit');
    } catch (err) {
      db.exec('rollback');
      throw err;
    }
  }
}

async function main() {
  const runDate = process.env.RUN_DATE ?? new Date().toISOString().slice(0, 10);
  const db = openDb();
  try {
    // Dry run writes nothing; buildDigest already leaves emptied and superseded signals out. Expire first, so
    // supersede never retires a live older signal in favour of an emptied newer one.
    if (!process.env.TELEGRAM_DRY_RUN) {
      expireGone(db, runDate);
      supersede(db, runDate);
    }
    // Stamped here unless the nightly script, which stamps every line itself, runs us.
    const warning = dashboardWarning(process.env.PIPELINE_UI_URL);
    if (warning) console.warn(process.env.PIPELINE_LOG_STAMPED ? warning : `${stamp()} ${warning}`);
    const messages = buildDigest(db, runDate, dashboardUrl(process.env.PIPELINE_UI_URL));
    const n = messages.reduce((k, m) => k + m.signal_ids.length, 0);
    if (process.env.TELEGRAM_DRY_RUN) {
      for (const m of messages) {
        console.log(m.text);
        const label = (b: InlineKeyboardButton) => ('url' in b ? `${b.text} (${b.url})` : b.text);
        if (m.buttons.length) console.log(`buttons: ${m.buttons.flat().map(label).join(' | ')}`);
        console.log('');
      }
      console.log(`notify ${runDate}: ${n} signals (dry run, nothing sent)`);
      return;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required in the environment');
    const bot = new Bot(token);
    let first = true;
    await sendDigest(db, messages, async (m) => {
      // Telegram allows about one message per second per chat.
      if (!first) await sleep(1000);
      first = false;
      const options = {
        parse_mode: 'HTML', link_preview_options: { is_disabled: true },
        reply_markup: m.buttons.length ? { inline_keyboard: m.buttons } : undefined,
      } as const;
      let sent;
      try {
        sent = await bot.api.sendMessage(chatId, m.text, options);
      } catch (err) {
        if (err instanceof GrammyError && err.error_code === 429) {
          await sleep((err.parameters.retry_after ?? 1) * 1000);
          sent = await bot.api.sendMessage(chatId, m.text, options);
        } else if (err instanceof GrammyError && err.error_code === 400 && m.buttons.flat().some((b) => 'url' in b)) {
          // Telegram refuses some addresses in a URL button. The overview matters more than its button: send it without,
          // or the employer signals would stay unsent and fail the same way every night.
          console.error(`notify: WARNING: Telegram refused the Open dashboard button (${err.description}); sent without it`);
          sent = await bot.api.sendMessage(chatId, m.text, { ...options, reply_markup: undefined });
        } else throw err;
      }
      return sent.message_id;
    });
    console.log(`notify ${runDate}: ${n} signals sent`);
  } finally {
    db.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
