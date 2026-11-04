import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { handleCallback } from '../bot/server.ts';
import { composeBody, composeSubject } from '../bot/templates.ts';
import { upsertCompanies } from '../core/companies.ts';
import { openDb } from '../core/db.ts';
import { diffRun } from '../core/diff.ts';
import { filterRun } from '../core/filter.ts';
import { snapshotCompany } from '../core/snapshot.ts';
import type { Company, NormalizedPosting } from '../core/types.ts';
import { handle } from '../ui/server.ts';

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

const signalId = (db: DatabaseSync, companyId: string) =>
  (db.prepare('select id from signals where company_id = ?').get(companyId) as { id: string }).id;

const standard = (db: DatabaseSync) => seed(db, [
  [company('beta'), [posting('b1', 'Software Engineer')]],
  [company('alpha'), [posting('a1', 'Frontend Developer'), posting('a2', 'Engineering Talent Pool')]],
  [company('zeta'), [posting('z1', 'Backend Engineer'), posting('z2', 'Senior Software Engineer, Contract')]],
  [company('warmco', { warm: true }), [posting('w1', 'Solutions Architect')]],
]);

const today = '2026-11-02';
const get = (db: DatabaseSync) => handle(db, { method: 'GET', url: '/' }, today);
const post = (db: DatabaseSync, id: string, action: string, body?: string) =>
  handle(db, { method: 'POST', url: `/signal/${id}/${action}`, body }, today);

// Company names of the cards in one section, in page order.
const section = (html: string, which: 'pending' | 'history') => {
  const [, pending, history] = html.split(/<h2>(?:Pending|History)<\/h2>/);
  return [...(which === 'pending' ? pending : history).matchAll(/<article class="card" id="s-[0-9a-f]{16}"><div>(?:🔥 warm · )?<b>(.*?)<\/b>/g)]
    .map((m) => m[1]);
};

const cardOf = (html: string, db: DatabaseSync, companyId: string) => {
  const start = html.indexOf(`id="s-${signalId(db, companyId).slice(0, 16)}"`);
  assert.ok(start >= 0, `no card for ${companyId}`);
  return html.slice(start, html.indexOf('</article>', start));
};

const allSignals = (db: DatabaseSync) => db.prepare('select company_id, status, skip_reason, snooze_until from signals order by company_id').all();

test('GET / shows the pending header and each company once, apply first', () => {
  const db = openDb(':memory:');
  standard(db);
  const res = get(db);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
  assert.match(res.body, /<h2>Pending<\/h2><p>1 apply · 3 outreach · 1 dropped postings<\/p>/);
  assert.deepEqual(section(res.body, 'pending'), ['zeta', 'warmco', 'alpha', 'beta']);
  assert.deepEqual(section(res.body, 'history'), []);
  assert.match(cardOf(res.body, db, 'zeta'), /<b>APPLY<\/b> · run 2026-11-02/);
  // Contract posting first, with its route tag.
  assert.match(cardOf(res.body, db, 'zeta'),
    /<li><a href="https:\/\/example.test\/z2">Senior Software Engineer, Contract<\/a> — London <span class="tag">\[title:contract · unknown:GB\]<\/span><\/li><li><a href="https:\/\/example.test\/z1">/);
  db.close();
});

test('apply cards get Applied, outreach cards a mailto Compose link built from the template', () => {
  const db = openDb(':memory:');
  standard(db);
  const html = get(db).body;
  const apply = cardOf(html, db, 'zeta');
  assert.match(apply, /action="\/signal\/[0-9a-f]{64}\/applied"><button>Applied<\/button>/);
  assert.doesNotMatch(apply, /mailto:|Compose/);

  const outreach = cardOf(html, db, 'alpha');
  assert.doesNotMatch(outreach, /Applied/);
  const href = outreach.match(/<a href="(mailto:[^"]+)">Compose<\/a>/)?.[1];
  assert.ok(href);
  const [subject, body] = href.replaceAll('&amp;', '&').slice('mailto:?subject='.length).split('&body=');
  assert.equal(decodeURIComponent(subject), composeSubject('alpha'));
  assert.equal(decodeURIComponent(body), composeBody('alpha', ['Frontend Developer']));

  for (const c of [apply, outreach]) {
    assert.match(c, /<select name="reason"><option value="fit">bad fit<\/option>.*<option value="other">other<\/option><\/select><button>Skip<\/button>/);
    assert.match(c, /<button>Snooze 7d<\/button>/);
    assert.doesNotMatch(c, /Reopen/);
  }
  db.close();
});

test('POST applied, skip and snooze change the rows as handleCallback does, and move the card to History', () => {
  const web = openDb(':memory:');
  const bot = openDb(':memory:');
  standard(web);
  standard(bot);

  for (const [companyId, action, body] of [['zeta', 'applied', undefined], ['alpha', 'skip', 'reason=fit'], ['beta', 'snooze', undefined]]) {
    const id = signalId(web, companyId!);
    const res = post(web, id, action!, body);
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, `/#s-${id.slice(0, 16)}`);
    assert.ok(handleCallback(bot, `${action}:${id.slice(0, 16)}${body ? ':fit' : ''}`, today));
  }
  assert.deepEqual(allSignals(web), allSignals(bot));
  assert.deepEqual(status(web, 'alpha'), { status: 'skipped', skip_reason: 'bad fit', snooze_until: null });
  assert.deepEqual(status(web, 'beta'), { status: 'snoozed', skip_reason: null, snooze_until: '2026-11-09' });

  const html = get(web).body;
  assert.match(html, /<h2>Pending<\/h2><p>0 apply · 1 outreach · 1 dropped postings<\/p>/);
  assert.deepEqual(section(html, 'pending'), ['warmco']);
  assert.deepEqual(section(html, 'history'), ['zeta', 'alpha', 'beta']);
  assert.match(cardOf(html, web, 'alpha'), /<span class="badge b-skipped">skipped<\/span>.*<p class="meta">skipped: bad fit<\/p>/);
  assert.match(cardOf(html, web, 'alpha'), /<button>Reopen<\/button>/);
  assert.doesNotMatch(cardOf(html, web, 'alpha'), /Snooze 7d/);
  // Snoozed keeps its buttons and can be reopened.
  assert.match(cardOf(html, web, 'beta'), /<p class="meta">snoozed until 2026-11-09<\/p>/);
  assert.match(cardOf(html, web, 'beta'), /Compose.*Skip.*Snooze 7d.*Reopen/);
  web.close();
  bot.close();
});

test('POST reopen sets the signal back to new and it returns to Pending', () => {
  const db = openDb(':memory:');
  standard(db);
  const alpha = signalId(db, 'alpha');
  const beta = signalId(db, 'beta');
  post(db, alpha, 'skip', 'reason=geo');
  post(db, beta, 'snooze');
  db.prepare("update signals set status = 'notified' where company_id = 'warmco'").run();

  const before = get(db).body;
  assert.deepEqual(section(before, 'pending'), ['zeta']);
  assert.match(cardOf(before, db, 'warmco'), /<span class="badge b-notified">notified<\/span>/);
  assert.match(cardOf(before, db, 'warmco'), /Compose.*Skip.*Snooze 7d/);
  assert.doesNotMatch(cardOf(before, db, 'warmco'), /Reopen/);

  assert.equal(post(db, alpha, 'reopen').status, 303);
  assert.equal(post(db, beta, 'reopen').status, 303);
  assert.deepEqual(status(db, 'alpha'), { status: 'new', skip_reason: null, snooze_until: null });
  assert.deepEqual(status(db, 'beta'), { status: 'new', skip_reason: null, snooze_until: null });
  assert.deepEqual(section(get(db).body, 'pending'), ['zeta', 'alpha', 'beta']);
  db.close();
});

test('an older new signal of a company with a newer pending one is in History without buttons', () => {
  const db = openDb(':memory:');
  const perm = posting('1', 'Software Engineer');
  seed(db, [[company('acme'), [perm]]], '2026-10-26');
  seed(db, [[company('acme'), [perm, posting('2', 'Software Engineer, Contract')]]]);
  const html = get(db).body;
  assert.deepEqual(section(html, 'pending'), ['acme']);
  assert.deepEqual(section(html, 'history'), ['acme']);
  const [, history] = html.split('<h2>History</h2>');
  assert.match(history, /<h3>2026-10-26<\/h3>/);
  assert.match(history, /<span class="badge b-new">new<\/span>/);
  assert.doesNotMatch(history, /<form|mailto:/);
  db.close();
});

test('bad id, bad reason and unknown routes are rejected', () => {
  const db = openDb(':memory:');
  standard(db);
  const id = signalId(db, 'alpha');
  const rows = allSignals(db);
  assert.equal(post(db, id.slice(0, 16), 'applied').status, 404);
  assert.equal(post(db, '0'.repeat(64), 'applied').status, 404);
  assert.equal(post(db, id.toUpperCase(), 'applied').status, 404);
  assert.equal(post(db, id, 'bogus').status, 404);
  assert.equal(post(db, id, 'skip', 'reason=nope').status, 400);
  assert.equal(post(db, id, 'skip').status, 400);
  assert.equal(handle(db, { method: 'GET', url: `/signal/${id}/applied` }, today).status, 404);
  assert.equal(handle(db, { method: 'GET', url: '/nothing' }, today).status, 404);
  assert.equal(handle(db, { method: 'POST', url: '/' }, today).status, 404);
  assert.deepEqual(allSignals(db), rows);
  db.close();
});

test('page escapes HTML in company names and titles', () => {
  const db = openDb(':memory:');
  seed(db, [[company('ab', { name: 'A&B <Co>' }), [posting('1', 'Software Engineer <Platform>')]]]);
  const html = get(db).body;
  assert.match(html, /<b>A&amp;B &lt;Co&gt;<\/b>/);
  assert.match(html, />Software Engineer &lt;Platform&gt;<\/a>/);
  assert.doesNotMatch(html, /<Co>|<Platform>/);
  db.close();
});
