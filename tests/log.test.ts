import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stamp, stampConsole } from '../core/log.ts';

// A stand-in console that records each call's arguments.
function fakeConsole() {
  const calls: { method: string; args: unknown[] }[] = [];
  const rec = (method: string) => (...args: unknown[]) => void calls.push({ method, args });
  return { calls, target: { log: rec('log'), info: rec('info'), warn: rec('warn'), error: rec('error') } };
}

const at = new Date(2026, 10, 6, 9, 4, 7); // local time, 6 November 2026 09:04:07

test('stamp is local date and time, zero-padded', () => {
  assert.equal(stamp(at), '2026-11-06 09:04:07');
  assert.match(stamp(), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

test('stampConsole puts the stamp in front of every method and keeps format strings working', () => {
  const { calls, target } = fakeConsole();
  stampConsole(target, () => at);
  target.log('ui: %s', 'http://127.0.0.1:8787/');
  target.info('bot: listening');
  target.warn('n=%d', 3);
  target.error('serve: bot failed, stopping');
  assert.deepEqual(calls, [
    { method: 'log', args: ['2026-11-06 09:04:07 ui: http://127.0.0.1:8787/'] },
    { method: 'info', args: ['2026-11-06 09:04:07 bot: listening'] },
    { method: 'warn', args: ['2026-11-06 09:04:07 n=3'] },
    { method: 'error', args: ['2026-11-06 09:04:07 serve: bot failed, stopping'] },
  ]);
});

test('an error dump gets the stamp once, at its start', () => {
  const { calls, target } = fakeConsole();
  stampConsole(target, () => at);
  target.error(new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required in the environment'));
  const [out] = calls[0].args as string[];
  assert.ok(out.startsWith('2026-11-06 09:04:07 Error: TELEGRAM_BOT_TOKEN'));
  assert.ok(out.includes('\n    at '), 'stack follows');
  assert.equal(out.match(/2026-11-06/g)?.length, 1);
});

test('installing twice does not double the stamp', () => {
  const { calls, target } = fakeConsole();
  stampConsole(target, () => at);
  stampConsole(target, () => at);
  target.log('once');
  assert.deepEqual(calls[0].args, ['2026-11-06 09:04:07 once']);
});
