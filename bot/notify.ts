// Stage 7: send the run's signals to the owner's Telegram chat, one message per signal, with action buttons.
import type { DatabaseSync } from 'node:sqlite';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { Bot, GrammyError } from 'grammy';
import type { InlineKeyboardButton } from 'grammy/types';
import { openDb } from '../core/db.ts';

export interface DigestMessage { signal_id: string | null; text: string; buttons: InlineKeyboardButton[][] }

export interface SignalRow {
  id: string; run_date: string; list: 'apply' | 'outreach'; status: string; company_id: string; name: string; country: string;
  ats_vendor: string; warm: number; title: string; location: string | null; url: string; route: string; route_reason: string;
}

// callback_data is `${action}:${id16}`: Telegram caps it at 64 bytes and signal ids are 64-hex sha256.
export const CALLBACK_ID_LEN = 16;

// Telegram caps a message at 4096 characters after entity parsing; leave room for the status line edits add.
const MAX_VISIBLE = 3500;

// One row per posting; warm first, then apply before outreach, then by name; contract postings first in a signal.
const rowsQuery = (where: string) => `
  select s.id, s.run_date, s.list, s.status, c.id as company_id, c.name, c.country, c.ats_vendor, c.warm,
    p.title, p.location, p.url, p.route, p.route_reason
  from signals s join companies c on c.id = s.company_id, json_each(s.ref_ids) j join postings p on p.id = j.value
  where ${where}
  order by c.warm desc, case s.list when 'apply' then 0 else 1 end, c.name collate nocase, case p.route when 'apply' then 0 else 1 end, p.title`;

// Pending on :run_date: new and never sent (also from a night notify did not run), or snoozed and now due.
const pending = (s: string) =>
  `((${s}.status = 'new' and ${s}.run_date <= :run_date) or (${s}.status = 'snoozed' and ${s}.snooze_until <= :run_date))`;

const newerPending = (s: string) =>
  `exists (select 1 from signals n where n.company_id = ${s}.company_id and n.run_date > ${s}.run_date and ${pending('n')})`;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const visibleLength = (html: string) =>
  html.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"' })[e]!).length;

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
  const { id, list, name, country, ats_vendor, warm } = rows[0];
  const lines = [
    `${warm ? '🔥 warm · ' : ''}<b>${escapeHtml(name)}</b> · ${escapeHtml(country)} · ${escapeHtml(ats_vendor)} · <b>${list.toUpperCase()}</b>`,
  ];
  let length = visibleLength(lines[0]);
  for (const [i, p] of rows.entries()) {
    const reason = p.route === 'apply' ? ` [${escapeHtml(p.route_reason)}]` : '';
    const line = `• <a href="${escapeHtml(p.url)}">${escapeHtml(p.title)}</a> — ${escapeHtml(p.location ?? 'no location')}${reason}`;
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
  const buttons = [[first, { text: 'Skip', callback_data: `skip:${id16}` }, { text: 'Snooze 7d', callback_data: `snooze:${id16}` }]];
  return { signal_id: id, text: lines.join('\n'), buttons };
}

// Pending signals, only the newest per company, grouped by signal in digest order. Shared with core/publish.ts
// so the out/ files and the Telegram messages carry the same set.
export function pendingSignals(db: DatabaseSync, runDate: string): Map<string, SignalRow[]> {
  const rows = db.prepare(rowsQuery(`${pending('s')} and not ${newerPending('s')}`))
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

// Pure: the output matches before and after supersede(). Empty when there is nothing to send.
export function buildDigest(db: DatabaseSync, runDate: string): DigestMessage[] {
  const bySignal = pendingSignals(db, runDate);
  if (!bySignal.size) return [];

  const dropped = droppedCount(db, runDate);
  const signals = [...bySignal.values()].map(render);
  const apply = [...bySignal.values()].filter((ps) => ps[0].list === 'apply').length;
  const header = `<b>Digest ${escapeHtml(runDate)}</b> · ${apply} apply · ${signals.length - apply} outreach · ${dropped} dropped postings`;
  return [{ signal_id: null, text: header, buttons: [] }, ...signals];
}

// Older pending signals of a company are superseded by its newest one, so one message per company and never both lists.
export function supersede(db: DatabaseSync, runDate: string): number {
  return Number(db.prepare(`
    update signals set status = 'skipped', skip_reason = 'superseded', updated_at = datetime('now')
    where ${pending('signals')} and ${newerPending('signals')}`).run({ run_date: runDate }).changes);
}

// Marks each signal notified right after its send, so a crash mid-run resumes without re-sending.
export async function sendDigest(db: DatabaseSync, messages: DigestMessage[], send: (m: DigestMessage) => Promise<number>): Promise<void> {
  const markNotified = db.prepare(`
    update signals set status = 'notified', telegram_message_id = :message_id, snooze_until = null, updated_at = datetime('now')
    where id = :id`);
  for (const m of messages) {
    const messageId = await send(m);
    if (m.signal_id) markNotified.run({ id: m.signal_id, message_id: String(messageId) });
  }
}

async function main() {
  const runDate = process.env.RUN_DATE ?? new Date().toISOString().slice(0, 10);
  const db = openDb();
  try {
    // Dry run writes nothing; buildDigest already leaves superseded signals out.
    if (!process.env.TELEGRAM_DRY_RUN) supersede(db, runDate);
    const messages = buildDigest(db, runDate);
    const n = messages.filter((m) => m.signal_id).length;
    if (process.env.TELEGRAM_DRY_RUN) {
      for (const m of messages) {
        console.log(m.text);
        if (m.buttons.length) console.log(`buttons: ${m.buttons.flat().map((b) => b.text).join(' | ')}`);
        console.log('');
      }
      console.log(`notify ${runDate}: ${n} signals (dry run, nothing sent)`);
      return;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required; run via op run');
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
        if (!(err instanceof GrammyError && err.error_code === 429)) throw err;
        await sleep((err.parameters.retry_after ?? 1) * 1000);
        sent = await bot.api.sendMessage(chatId, m.text, options);
      }
      return sent.message_id;
    });
    console.log(`notify ${runDate}: ${n} signals sent`);
  } finally {
    db.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
