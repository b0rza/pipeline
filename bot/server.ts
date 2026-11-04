// Long-running grammy bot: handles the digest's buttons for the owner's chat and nothing else.
import type { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { Bot } from 'grammy';
import type { InlineKeyboardButton } from 'grammy/types';
import { openDb } from '../core/db.ts';
import { CALLBACK_ID_LEN, escapeHtml, signalMessage, signalRows, visibleLength } from './notify.ts';
import { composeBody, composeMailto, composeSubject } from './templates.ts';

export const SKIP_REASONS: readonly (readonly [code: string, label: string])[] = [
  ['fit', 'bad fit'], ['geo', 'wrong geography'], ['noneng', 'not engineering'], ['contacted', 'already contacted'], ['other', 'other'],
];

const CALLBACK = new RegExp(`^([a-z]+):([0-9a-f]{${CALLBACK_ID_LEN}})(?::([a-z]+))?$`);

// Undefined unless the prefix names exactly one signal.
export function findSignal(db: DatabaseSync, prefix: string): string | undefined {
  const rows = db.prepare('select id from signals where id like :prefix').all({ prefix: prefix + '%' }) as { id: string }[];
  return rows.length === 1 ? rows[0].id : undefined;
}

export function markApplied(db: DatabaseSync, id: string): void {
  db.prepare("update signals set status = 'applied', updated_at = datetime('now') where id = :id").run({ id });
}

export function markSkipped(db: DatabaseSync, id: string, reason: string): void {
  db.prepare("update signals set status = 'skipped', skip_reason = :reason, updated_at = datetime('now') where id = :id")
    .run({ id, reason });
}

// Counted from the day the button is pressed, so a re-sent signal snoozed again waits another week.
export function snooze(db: DatabaseSync, id: string, today: string): string {
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  db.prepare("update signals set status = 'snoozed', snooze_until = :until, updated_at = datetime('now') where id = :id")
    .run({ id, until });
  return until;
}

// Back to new, so the next digest carries it again.
export function reopen(db: DatabaseSync, id: string): void {
  db.prepare("update signals set status = 'new', skip_reason = null, snooze_until = null, updated_at = datetime('now') where id = :id")
    .run({ id });
}

export type Outcome = { kind: 'edit'; text: string; buttons: InlineKeyboardButton[][] } | { kind: 'reply'; text: string };

// data is `${action}:${id16}`, or `skip:${id16}:${code}` once a reason is picked.
export function handleCallback(db: DatabaseSync, data: string, today = new Date().toISOString().slice(0, 10)): Outcome | null {
  const [, action, id16, code] = data.match(CALLBACK) ?? [];
  const id = id16 && findSignal(db, id16);
  if (!id) return null;
  const done = (note: string): Outcome => ({ kind: 'edit', text: `${signalMessage(db, id).text}\n\n${note}`, buttons: [] });

  switch (action) {
    case 'applied':
      markApplied(db, id);
      return done('✅ applied');
    case 'skip': {
      if (!code) {
        const reasons = SKIP_REASONS.map(([c, label]) => ({ text: label, callback_data: `skip:${id16}:${c}` }));
        return { kind: 'edit', text: signalMessage(db, id).text, buttons: [reasons.slice(0, 3), reasons.slice(3)] };
      }
      const label = SKIP_REASONS.find(([c]) => c === code)?.[1];
      if (!label) return null;
      markSkipped(db, id, label);
      return done(`⏭ skipped: ${escapeHtml(label)}`);
    }
    case 'snooze':
      return done(`💤 snoozed until ${snooze(db, id, today)}`);
    case 'compose': {
      const rows = signalRows(db, id);
      const name = rows[0].name;
      // More than ten roles reads as a dump; the digest message carries the full list.
      const titles = [...new Set(rows.map((r) => r.title))].slice(0, 10);
      const body = composeBody(name, titles).replaceAll('\r\n', '\n');
      const draft = `<b>${escapeHtml(composeSubject(name))}</b>\n\n${escapeHtml(body)}`;
      const text = `${draft}\n\n<code>${escapeHtml(composeMailto(name, titles))}</code>`;
      // Telegram caps a message at 4096 characters; the mailto repeats every title URL-encoded, so drop it first.
      return { kind: 'reply', text: visibleLength(text) > 4000 ? `${draft}\n\n(mailto link omitted: too long)` : text };
    }
  }
  return null;
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !process.env.TELEGRAM_CHAT_ID) throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required in the environment');
  const chatId = Number(process.env.TELEGRAM_CHAT_ID);
  const db = openDb();
  const bot = new Bot(token);

  bot.on('callback_query:data', async (ctx) => {
    // Everything outside the owner's chat is ignored, unanswered.
    if (ctx.chat?.id !== chatId) return;
    const outcome = handleCallback(db, ctx.callbackQuery.data);
    if (!outcome) {
      await ctx.answerCallbackQuery({ text: 'unknown signal' });
      return;
    }
    // Answered first: a double tap fails the second identical edit (400 not modified), and the spinner must still stop.
    await ctx.answerCallbackQuery();
    const options = { parse_mode: 'HTML', link_preview_options: { is_disabled: true } } as const;
    if (outcome.kind === 'edit') {
      await ctx.editMessageText(outcome.text, { ...options, reply_markup: { inline_keyboard: outcome.buttons } });
    } else {
      await ctx.reply(outcome.text, { ...options, reply_parameters: { message_id: ctx.msgId! } });
    }
  });
  bot.catch((err) => console.error(err));

  // stop() resolves start(), whose finally closes the DB; close() throws on a closed DB, so only there.
  const shutdown = async () => {
    await bot.stop();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  // Long polling; no port.
  try {
    await bot.start({ onStart: () => console.log(`bot: listening for callbacks from chat ${chatId}`) });
  } finally {
    db.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
