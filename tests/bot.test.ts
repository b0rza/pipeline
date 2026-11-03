import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { buildDigest, escapeHtml, sendDigest, signalMessage, supersede, visibleLength } from '../bot/notify.ts';
import { handleCallback } from '../bot/server.ts';
import { composeBody, composeMailto, composeSubject } from '../bot/templates.ts';
import { upsertCompanies } from '../core/companies.ts';
import { openDb } from '../core/db.ts';
import { diffRun } from '../core/diff.ts';
import { filterRun } from '../core/filter.ts';
import { snapshotCompany } from '../core/snapshot.ts';
import type { Company, NormalizedPosting } from '../core/types.ts';

const company = (id: string, extra: Partial<Company> = {}): Company => ({
  id, name: id, domain: `${id}.test`, country: 'GB', phases: ['p1'],
  source: 'test', ats: { vendor: 'greenhouse', slug: id }, storefront: null, status: 'active', warm: false, ...extra,
});

const posting = (external_id: string, title: string, body = ''): NormalizedPosting => ({
  external_id, title, location: 'London', url: `https://example.test/${external_id}`, body, posted_at: null, raw: {},
});

const seed = (db: DatabaseSync, entries: [Company, NormalizedPosting[]][], runDate = '2026-11-02') => {
  upsertCompanies(db, entries.map(([c]) => c));
  for (const [c, ps] of entries) snapshotCompany(db, c, ps, runDate);
  diffRun(db, runDate);
  filterRun(db, runDate);
};

const status = (db: DatabaseSync, companyId: string) =>
  ({ ...db.prepare('select status, skip_reason, snooze_until from signals where company_id = ?').get(companyId) });

// The 16-hex prefix the buttons carry.
const id16 = (db: DatabaseSync, companyId: string) =>
  (db.prepare('select id from signals where company_id = ?').get(companyId) as { id: string }).id.slice(0, 16);

const standard = (db: DatabaseSync) => seed(db, [
  [company('beta'), [posting('b1', 'Software Engineer')]],
  [company('alpha'), [posting('a1', 'Frontend Developer'), posting('a2', 'Engineering Talent Pool')]],
  [company('zeta'), [posting('z1', 'Backend Engineer'), posting('z2', 'Senior Software Engineer, Contract')]],
  [company('warmco', { warm: true }), [posting('w1', 'Solutions Architect')]],
]);

test('buildDigest orders warm, then apply, then outreach, contract postings first', () => {
  const db = openDb(':memory:');
  standard(db);
  const digest = buildDigest(db, '2026-11-02');
  assert.equal(digest.length, 5);
  assert.deepEqual(digest.slice(1).map((m) => m.text.split('\n')[0]), [
    '🔥 warm · <b>warmco</b> · GB · greenhouse · <b>OUTREACH</b>',
    '<b>zeta</b> · GB · greenhouse · <b>APPLY</b>',
    '<b>alpha</b> · GB · greenhouse · <b>OUTREACH</b>',
    '<b>beta</b> · GB · greenhouse · <b>OUTREACH</b>',
  ]);
  assert.deepEqual(digest[2].text.split('\n').slice(1), [
    '• <a href="https://example.test/z2">Senior Software Engineer, Contract</a> — London [title:contract]',
    '• <a href="https://example.test/z1">Backend Engineer</a> — London',
  ]);
  db.close();
});

test('buildDigest header counts apply and outreach signals and dropped postings', () => {
  const db = openDb(':memory:');
  standard(db);
  const [header] = buildDigest(db, '2026-11-02');
  assert.deepEqual(header, {
    signal_id: null, text: '<b>Digest 2026-11-02</b> · 1 apply · 3 outreach · 1 dropped postings', buttons: [],
  });
  db.close();
});

test('buildDigest buttons: Compose for outreach, Applied for apply, none on the header', () => {
  const db = openDb(':memory:');
  standard(db);
  const [header, warm, apply] = buildDigest(db, '2026-11-02');
  assert.deepEqual(header.buttons, []);
  assert.deepEqual(warm.buttons.map((row) => row.map((b) => b.text)), [['Compose', 'Skip', 'Snooze 7d']]);
  assert.deepEqual(apply.buttons.map((row) => row.map((b) => b.text)), [['Applied', 'Skip', 'Snooze 7d']]);
  const id = id16(db, 'warmco');
  assert.match(id, /^[0-9a-f]{16}$/);
  assert.deepEqual(warm.buttons[0].map((b) => 'callback_data' in b && b.callback_data), [`compose:${id}`, `skip:${id}`, `snooze:${id}`]);
  assert.equal(warm.signal_id!.slice(0, 16), id);
  db.close();
});

test('signal text escapes HTML', () => {
  const db = openDb(':memory:');
  seed(db, [[company('ab', { name: 'A&B <Co>' }), [posting('1', 'Software Engineer <Platform>')]]]);
  const [, m] = buildDigest(db, '2026-11-02');
  assert.match(m.text, /^<b>A&amp;B &lt;Co&gt;<\/b>/);
  assert.match(m.text, /Software Engineer &lt;Platform&gt;/);
  assert.equal(escapeHtml('"&<>'), '&quot;&amp;&lt;&gt;');
  db.close();
});

test('signal text is capped below the Telegram limit', () => {
  const db = openDb(':memory:');
  const titles = Array.from({ length: 80 }, (_, i) => `Senior Software Engineer, Commerce Platform and Storefront Services ${i}`);
  seed(db, [[company('big'), titles.map((t, i) => posting(String(i), t))]]);
  const [, m] = buildDigest(db, '2026-11-02');
  const visible = m.text.replace(/<[^>]+>/g, '');
  assert.ok(visible.length < 4096, `${visible.length} chars`);
  const more = m.text.match(/\n… and (\d+) more$/);
  assert.ok(more);
  assert.equal(m.text.split('\n').length - 2 + Number(more[1]), 80);
  db.close();
});

test('composeMailto encodes the fixed template', () => {
  const titles = ['Senior Engineer (Contract)'];
  const url = composeMailto('Acme & Co', titles);
  assert.ok(url.startsWith('mailto:?subject='));
  const [subject, body] = url.slice('mailto:?subject='.length).split('&body=');
  assert.ok(body !== undefined);
  for (const part of [subject, body]) assert.doesNotMatch(part, /[& ]/);
  assert.equal(decodeURIComponent(subject), composeSubject('Acme & Co'));
  assert.equal(decodeURIComponent(body), composeBody('Acme & Co', titles));
  assert.equal(composeSubject('Acme & Co'), 'Acme & Co: contract storefront engineering');
  assert.match(composeBody('Acme & Co', titles), /\r\n- Senior Engineer \(Contract\)\r\n/);
});

test('buildDigest skips notified signals', () => {
  const db = openDb(':memory:');
  standard(db);
  db.prepare("update signals set status = 'notified'").run();
  assert.deepEqual(buildDigest(db, '2026-11-02'), []);
  db.close();
});

test('buildDigest re-sends a snoozed signal once it is due', () => {
  const db = openDb(':memory:');
  seed(db, [[company('acme'), [posting('1', 'Software Engineer')]]], '2026-10-26');
  db.prepare("update signals set status = 'snoozed', snooze_until = '2026-11-02'").run();
  const digest = buildDigest(db, '2026-11-02');
  assert.equal(digest.length, 2);
  assert.match(digest[1].text, /<b>acme<\/b>/);
  db.prepare("update signals set snooze_until = '2026-11-03'").run();
  assert.deepEqual(buildDigest(db, '2026-11-02'), []);
  db.close();
});

test('supersede keeps only the newest pending signal of a company', () => {
  const db = openDb(':memory:');
  const perm = posting('1', 'Software Engineer');
  seed(db, [[company('acme'), [perm]]], '2026-10-26');
  db.prepare("update signals set status = 'snoozed', snooze_until = '2026-11-02'").run();
  seed(db, [[company('acme'), [perm, posting('2', 'Software Engineer, Contract')]]]);
  const digest = buildDigest(db, '2026-11-02');
  assert.equal(digest.length, 2);
  assert.equal(digest[1].text.split('\n')[0], '<b>acme</b> · GB · greenhouse · <b>APPLY</b>');

  assert.equal(supersede(db, '2026-11-02'), 1);
  const byRun = (runDate: string) => ({ ...db.prepare('select status, skip_reason from signals where run_date = ?').get(runDate) });
  assert.deepEqual(byRun('2026-10-26'), { status: 'skipped', skip_reason: 'superseded' });
  assert.deepEqual(byRun('2026-11-02'), { status: 'new', skip_reason: null });
  assert.deepEqual(buildDigest(db, '2026-11-02'), digest);
  db.close();
});

test('buildDigest sends a new signal from a night notify did not run', () => {
  const db = openDb(':memory:');
  seed(db, [[company('acme'), [posting('1', 'Software Engineer')]]], '2026-11-01');
  seed(db, [[company('other'), [posting('2', 'Backend Engineer')]]]);
  assert.deepEqual(buildDigest(db, '2026-11-02').slice(1).map((m) => m.text.split('\n')[0]), [
    '<b>acme</b> · GB · greenhouse · <b>OUTREACH</b>',
    '<b>other</b> · GB · greenhouse · <b>OUTREACH</b>',
  ]);
  db.close();
});

test('sendDigest sends the header first and marks each signal notified with its message id', async () => {
  const db = openDb(':memory:');
  standard(db);
  db.prepare("update signals set snooze_until = '2026-11-01'").run();
  const digest = buildDigest(db, '2026-11-02');
  const sent: string[] = [];
  // push returns the new length, so message ids run 1, 2, ...
  await sendDigest(db, digest, async (m) => sent.push(m.text));
  assert.deepEqual(sent, digest.map((m) => m.text));
  assert.match(sent[0], /^<b>Digest 2026-11-02<\/b>/);
  for (const [i, m] of digest.entries()) {
    if (!m.signal_id) continue;
    assert.deepEqual({ ...db.prepare('select status, telegram_message_id, snooze_until from signals where id = ?').get(m.signal_id) }, {
      status: 'notified', telegram_message_id: String(i + 1), snooze_until: null,
    });
  }
  assert.deepEqual(buildDigest(db, '2026-11-02'), []);
  db.close();
});

test('sendDigest resumes after a failed send without re-sending', async () => {
  const db = openDb(':memory:');
  standard(db);
  const digest = buildDigest(db, '2026-11-02');
  let n = 0;
  await assert.rejects(sendDigest(db, digest, async () => {
    if (++n === 3) throw new Error('network');
    return n;
  }), /network/);
  const statusOf = (id: string) => (db.prepare('select status from signals where id = ?').get(id) as { status: string }).status;
  assert.deepEqual(digest.slice(1).map((m) => statusOf(m.signal_id!)), ['notified', 'new', 'new', 'new']);

  const rest = buildDigest(db, '2026-11-02');
  const sent: string[] = [];
  await sendDigest(db, rest, async (m) => sent.push(m.text));
  assert.deepEqual(sent, [rest[0].text, ...digest.slice(2).map((m) => m.text)]);
  assert.match(sent[0], / · 1 apply · 2 outreach · /);
  assert.deepEqual(buildDigest(db, '2026-11-02'), []);
  db.close();
});

test('handleCallback applies, skips with a reason, snoozes and composes', () => {
  const db = openDb(':memory:');
  standard(db);
  const today = '2026-11-02';

  const applied = handleCallback(db, `applied:${id16(db, 'zeta')}`, today);
  assert.ok(applied?.kind === 'edit');
  assert.ok(applied.text.endsWith('\n\n✅ applied'));
  assert.deepEqual(applied.buttons, []);
  assert.equal(status(db, 'zeta').status, 'applied');

  const pick = handleCallback(db, `skip:${id16(db, 'alpha')}`, today);
  assert.ok(pick?.kind === 'edit');
  assert.deepEqual(pick.buttons.map((row) => row.length), [3, 2]);
  assert.deepEqual(pick.buttons.flat().map((b) => b.text), ['bad fit', 'wrong geography', 'not engineering', 'already contacted', 'other']);
  assert.equal(pick.text, signalMessage(db, db.prepare("select id from signals where company_id = 'alpha'").get()!.id as string).text);
  assert.equal(status(db, 'alpha').status, 'new');

  const skipped = handleCallback(db, `skip:${id16(db, 'alpha')}:fit`, today);
  assert.ok(skipped?.text.endsWith('\n\n⏭ skipped: bad fit'));
  assert.deepEqual(status(db, 'alpha'), { status: 'skipped', skip_reason: 'bad fit', snooze_until: null });
  assert.equal(handleCallback(db, `skip:${id16(db, 'alpha')}:nope`, today), null);

  const snoozed = handleCallback(db, `snooze:${id16(db, 'beta')}`, today);
  assert.ok(snoozed?.text.endsWith('\n\n💤 snoozed until 2026-11-09'));
  assert.deepEqual(status(db, 'beta'), { status: 'snoozed', skip_reason: null, snooze_until: '2026-11-09' });

  const composed = handleCallback(db, `compose:${id16(db, 'warmco')}`, today);
  assert.ok(composed?.kind === 'reply');
  assert.match(composed.text, /^<b>warmco: contract storefront engineering<\/b>\n\nHi,\n/);
  assert.match(composed.text, /\n- Solutions Architect\n/);
  assert.match(composed.text, /<code>mailto:\?subject=/);
  assert.equal(status(db, 'warmco').status, 'new');

  assert.equal(handleCallback(db, 'applied:0000000000000000', today), null);
  assert.equal(handleCallback(db, `bogus:${id16(db, 'warmco')}`, today), null);
  db.close();
});

test('compose reply stays under the Telegram limit and lists each title once', () => {
  const db = openDb(':memory:');
  const titles = Array.from({ length: 80 }, (_, i) => `Senior Software Engineer, Commerce Platform and Storefront Services ${i}`);
  const cities = ['London', 'Paris', 'Berlin', 'Madrid', 'Rome'];
  seed(db, [
    [company('big'), titles.map((t, i) => posting(String(i), t))],
    [company('multi'), cities.map((location, i) => ({ ...posting(`m${i}`, 'Frontend Developer'), location }))],
  ]);

  const big = handleCallback(db, `compose:${id16(db, 'big')}`, '2026-11-02');
  assert.ok(big?.kind === 'reply');
  assert.ok(visibleLength(big.text) < 4096, `${visibleLength(big.text)} chars`);
  assert.match(big.text, /^<b>big: contract storefront engineering<\/b>\n\n/);
  assert.ok(big.text.split('\n').filter((l) => l.startsWith('- ')).length === 10);

  const multi = handleCallback(db, `compose:${id16(db, 'multi')}`, '2026-11-02');
  assert.ok(multi?.kind === 'reply');
  assert.equal(multi.text.split('\n').filter((l) => l === '- Frontend Developer').length, 1);
  db.close();
});
