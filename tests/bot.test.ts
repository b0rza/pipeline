import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { buildDigest, escapeHtml, expireGone, sendDigest, signalMessage, supersede, visibleLength } from '../bot/notify.ts';
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
    '🔥 warm · <b>warmco</b> · 🇬🇧 GB · greenhouse · <b>OUTREACH</b>',
    '<b>zeta</b> · 🇬🇧 GB · greenhouse · <b>APPLY</b>',
    '<b>alpha</b> · 🇬🇧 GB · greenhouse · <b>OUTREACH</b>',
    '<b>beta</b> · 🇬🇧 GB · greenhouse · <b>OUTREACH</b>',
  ]);
  assert.deepEqual(digest[2].text.split('\n').slice(1), [
    '• <a href="https://example.test/z2">Senior Software Engineer, Contract</a> — London [title:contract · unknown:🇬🇧 GB]',
    '• <a href="https://example.test/z1">Backend Engineer</a> — London [perm · unknown:🇬🇧 GB]',
  ]);
  db.close();
});

test('buildDigest puts apply signals with a B2B posting first, and B2B postings first in a card', () => {
  const db = openDb(':memory:');
  seed(db, [
    [company('aardvark'), [posting('k1', 'Senior Software Engineer, Contract')]],
    [company('mixed'), [
      posting('m1', 'Backend Engineer'), posting('m2', 'Frontend Developer, Contract', 'W2 only.'),
      posting('m3', 'Software Engineer', 'Paid on a B2B contract.'),
    ]],
    [company('zulu'), [posting('u1', 'Software Engineer', 'Outside IR35.')]],
    [company('warmco', { warm: true }), [posting('w1', 'Solutions Architect')]],
  ]);
  const digest = buildDigest(db, '2026-11-02');
  // Warm still leads; then apply signals with a B2B posting by name, then the other apply signals.
  assert.deepEqual(digest.slice(1).map((m) => m.text.split('\n')[0].replace(/<\/?b>/g, '').split(' · ')[0]),
    ['🔥 warm', 'mixed', 'zulu', 'aardvark']);
  assert.deepEqual(digest[2].text.split('\n').slice(1), [
    '• <a href="https://example.test/m3">Software Engineer</a> — London [b2b:b2b contract · unknown:🇬🇧 GB]',
    '• <a href="https://example.test/m2">Frontend Developer, Contract</a> — London [title:contract · payroll · unknown:🇬🇧 GB]',
    '• <a href="https://example.test/m1">Backend Engineer</a> — London [perm · unknown:🇬🇧 GB]',
  ]);
  db.close();
});

test('a B2B posting that left the board no longer lifts its signal', () => {
  const db = openDb(':memory:');
  const contract = posting('b2', 'Data Engineer, Contract');
  const aardvark = posting('k1', 'Senior Software Engineer, Contract');
  seed(db, [[company('aardvark'), [aardvark]], [company('bravo'), [posting('b1', 'Software Engineer', 'C2C welcome.'), contract]]]);
  const names = (runDate: string) => buildDigest(db, runDate).slice(1).map((m) => m.text.split('\n')[0].split('</b>')[0].slice(3));
  assert.deepEqual(names('2026-11-02'), ['bravo', 'aardvark']);
  seed(db, [[company('bravo'), [contract]], [company('aardvark'), [aardvark]]], '2026-11-03');
  assert.deepEqual(names('2026-11-03'), ['aardvark', 'bravo']);
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
  assert.deepEqual(warm.buttons.map((row) => row.map((b) => b.text)), [['Compose', 'Skip', 'Snooze 7d', 'Later']]);
  assert.deepEqual(apply.buttons.map((row) => row.map((b) => b.text)), [['Applied', 'Skip', 'Snooze 7d', 'Later']]);
  const id = id16(db, 'warmco');
  assert.match(id, /^[0-9a-f]{16}$/);
  assert.deepEqual(warm.buttons[0].map((b) => 'callback_data' in b && b.callback_data),
    [`compose:${id}`, `skip:${id}`, `snooze:${id}`, `later:${id}`]);
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

test('a later signal is never sent, retired or superseded by the nightly, and Later clears a snooze date', () => {
  const db = openDb(':memory:');
  const perm = posting('1', 'Software Engineer');
  seed(db, [[company('acme'), [perm]], [company('gone'), [posting('2', 'Backend Engineer')]]], '2026-10-26');
  db.prepare("update signals set status = 'snoozed', snooze_until = '2026-11-02'").run();
  for (const companyId of ['acme', 'gone']) handleCallback(db, `later:${id16(db, companyId)}`, '2026-10-27');
  assert.deepEqual(status(db, 'acme'), { status: 'later', skip_reason: null, snooze_until: null });
  // A newer signal for acme, and gone's only posting leaves the board.
  seed(db, [[company('acme'), [perm, posting('3', 'Software Engineer, Contract')]], [company('gone'), []]]);
  assert.equal(expireGone(db, '2026-11-02'), 0);
  assert.equal(supersede(db, '2026-11-02'), 0);
  const byRun = (companyId: string, runDate: string) =>
    (db.prepare('select status from signals where company_id = ? and run_date = ?').get(companyId, runDate) as { status: string }).status;
  assert.equal(byRun('acme', '2026-10-26'), 'later');
  assert.equal(byRun('gone', '2026-10-26'), 'later');
  // Only the newer acme signal goes out.
  const digest = buildDigest(db, '2026-11-02');
  assert.equal(digest.length, 2);
  assert.equal(digest[1].text.split('\n')[0], '<b>acme</b> · 🇬🇧 GB · greenhouse · <b>APPLY</b>');
  assert.match(digest[1].text, /^[^\n]*\n• <a href="https:\/\/example.test\/3">[^\n]*$/);
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
  assert.equal(digest[1].text.split('\n')[0], '<b>acme</b> · 🇬🇧 GB · greenhouse · <b>APPLY</b>');

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
    '<b>acme</b> · 🇬🇧 GB · greenhouse · <b>OUTREACH</b>',
    '<b>other</b> · 🇬🇧 GB · greenhouse · <b>OUTREACH</b>',
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

  const later = handleCallback(db, `later:${id16(db, 'warmco')}`, today);
  assert.ok(later?.kind === 'edit');
  assert.ok(later.text.endsWith('\n\n🗂 later'));
  assert.deepEqual(later.buttons, [[{ text: 'Reopen', callback_data: `reopen:${id16(db, 'warmco')}` }]]);
  assert.deepEqual(status(db, 'warmco'), { status: 'later', skip_reason: null, snooze_until: null });

  // Reopen from later, and from snoozed: back to new, no buttons until the next digest sends it again.
  for (const companyId of ['warmco', 'beta']) {
    const reopened = handleCallback(db, `reopen:${id16(db, companyId)}`, today);
    assert.ok(reopened?.kind === 'edit');
    assert.ok(reopened.text.endsWith('\n\n↩ reopened: back in the next digest'));
    assert.deepEqual(reopened.buttons, []);
    assert.deepEqual(status(db, companyId), { status: 'new', skip_reason: null, snooze_until: null });
  }

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

// The company's board on a later night lists only `remaining`; the others get gone_at. No new signal: nothing new to report.
const later = (db: DatabaseSync, c: Company, remaining: NormalizedPosting[], runDate = '2026-11-03') => seed(db, [[c, remaining]], runDate);

const signalIdOf = (db: DatabaseSync, companyId: string, runDate: string) =>
  (db.prepare('select id from signals where company_id = ? and run_date = ?').get(companyId, runDate) as { id: string }).id;

test('a gone posting is hidden from the digest and struck through when the signal is re-rendered', () => {
  const db = openDb(':memory:');
  const live = posting('m1', 'Software Engineer');
  seed(db, [[company('mix'), [live, posting('m2', 'Backend Engineer')]]]);
  later(db, company('mix'), [live]);

  const digest = buildDigest(db, '2026-11-03');
  assert.equal(digest.length, 2);
  assert.equal(digest[0].text, '<b>Digest 2026-11-03</b> · 0 apply · 1 outreach · 0 dropped postings');
  assert.deepEqual(digest[1].text.split('\n').slice(1), [
    '• <a href="https://example.test/m1">Software Engineer</a> — London [perm · unknown:🇬🇧 GB]',
  ]);

  assert.deepEqual(signalMessage(db, digest[1].signal_id!).text.split('\n').slice(1), [
    '• <a href="https://example.test/m1">Software Engineer</a> — London [perm · unknown:🇬🇧 GB]',
    '• <s><a href="https://example.test/m2">Backend Engineer</a></s> — London [perm · unknown:🇬🇧 GB] · gone',
  ]);
  assert.equal(expireGone(db, '2026-11-03'), 0);
  db.close();
});

test('a signal whose postings are all gone is left out, expired as gone once, and still renders', () => {
  const db = openDb(':memory:');
  seed(db, [[company('dead'), [posting('d1', 'Software Engineer')]], [company('alive'), [posting('a1', 'Backend Engineer')]]]);
  later(db, company('dead'), []);
  const id = signalIdOf(db, 'dead', '2026-11-02');

  const digest = buildDigest(db, '2026-11-03');
  assert.deepEqual(digest.slice(1).map((m) => m.text.split('\n')[0]), ['<b>alive</b> · 🇬🇧 GB · greenhouse · <b>OUTREACH</b>']);
  assert.match(digest[0].text, / · 0 apply · 1 outreach · /);

  assert.equal(expireGone(db, '2026-11-03'), 1);
  assert.deepEqual(status(db, 'dead'), { status: 'skipped', skip_reason: 'gone', snooze_until: null });
  assert.deepEqual(status(db, 'alive'), { status: 'new', skip_reason: null, snooze_until: null });
  assert.equal(expireGone(db, '2026-11-03'), 0);
  assert.deepEqual(buildDigest(db, '2026-11-03'), digest);

  assert.deepEqual(signalMessage(db, id).text.split('\n'), [
    '<b>dead</b> · 🇬🇧 GB · greenhouse · <b>OUTREACH</b>',
    '• <s><a href="https://example.test/d1">Software Engineer</a></s> — London [perm · unknown:🇬🇧 GB] · gone',
  ]);
  const skipped = handleCallback(db, `skip:${id.slice(0, 16)}`, '2026-11-03');
  assert.ok(skipped?.kind === 'edit');
  db.close();
});

test('the newest signal of a company with all postings gone does not hide an older live one', () => {
  const db = openDb(':memory:');
  const perm = posting('1', 'Software Engineer');
  seed(db, [[company('acme'), [perm]]], '2026-10-26');
  db.prepare("update signals set status = 'snoozed', snooze_until = '2026-11-02'").run();
  seed(db, [[company('acme'), [perm, posting('2', 'Software Engineer, Contract')]]]);
  later(db, company('acme'), [perm]);

  // Dry run: nothing written, the older signal is the pending one.
  const digest = buildDigest(db, '2026-11-03');
  assert.equal(digest.length, 2);
  assert.equal(digest[1].signal_id, signalIdOf(db, 'acme', '2026-10-26'));
  assert.equal(digest[0].text, '<b>Digest 2026-11-03</b> · 0 apply · 1 outreach · 0 dropped postings');
  assert.equal(digest[1].text.split('\n')[0], '<b>acme</b> · 🇬🇧 GB · greenhouse · <b>OUTREACH</b>');

  // As main() runs it: expire, then supersede, then the same digest.
  assert.equal(expireGone(db, '2026-11-03'), 1);
  assert.equal(supersede(db, '2026-11-03'), 0);
  const byRun = (runDate: string) => ({ ...db.prepare('select status, skip_reason from signals where run_date = ?').get(runDate) });
  assert.deepEqual(byRun('2026-11-02'), { status: 'skipped', skip_reason: 'gone' });
  assert.deepEqual(byRun('2026-10-26'), { status: 'snoozed', skip_reason: null });
  assert.deepEqual(buildDigest(db, '2026-11-03'), digest);
  db.close();
});

test('supersede alone does not retire a live older signal in favour of an emptied newer one', () => {
  const db = openDb(':memory:');
  const perm = posting('1', 'Software Engineer');
  seed(db, [[company('acme'), [perm]]], '2026-10-26');
  seed(db, [[company('acme'), [perm, posting('2', 'Software Engineer, Contract')]]]);
  later(db, company('acme'), [perm]);
  assert.equal(supersede(db, '2026-11-03'), 0);
  assert.equal(status(db, 'acme').status, 'new');
  db.close();
});

test('compose uses live titles only, and all titles when none is live', () => {
  const db = openDb(':memory:');
  const live = posting('m1', 'Software Engineer');
  seed(db, [
    [company('mix'), [live, posting('m2', 'Backend Engineer')]],
    [company('dead'), [posting('d1', 'Frontend Developer'), posting('d2', 'Platform Engineer')]],
  ]);
  later(db, company('mix'), [live]);
  later(db, company('dead'), []);

  const mix = handleCallback(db, `compose:${signalIdOf(db, 'mix', '2026-11-02').slice(0, 16)}`, '2026-11-03');
  assert.ok(mix?.kind === 'reply');
  assert.deepEqual(mix.text.split('\n').filter((l) => l.startsWith('- ')), ['- Software Engineer']);

  const dead = handleCallback(db, `compose:${signalIdOf(db, 'dead', '2026-11-02').slice(0, 16)}`, '2026-11-03');
  assert.ok(dead?.kind === 'reply');
  assert.deepEqual(dead.text.split('\n').filter((l) => l.startsWith('- ')), ['- Frontend Developer', '- Platform Engineer']);
  db.close();
});

test('an employer signal says employer after the list name, an agency signal does not', () => {
  const db = openDb(':memory:');
  seed(db, [
    [company('stripeish', { country: 'US', kind: 'employer' }), [
      { ...posting('s1', 'Senior Software Engineer'), location: 'Remote (Europe)' },
      posting('s2', 'Software Engineer'),
    ]],
    [company('zeta'), [posting('z1', 'Senior Software Engineer, Contract')]],
  ]);
  const digest = buildDigest(db, '2026-11-02');
  assert.equal(digest[0].text, '<b>Digest 2026-11-02</b> · 2 apply · 0 outreach · 1 dropped postings');
  assert.deepEqual(digest.slice(1).map((m) => m.text), [
    '<b>stripeish</b> · 🇺🇸 US · greenhouse · <b>APPLY</b> · employer\n' +
      '• <a href="https://example.test/s1">Senior Software Engineer</a> — Remote (Europe) [employer · remote:europe]',
    '<b>zeta</b> · 🇬🇧 GB · greenhouse · <b>APPLY</b>\n' +
      '• <a href="https://example.test/z1">Senior Software Engineer, Contract</a> — London [title:contract · unknown:🇬🇧 GB]',
  ]);
  // Apply buttons, not Compose: there is no pitch to an employer.
  assert.equal(digest[1].buttons[0][0].text, 'Applied');
  db.close();
});
