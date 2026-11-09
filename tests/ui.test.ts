import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { handleCallback } from '../bot/server.ts';
import { composeBody, composeSubject } from '../bot/templates.ts';
import { loadCompanies, upsertCompanies } from '../core/companies.ts';
import { openDb } from '../core/db.ts';
import { diffRun } from '../core/diff.ts';
import { filterRun } from '../core/filter.ts';
import { snapshotCompany } from '../core/snapshot.ts';
import type { Company, EmployerProfile, NormalizedPosting } from '../core/types.ts';
import { handle, runTime } from '../ui/server.ts';

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
// The Employers tab reads the companies given here; without them handle() reads universe/companies.yaml.
const get = (db: DatabaseSync, companies: Company[] = []) => handle(db, { method: 'GET', url: '/' }, today, companies);
const post = (db: DatabaseSync, id: string, action: string, body?: string) =>
  handle(db, { method: 'POST', url: `/signal/${id}/${action}`, body }, today);

// The markup of one tab's section.
type Tab = 'pending' | 'later' | 'history' | 'employers';
const sectionHtml = (html: string, which: Tab) => {
  const start = html.search(new RegExp(`<section id="sec-${which}"[^>]*>`));
  assert.ok(start >= 0, `no ${which} section`);
  return html.slice(start, html.indexOf('</section>', start));
};

// Company names of the cards in one section, in page order.
const section = (html: string, which: Tab) =>
  [...sectionHtml(html, which).matchAll(/<article id="s-[0-9a-f]{16}"><header>(?:🔥 warm · )?<b>(.*?)<\/b>/g)].map((m) => m[1]);

const cardOf = (html: string, db: DatabaseSync, companyId: string) => {
  const start = html.indexOf(`id="s-${signalId(db, companyId).slice(0, 16)}"`);
  assert.ok(start >= 0, `no card for ${companyId}`);
  return html.slice(start, html.indexOf('</article>', start));
};

const employer = (id: string, profile: Partial<EmployerProfile> = {}, extra: Partial<Company> = {}): Company => company(id, {
  kind: 'employer', careers_url: `https://${id}.test/careers`,
  employer: {
    group: 'devtools-ai', bar: 'fit', why: `Why ${id}`, engagement: 'employment',
    remote: { europe: 'yes', says: `${id} hires remote in Europe`, source: `https://${id}.test/remote` }, ...profile,
  },
  ...extra,
});

const allSignals = (db: DatabaseSync) => db.prepare('select company_id, status, skip_reason, snooze_until from signals order by company_id').all();

test('GET / shows the pending header and each company once, in digest order', () => {
  const db = openDb(':memory:');
  standard(db);
  const res = get(db);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
  assert.match(res.body, /<\/h1><p>1 apply · 3 outreach waiting · 1 dropped postings today<\/p><\/header>/);
  // Warm first, then apply before outreach, then by name, as the Telegram digest sends them.
  assert.deepEqual(section(res.body, 'pending'), ['warmco', 'zeta', 'alpha', 'beta']);
  assert.deepEqual(section(res.body, 'history'), []);
  // The theme switch, and its script before the body so a stored choice applies without a flash.
  assert.match(res.body, /<script>[^]*localStorage\.getItem\('theme'\)[^]*<\/script><\/head><body><header><button id="theme"[^>]*onclick="toggleTheme\(\)">light \/ dark<\/button>/);
  assert.match(cardOf(res.body, db, 'zeta'), /<b>zeta<\/b> · 🇬🇧 GB · greenhouse · <b>APPLY<\/b> · run 2026-11-02/);
  // Contract posting first, with its route tag.
  assert.match(cardOf(res.body, db, 'zeta'),
    /<li><a href="https:\/\/example.test\/z2">Senior Software Engineer, Contract<\/a> — London <small>\[title:contract · unknown:🇬🇧 GB\]<\/small><\/li><li><a href="https:\/\/example.test\/z1">/);
  db.close();
});

test('apply cards get Mark applied, outreach cards a mailto Compose link built from the template', () => {
  const db = openDb(':memory:');
  standard(db);
  const html = get(db).body;
  const apply = cardOf(html, db, 'zeta');
  assert.match(apply, /action="\/signal\/[0-9a-f]{64}\/applied"><button>Mark applied<\/button>/);
  assert.doesNotMatch(apply, /mailto:|Compose/);

  const outreach = cardOf(html, db, 'alpha');
  assert.doesNotMatch(outreach, /Mark applied/);
  const href = outreach.match(/<a role="button" href="(mailto:[^"]+)">Compose<\/a>/)?.[1];
  assert.ok(href);
  const [subject, body] = href.replaceAll('&amp;', '&').slice('mailto:?subject='.length).split('&body=');
  assert.equal(decodeURIComponent(subject), composeSubject('alpha'));
  assert.equal(decodeURIComponent(body), composeBody('alpha', ['Frontend Developer']));

  for (const c of [apply, outreach]) {
    assert.match(c, /<fieldset role="group"><select name="reason"><option value="fit">bad fit<\/option>.*<option value="other">other<\/option><\/select><button class="secondary outline">Skip<\/button><\/fieldset>/);
    // Later after Snooze 7d, the last button on a pending card.
    assert.match(c, /<button class="secondary outline">Snooze 7d<\/button><\/form><form method="post" action="\/signal\/[0-9a-f]{64}\/later"><button class="secondary outline">Later<\/button><\/form><\/footer>/);
    assert.doesNotMatch(c, /Reopen/);
  }
  db.close();
});

test('POST applied, skip, snooze and later change the rows as handleCallback does, move the card and land on Pending', () => {
  const web = openDb(':memory:');
  const bot = openDb(':memory:');
  standard(web);
  standard(bot);

  for (const [companyId, action, body] of [
    ['zeta', 'applied', undefined], ['alpha', 'skip', 'reason=fit'], ['beta', 'snooze', undefined], ['warmco', 'later', undefined],
  ]) {
    const id = signalId(web, companyId!);
    const res = post(web, id, action!, body);
    assert.equal(res.status, 303);
    // The Pending tab, not the tab the card moved to.
    assert.equal(res.headers.location, '/');
    assert.ok(handleCallback(bot, `${action}:${id.slice(0, 16)}${body ? ':fit' : ''}`, today));
  }
  assert.deepEqual(allSignals(web), allSignals(bot));
  assert.deepEqual(status(web, 'alpha'), { status: 'skipped', skip_reason: 'bad fit', snooze_until: null });
  assert.deepEqual(status(web, 'beta'), { status: 'snoozed', skip_reason: null, snooze_until: '2026-11-09' });

  assert.deepEqual(status(web, 'warmco'), { status: 'later', skip_reason: null, snooze_until: null });

  const html = get(web).body;
  assert.match(html, /<\/h1><p>0 apply · 0 outreach waiting · 1 dropped postings today<\/p><\/header>/);
  assert.match(html, /<button id="tab-pending" onclick="location.hash = 'pending'">Pending \(0\)<\/button><button id="tab-later" class="secondary outline" onclick="location.hash = 'later'">Later \(1\)<\/button><button id="tab-history" class="secondary outline" onclick="location.hash = 'history'">History \(3\)<\/button>/);
  assert.deepEqual(section(html, 'pending'), []);
  assert.deepEqual(section(html, 'later'), ['warmco']);
  assert.deepEqual(section(html, 'history'), ['zeta', 'alpha', 'beta']);
  assert.match(cardOf(html, web, 'alpha'), /<span class="badge b-skipped">skipped<\/span>.*<p class="meta">skipped: bad fit<\/p>/);
  assert.match(cardOf(html, web, 'alpha'), /<button class="secondary outline">Reopen<\/button>/);
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

  const before = get(db).body;
  assert.deepEqual(section(before, 'pending'), ['warmco', 'zeta']);
  assert.deepEqual(section(before, 'history'), ['alpha', 'beta']);

  // Reopen keeps the card anchor: the card is back on Pending.
  for (const id of [alpha, beta]) {
    const res = post(db, id, 'reopen');
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, `/#s-${id.slice(0, 16)}`);
  }
  assert.deepEqual(status(db, 'alpha'), { status: 'new', skip_reason: null, snooze_until: null });
  assert.deepEqual(status(db, 'beta'), { status: 'new', skip_reason: null, snooze_until: null });
  const after = get(db).body;
  assert.deepEqual(section(after, 'pending'), ['warmco', 'zeta', 'alpha', 'beta']);
  assert.deepEqual(section(after, 'history'), []);
  db.close();
});

test('Pending holds what waits on the owner: notified signals with buttons, unsent ones marked not sent yet', () => {
  const db = openDb(':memory:');
  standard(db);
  db.prepare("update signals set status = 'notified' where company_id in ('warmco', 'zeta')").run();
  const html = get(db).body;
  assert.match(html, /<\/h1><p>1 apply · 3 outreach waiting · 1 dropped postings today<\/p><\/header>/);
  assert.deepEqual(section(html, 'pending'), ['warmco', 'zeta', 'alpha', 'beta']);
  assert.deepEqual(section(html, 'history'), []);
  assert.match(html, />Pending \(4\)<\/button>.*>History \(0\)<\/button>/);

  // Sent to Telegram, not answered: no badge, the same buttons as an unsent card.
  const warmco = cardOf(html, db, 'warmco');
  assert.doesNotMatch(warmco, /badge|notified|not sent yet/);
  assert.match(warmco, /Compose.*Skip.*Snooze 7d/);
  assert.doesNotMatch(warmco, /Reopen/);
  assert.match(cardOf(html, db, 'zeta'), /<b>APPLY<\/b> · run 2026-11-02 \d\d:\d\d<\/header>.*<button>Mark applied<\/button>/);

  // Not in Telegram yet: marked, and actionable here.
  const alpha = cardOf(html, db, 'alpha');
  assert.match(alpha, /<b>OUTREACH<\/b> · run 2026-11-02 \d\d:\d\d <span class="badge b-unsent">not sent yet<\/span><\/header>/);
  assert.match(alpha, /Compose.*Skip.*Snooze 7d/);

  // A snoozed signal that is due again is unsent too; one still snoozed is History.
  post(db, signalId(db, 'alpha'), 'snooze');
  db.prepare("update signals set snooze_until = '2026-11-02' where company_id = 'alpha'").run();
  post(db, signalId(db, 'beta'), 'snooze');
  const later = get(db).body;
  assert.deepEqual(section(later, 'pending'), ['warmco', 'zeta', 'alpha']);
  assert.deepEqual(section(later, 'history'), ['beta']);
  assert.match(cardOf(later, db, 'alpha'), /<span class="badge b-unsent">not sent yet<\/span>/);
  assert.match(cardOf(later, db, 'beta'), /<span class="badge b-snoozed">snoozed<\/span>/);
  db.close();
});

test('the tab bar switches by the address, and a Later, History or Employers card anchor opens its tab', () => {
  const db = openDb(':memory:');
  standard(db);
  const html = get(db, [employer('n8nish')]).body;
  // Pending open as rendered, Later, History and Employers hidden until the script reads the address.
  assert.match(html, /<main><nav id="tabs"><button id="tab-pending" onclick="location.hash = 'pending'">Pending \(4\)<\/button><button id="tab-later" class="secondary outline" onclick="location.hash = 'later'">Later \(0\)<\/button><button id="tab-history" class="secondary outline" onclick="location.hash = 'history'">History \(0\)<\/button><button id="tab-employers" class="secondary outline" onclick="location.hash = 'employers'">Employers \(1\)<\/button><\/nav><section id="sec-pending">/);
  assert.match(html, /<\/section><section id="sec-later" hidden><p>Nothing for later.<\/p><\/section><section id="sec-history" hidden><p>No past signals.<\/p><\/section><section id="sec-employers" hidden><h3>/);
  // Inline, after the sections, so it can find them.
  assert.match(html, /<\/section><\/main><script>[^]*\['pending', 'later', 'history', 'employers'\][^]*\['later', 'history', 'employers'\]\.find\(\(t\) => location\.hash === '#' \+ t \|\| target\?\.closest\('#sec-' \+ t\)\) \?\? 'pending'[^]*<\/script><\/body><\/html>$/);
  // No employers: an empty tab that says so.
  const none = get(db).body;
  assert.match(none, />Employers \(0\)<\/button><\/nav>/);
  assert.match(none, /<section id="sec-employers" hidden><p>No employers on the watch list.<\/p><\/section><\/main>/);
  db.close();
});

test('a later card waits in the Later tab with its buttons plus Reopen, and leaves it on Reopen or an action', () => {
  const db = openDb(':memory:');
  standard(db);
  for (const companyId of ['zeta', 'alpha', 'beta']) post(db, signalId(db, companyId), 'later');
  const html = get(db).body;
  assert.match(html, /<\/h1><p>0 apply · 1 outreach waiting · 1 dropped postings today<\/p><\/header>/);
  assert.match(html, />Pending \(1\)<\/button><button id="tab-later"[^>]*>Later \(3\)<\/button>[^]*>History \(0\)<\/button>/);
  // Digest order, as everywhere.
  assert.deepEqual(section(html, 'later'), ['zeta', 'alpha', 'beta']);
  assert.deepEqual(section(html, 'history'), []);

  const zeta = cardOf(html, db, 'zeta');
  assert.match(zeta, /<b>APPLY<\/b> · run 2026-11-02[^<]* <span class="badge b-later">later<\/span><\/header>/);
  assert.match(zeta, /<button>Mark applied<\/button>.*Skip.*Snooze 7d<\/button><\/form><form method="post" action="\/signal\/[0-9a-f]{64}\/reopen"><button class="secondary outline">Reopen<\/button><\/form><\/footer>/);
  assert.doesNotMatch(zeta, />Later</);
  assert.match(cardOf(html, db, 'alpha'), /Compose.*Skip.*Snooze 7d.*Reopen/);

  // Reopen returns it to Pending; Skip sends it to History; Snooze to History until due.
  post(db, signalId(db, 'zeta'), 'reopen');
  post(db, signalId(db, 'alpha'), 'skip', 'reason=geo');
  post(db, signalId(db, 'beta'), 'snooze');
  const after = get(db).body;
  assert.deepEqual(section(after, 'pending'), ['warmco', 'zeta']);
  assert.deepEqual(section(after, 'later'), []);
  assert.deepEqual(section(after, 'history'), ['alpha', 'beta']);
  assert.deepEqual(status(db, 'zeta'), { status: 'new', skip_reason: null, snooze_until: null });
  db.close();
});

test('the page orders apply signals with a B2B posting first, and B2B postings first in a card, as the digest does', () => {
  const db = openDb(':memory:');
  seed(db, [
    [company('aardvark'), [posting('k1', 'Senior Software Engineer, Contract')]],
    [company('zulu'), [posting('u1', 'Backend Engineer, Contract'), posting('u2', 'Software Engineer', 'Outside IR35.')]],
  ]);
  const html = get(db).body;
  assert.deepEqual(section(html, 'pending'), ['zulu', 'aardvark']);
  assert.match(cardOf(html, db, 'zulu'), /<ul><li><a href="https:\/\/example.test\/u2">Software Engineer<\/a> — London <small>\[b2b:outside ir35 · unknown:🇬🇧 GB\]<\/small><\/li><li><a href="https:\/\/example.test\/u1">/);
  // History keeps the same order within a run date.
  for (const companyId of ['zulu', 'aardvark']) post(db, signalId(db, companyId), 'applied');
  assert.deepEqual(section(get(db).body, 'history'), ['zulu', 'aardvark']);
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
  const history = sectionHtml(html, 'history');
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

test('a button press another website sends is refused and changes nothing; same-origin and non-browser presses pass', () => {
  const db = openDb(':memory:');
  standard(db);
  const id = signalId(db, 'zeta');
  const press = (headers: Record<string, string>) =>
    handle(db, { method: 'POST', url: `/signal/${id}/applied`, headers: { host: 'pipeline.tail1234.ts.net:8787', ...headers } }, today);
  const rows = allSignals(db);

  for (const headers of <Record<string, string>[]>[
    { origin: 'https://evil.test' },
    { origin: 'http://pipeline.tail1234.ts.net:9999' },
    { origin: 'http://pipeline.tail1234.ts.net' },
    { origin: 'null' },
    { origin: 'not a url' },
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
    // Origin decides when present, even if Sec-Fetch-Site says same-origin.
    { origin: 'https://evil.test', 'sec-fetch-site': 'same-origin' },
  ]) {
    const res = press(headers);
    assert.equal(res.status, 403, JSON.stringify(headers));
    assert.equal(res.body, 'cross-site request refused');
  }
  // An Origin with no Host to compare it to is refused too.
  assert.equal(handle(db, { method: 'POST', url: `/signal/${id}/applied`, headers: { origin: 'http://127.0.0.1:8787' } }, today).status, 403);
  assert.deepEqual(allSignals(db), rows);

  // GET is not checked.
  assert.equal(handle(db, { method: 'GET', url: '/', headers: { origin: 'https://evil.test', 'sec-fetch-site': 'cross-site' } }, today).status, 200);

  // Same origin, compared case-insensitively.
  assert.equal(press({ origin: 'http://Pipeline.tail1234.ts.net:8787', 'sec-fetch-site': 'same-origin' }).status, 303);
  assert.equal(status(db, 'zeta').status, 'applied');
  db.prepare("update signals set status = 'new' where company_id = 'zeta'").run();
  // No Origin: Sec-Fetch-Site same-origin or none (typed into the address bar) passes.
  assert.equal(press({ 'sec-fetch-site': 'same-origin' }).status, 303);
  assert.equal(press({ 'sec-fetch-site': 'none' }).status, 303);
  // Neither header: not a browser, passes.
  assert.equal(press({}).status, 303);
  assert.equal(handle(db, { method: 'POST', url: `/signal/${id}/applied`, headers: {} }, today).status, 303);
  // A default port written out in Host matches the origin that omits it.
  const https = handle(db, { method: 'POST', url: `/signal/${id}/snooze`,
    headers: { host: 'pipeline.tail1234.ts.net:443', origin: 'https://pipeline.tail1234.ts.net' } }, today);
  assert.equal(https.status, 303);
  assert.equal(status(db, 'zeta').status, 'snoozed');
  db.close();
});

test('GET /pico.css serves the vendored stylesheet the page links, and the page loads nothing else', () => {
  const db = openDb(':memory:');
  standard(db);
  const css = handle(db, { method: 'GET', url: '/pico.css' }, today);
  assert.equal(css.status, 200);
  assert.deepEqual(css.headers, { 'content-type': 'text/css', 'cache-control': 'max-age=86400' });
  assert.match(css.body, /Pico CSS .* v2\.\d+\.\d+/);
  const html = get(db).body;
  assert.match(html, /<link rel="stylesheet" href="\/pico.css">/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href="https?:|@import|url\(/);
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

test('a gone posting is hidden on an unsent card and struck through on a notified one, as Telegram showed it', () => {
  const db = openDb(':memory:');
  const live = posting('m1', 'Software Engineer');
  seed(db, [[company('mix'), [live, posting('m2', 'Backend Engineer')]], [company('old'), [posting('o1', 'Platform Engineer'), posting('o2', 'Data Engineer')]]]);
  seed(db, [[company('mix'), [live]], [company('old'), [posting('o1', 'Platform Engineer')]]], '2026-11-03');
  db.prepare("update signals set status = 'notified' where company_id = 'old'").run();
  const html = handle(db, { method: 'GET', url: '/' }, '2026-11-03').body;

  assert.deepEqual(section(html, 'pending'), ['mix', 'old']);
  assert.match(html, /<\/h1><p>0 apply · 2 outreach waiting · 0 dropped postings today<\/p><\/header>/);
  const mix = cardOf(html, db, 'mix');
  assert.match(mix, /<li><a href="https:\/\/example.test\/m1">Software Engineer<\/a>/);
  assert.doesNotMatch(mix, /Backend Engineer|<s>|gone/);

  const old = cardOf(html, db, 'old');
  assert.match(old, /<ul><li><a href="https:\/\/example.test\/o1">Platform Engineer<\/a> — London <small>\[perm · unknown:🇬🇧 GB\]<\/small><\/li>/);
  assert.match(old, /<li><s><a href="https:\/\/example.test\/o2">Data Engineer<\/a><\/s> — London <small>\[perm · unknown:🇬🇧 GB\] · gone<\/small><\/li><\/ul>/);
  // Compose on the notified card drafts for the live posting only.
  const href = old.match(/<a role="button" href="(mailto:[^"]+)">Compose<\/a>/)?.[1];
  assert.ok(href);
  assert.equal(decodeURIComponent(href.replaceAll('&amp;', '&').split('&body=')[1]), composeBody('old', ['Platform Engineer']));
  db.close();
});

test('the page renders a signal whose postings are all gone, in History while new and in Pending once notified', () => {
  const db = openDb(':memory:');
  seed(db, [[company('dead'), [posting('d1', 'Software Engineer')]]]);
  seed(db, [[company('dead'), []]], '2026-11-03');
  const before = handle(db, { method: 'GET', url: '/' }, '2026-11-03');
  assert.equal(before.status, 200);
  assert.deepEqual(section(before.body, 'pending'), []);
  assert.deepEqual(section(before.body, 'history'), ['dead']);

  db.prepare("update signals set status = 'notified'").run();
  const html = handle(db, { method: 'GET', url: '/' }, '2026-11-03').body;
  assert.deepEqual(section(html, 'pending'), ['dead']);
  const dead = cardOf(html, db, 'dead');
  assert.match(dead, /<li><s><a href="https:\/\/example.test\/d1">Software Engineer<\/a><\/s> — London <small>\[perm · unknown:🇬🇧 GB\] · gone<\/small><\/li>/);
  // No live posting: Compose falls back to every title.
  const href = dead.match(/<a role="button" href="(mailto:[^"]+)">Compose<\/a>/)?.[1];
  assert.ok(href);
  assert.equal(decodeURIComponent(href.replaceAll('&amp;', '&').split('&body=')[1]), composeBody('dead', ['Software Engineer']));
  db.close();
});

test('the card header shows the local time the run started, and only the date when the run has no row', () => {
  const db = openDb(':memory:');
  standard(db);
  const startedAt = '2026-11-02T14:34:53.325Z';
  db.prepare('delete from runs').run();
  assert.match(cardOf(get(db).body, db, 'zeta'), /run 2026-11-02(<| <span)/);
  db.prepare('insert into runs (run_date, started_at) values (?, ?)').run(today, startedAt);
  const d = new Date(startedAt);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  assert.match(cardOf(get(db).body, db, 'zeta'), new RegExp(`run 2026-11-02 ${hhmm}(<| <span)`));
  assert.equal(runTime(undefined), '');
  assert.equal(runTime('not a date'), '');
  db.close();
});

test('an employer signal card says employer after the list name', () => {
  const db = openDb(':memory:');
  seed(db, [[employer('n8nish', {}, { country: 'DE' }), [{ ...posting('n1', 'Senior Software Engineer'), location: 'Remote (Europe)' }]]]);
  const card = cardOf(get(db).body, db, 'n8nish');
  assert.match(card, /<b>n8nish<\/b> · 🇩🇪 DE · greenhouse · <b>APPLY<\/b> · employer · run 2026-11-02/);
  // The scope, not the company's country (core/location.ts employerRule).
  assert.match(card, /\[employer · remote:europe\]/);
  assert.match(card, /<button>Mark applied<\/button>/);
  assert.doesNotMatch(card, /Compose/);
  db.close();
});

// The Employers tab's group headings and card ids, in page order.
const employerOrder = (html: string) =>
  [...sectionHtml(html, 'employers').matchAll(/<h3>(.*?)<\/h3>|<article id="e-([^"]+)">/g)].map((m) => m[1] ?? m[2]);

const employerCard = (html: string, id: string) => {
  const start = html.indexOf(`<article id="e-${id}">`);
  assert.ok(start >= 0, `no employer card for ${id}`);
  return html.slice(start, html.indexOf('</article>', start) + '</article>'.length);
};

test('an employer card shows the profile from the yaml and the board line from the database', () => {
  const db = openDb(':memory:');
  const stripeish = employer('stripeish', {
    group: 'payments-fintech', bar: 'reach', why: 'Payments behind the checkouts he built',
    remote: { europe: 'partial', says: 'Remote only in named countries', source: 'https://stripeish.test/blog/remote' },
  }, { name: 'Stripeish', country: 'US' });
  seed(db, [[stripeish, [
    posting('s1', 'Software Engineer'), { ...posting('s2', 'Senior Software Engineer'), location: 'Remote (Europe)' },
    posting('s3', 'Account Executive'), posting('s4', 'Backend Engineer'),
  ]]]);
  // s4 leaves the board the next night: three live postings, two of them engineering, one kept.
  seed(db, [[stripeish, [posting('s1', 'Software Engineer'), { ...posting('s2', 'Senior Software Engineer'), location: 'Remote (Europe)' },
    posting('s3', 'Account Executive')]]], '2026-11-03');
  const unpolled = employer('linearish', {}, { name: 'Linearish' });
  const unread = employer('klarnaish', { remote: { europe: 'unknown', says: 'Nothing found', source: 'https://klarnaish.test/' } },
    { name: 'Klarnaish', ats: null });
  const html = get(db, [stripeish, unpolled, unread]).body;

  assert.equal(employerCard(html, 'stripeish'),
    '<article id="e-stripeish"><header><a href="https://stripeish.test/careers"><b>Stripeish</b></a> · 🇺🇸 US ' +
    '<span class="badge">reach</span> <span class="badge b-muted">Europe: partial</span></header>' +
    '<p>Payments behind the checkouts he built</p>' +
    '<p class="meta">Remote: Remote only in named countries (<a href="https://stripeish.test/blog/remote">stripeish.test</a>)</p>' +
    '<p class="meta">Board: greenhouse · 3 live postings, 2 engineering, 1 kept · last seen 2026-11-03</p></article>');
  // A board the pipeline reads but has not polled yet, and one it cannot read.
  assert.match(employerCard(html, 'linearish'), /<span class="badge b-yes">Europe: yes<\/span>/);
  assert.match(employerCard(html, 'linearish'), /<p class="meta">Board: greenhouse · not polled yet<\/p><\/article>$/);
  assert.match(employerCard(html, 'klarnaish'), /<span class="badge b-muted">Europe: unknown<\/span>/);
  assert.match(employerCard(html, 'klarnaish'), /<p class="meta">Board: not read<\/p><\/article>$/);
  // Read-only.
  assert.doesNotMatch(sectionHtml(html, 'employers'), /<form|<button|mailto:/);
  db.close();
});

test('the Employers tab groups in research order, then orders by bar (reach, fit, stretch) and name', () => {
  const db = openDb(':memory:');
  const html = get(db, [
    employer('zed', { group: 'devtools-ai', bar: 'stretch' }),
    employer('nate', { group: 'remote-first-europe', bar: 'fit' }),
    employer('amy', { group: 'devtools-ai', bar: 'stretch' }),
    employer('bob', { group: 'devtools-ai', bar: 'reach' }),
    employer('cal', { group: 'devtools-ai', bar: 'fit' }),
    employer('pay', { group: 'payments-fintech', bar: 'stretch' }),
    employer('shop', { group: 'commerce-platforms', bar: 'fit' }),
    employer('adj', { group: 'commerce-adjacent', bar: 'reach' }),
    // An agency is not on the tab.
    company('agencyco'),
  ]).body;
  assert.match(html, />Employers \(8\)<\/button>/);
  assert.deepEqual(employerOrder(html), [
    'Payments and fintech', 'pay', 'Commerce platforms', 'shop', 'Commerce-adjacent', 'adj',
    'Developer tools and AI', 'bob', 'cal', 'amy', 'zed', 'Remote-first Europe', 'nate',
  ]);
  db.close();
});

test('an employer card escapes its text and links', () => {
  const db = openDb(':memory:');
  const html = get(db, [employer('ab', {
    why: 'Builds <b>things</b> & more',
    remote: { europe: 'yes', says: 'Remote "anywhere" <EU>', source: 'not a url <x>' },
  }, { name: 'A&B <Co>', careers_url: 'https://ab.test/jobs?a=1&b="2"' })]).body;
  const card = employerCard(html, 'ab');
  assert.match(card, /<a href="https:\/\/ab.test\/jobs\?a=1&amp;b=&quot;2&quot;"><b>A&amp;B &lt;Co&gt;<\/b><\/a>/);
  assert.match(card, /<p>Builds &lt;b&gt;things&lt;\/b&gt; &amp; more<\/p>/);
  assert.match(card, /Remote: Remote &quot;anywhere&quot; &lt;EU&gt; \(<a href="not a url &lt;x&gt;">not a url &lt;x&gt;<\/a>\)/);
  assert.doesNotMatch(card, /<Co>|<EU>|<x>|<b>things/);
  db.close();
});

test('without companies given, the Employers tab lists the employers in universe/companies.yaml', () => {
  const db = openDb(':memory:');
  const employers = loadCompanies().filter((c) => c.kind === 'employer');
  const html = handle(db, { method: 'GET', url: '/' }, today).body;
  assert.match(html, new RegExp(`>Employers \\(${employers.length}\\)</button>`));
  assert.equal(employerOrder(html).filter((x) => !/^[A-Z]/.test(x)).length, employers.length);
  assert.match(employerCard(html, 'stripe'), /<b>Stripe<\/b><\/a> · 🇺🇸 US <span class="badge">reach<\/span>/);
  assert.match(employerCard(html, 'stripe'), /Board: greenhouse · not polled yet/);
  db.close();
});
