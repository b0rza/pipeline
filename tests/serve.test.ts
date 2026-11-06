import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { startBot } from '../bot/server.ts';
import { serve, type Deps } from '../scripts/serve.ts';
import type { Running } from '../ui/server.ts';

// A stand-in service: records calls; done settles on stop(), or earlier through fail().
function fake(log: string[], name: string, stopHangs = false) {
  let settle!: (err?: Error) => void;
  const done = new Promise<void>((resolve, reject) => (settle = (err) => (err ? reject(err) : resolve())));
  done.catch(() => {});
  const service: Running = {
    done,
    stop: async () => {
      log.push(`${name} stop`);
      if (stopHangs) return new Promise<void>(() => {});
      settle();
    },
  };
  return { service, fail: (err: Error) => settle(err) };
}

const deps = (over: Partial<Deps>): Deps & { signals: EventEmitter } =>
  ({ startBot: () => assert.fail('no bot'), startUi: () => assert.fail('no ui'), signals: new EventEmitter(), graceMs: 1000, ...over }) as Deps & { signals: EventEmitter };

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('the real startBot throws the "are required" error without the Telegram settings, and serve never starts the page', async () => {
  for (const env of [{}, { TELEGRAM_BOT_TOKEN: 'x' }, { TELEGRAM_CHAT_ID: '1' }]) {
    assert.throws(() => startBot(env), /TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required/);
  }
  let uiStarted = false;
  await assert.rejects(
    serve(deps({ startBot: () => startBot({}), startUi: async () => ((uiStarted = true), fake([], 'ui').service) })),
    /are required/,
  );
  assert.equal(uiStarted, false);
});

test('SIGTERM and SIGINT stop both services and give exit code 0', async () => {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    const log: string[] = [];
    const d = deps({ startBot: () => fake(log, 'bot').service, startUi: async () => fake(log, 'ui').service });
    const code = serve(d);
    await tick();
    assert.deepEqual(log, []);
    d.signals.emit(signal);
    assert.equal(await code, 0);
    assert.deepEqual(log.sort(), ['bot stop', 'ui stop']);
  }
});

test('a page that cannot bind its port stops the bot and gives a non-zero exit code', async () => {
  const log: string[] = [];
  const code = await serve(deps({
    startBot: () => fake(log, 'bot').service,
    startUi: async () => { throw Object.assign(new Error('listen EADDRINUSE: address already in use 127.0.0.1:8787'), { code: 'EADDRINUSE' }); },
  }));
  assert.equal(code, 1);
  assert.deepEqual(log, ['bot stop']);
});

test('either service failing on its own stops the other and gives a non-zero exit code', async () => {
  for (const failing of ['bot', 'ui'] as const) {
    const log: string[] = [];
    const bot = fake(log, 'bot');
    const ui = fake(log, 'ui');
    const code = serve(deps({ startBot: () => bot.service, startUi: async () => ui.service }));
    await tick();
    (failing === 'bot' ? bot : ui).fail(new Error(`${failing} crashed`));
    assert.equal(await code, 1);
    assert.deepEqual(log.sort(), ['bot stop', 'ui stop']);
  }
});

test('a stop that hangs is given up after the grace period with a non-zero exit code', async () => {
  const log: string[] = [];
  const d = deps({ startBot: () => fake(log, 'bot', true).service, startUi: async () => fake(log, 'ui').service, graceMs: 50 });
  const code = serve(d);
  await tick();
  const started = Date.now();
  d.signals.emit('SIGTERM');
  assert.equal(await code, 1);
  assert.ok(Date.now() - started < 1000);
  assert.deepEqual(log.sort(), ['bot stop', 'ui stop']);
});
