// One process for the container: the Telegram button handler and the overview page side by side, each with its own
// database connection. Missing Telegram settings, a port that cannot be bound, or either one failing later stops both
// and exits non-zero, so neither runs alone. SIGTERM or SIGINT stops both and exits 0.
import { pathToFileURL } from 'node:url';
import { startBot } from '../bot/server.ts';
import { startUi, type Running } from '../ui/server.ts';

export interface Deps {
  startBot: () => Running;
  startUi: () => Promise<Running>;
  signals: { once(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown };
  // How long a stop may take before the launcher gives up on it; Docker kills after 10 seconds.
  graceMs: number;
}

// True if p settled within ms.
async function within(p: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), ms)));
  try {
    return await Promise.race([p.then(() => true, () => true), late]);
  } finally {
    clearTimeout(timer);
  }
}

// Resolves to the exit code; throws the bot's "are required" error before the page starts.
export async function serve({ startBot, startUi, signals, graceMs }: Deps): Promise<number> {
  const signalled = new Promise<string>((resolve) => {
    signals.once('SIGTERM', () => resolve('SIGTERM'));
    signals.once('SIGINT', () => resolve('SIGINT'));
  });
  const bot = startBot();
  let ui: Running;
  try {
    ui = await startUi();
  } catch (err) {
    console.error(err);
    await within(bot.stop(), graceMs);
    return 1;
  }

  const ended = (name: string, r: Running) =>
    r.done.then(() => `${name} stopped on its own`, (err) => (console.error(err), `${name} failed`));
  const reason = await Promise.race([signalled, ended('bot', bot), ended('ui', ui)]);
  const bySignal = reason === 'SIGTERM' || reason === 'SIGINT';
  console.log(`serve: ${reason}, stopping`);
  const clean = await within(Promise.all([bot.stop(), ui.stop()]), graceMs);
  if (!clean) console.error(`serve: shutdown did not finish within ${graceMs} ms`);
  return bySignal && clean ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // Exits explicitly, so nothing left on the event loop can hold the container past its stop.
  serve({ startBot, startUi, signals: process, graceMs: 5000 }).then(
    (code) => process.exit(code),
    (err) => (console.error(err), process.exit(1)),
  );
}
