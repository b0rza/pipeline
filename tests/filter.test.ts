import assert from 'node:assert/strict';
import { test } from 'node:test';
import { upsertCompanies } from '../core/companies.ts';
import { openDb } from '../core/db.ts';
import { diffRun } from '../core/diff.ts';
import { classify, filterRun, report } from '../core/filter.ts';
import { snapshotCompany } from '../core/snapshot.ts';
import type { Company, NormalizedPosting } from '../core/types.ts';

const cases = (expected: { route: string; reason: string | RegExp }, items: [string, string?][]) => {
  for (const [title, body = ''] of items) {
    const got = classify(title, body);
    assert.equal(got.route, expected.route, `${title} → ${got.route} [${got.reason}]`);
    if (typeof expected.reason === 'string') assert.equal(got.reason, expected.reason, title);
    else assert.match(got.reason, expected.reason, title);
  }
};

test('classify drops evergreen titles', () => {
  cases({ route: 'drop', reason: 'evergreen' }, [
    ['Engineering Talent Pool'], ['Candidate Pool'], ['Initiativbewerbung (m/w/d)'], ['Unsolicited application (d/f/m)'],
    ['General Application'], ['Join our Team - General Job Application'], ['Open Application'],
    ['Spontaneous application'], ['We are always looking for talented people'], ['Join Our Talent Network - Openings USA'],
    ['Developer Talent Community'], ['D365 CE Contractors - Register Here'], ['Software Engineer Open Positions'],
    ['AI Roles Pipeline'], ['QA Analyst Pipeline'], ['Freelancer - Berlin'], ['Freelancer - Köln'],
    ['Future Talent: Solution Architect – Digital Transformation (m/w/d)'],
  ]);
});

test('classify drops titles without an engineering term, even with contract words', () => {
  cases({ route: 'drop', reason: 'non-engineering' }, [
    ['Senior UX Designer'], ['Project Manager'], ['Contract Senior UX Designer - 8 Week Duration'],
    ['Freelance Principal UX Researcher'], ['Genesys Workforce Management (WFM) Consultant'],
    ['Technical Program Manager', 'This role is offered on a contract basis.'],
  ]);
});

test('classify keeps engineering titles across languages', () => {
  cases({ route: 'outreach', reason: 'perm' }, [
    ['Solutions Architect'], ['Data Engineer'], ['Software Engineering Manager'], ['SDET'], ['Tech Lead'],
    ['Technical Lead (Cape Town)'], ['Senior Fullstack Developer (Philippines)'], ['Järjestelmäintegraatioiden ohjelmistokehittäjä (.NET / Azure)'],
    ['Senior Frontend Entwickler (m/w/d)'], ['Backend-utvecklare'], ['Senior Ontwikkelaar'],
  ]);
});

test('classify routes contract titles to apply', () => {
  cases({ route: 'apply', reason: 'title:contract' }, [
    ['Contract Senior Software Engineer'], ['Senior Full Stack Engineer, Contract'], ['Data Architect, Databricks - Contract'],
    ['DataBricks Engineer - Contract'],
  ]);
  cases({ route: 'apply', reason: 'title:freelance' }, [['Senior SitecoreAI DAM Consultant / Architect (Freelance) (m/f/d)']]);
  cases({ route: 'apply', reason: 'title:contractors' }, [['Java Developer Contractors']]);
  cases({ route: 'apply', reason: /^title:/ }, [
    ['Interim CTO'], ['Backend Engineer (fixed-term)'], ['Frontend Developer (temporary)'], ['Entwickler (m/w/d) befristet'],
  ]);
});

test('classify routes contract body phrases to apply', () => {
  cases({ route: 'apply', reason: 'body:initial contract' }, [
    ['Senior QA Engineer - Century CIty', 'Initial contract duration: 6 months (likely to extend)'],
  ]);
  cases({ route: 'apply', reason: 'body:long-term contract' }, [
    ['Senior Software Engineer', 'Compensation: $45/hr W-2 Hourly, long-term contract'],
  ]);
  cases({ route: 'apply', reason: /^body:/ }, [
    ['Software Engineer', 'Engaged on a contract basis.'],
    ['Software Engineer', 'This is a contract role.'],
    ['Software Engineer', 'A 6-month contract with a view to extend.'],
    ['Software Engineer', 'Day rate: £550.'],
    ['Software Engineer', 'Paid on a B2B contract.'],
    ['Software Engineer', 'Corp-to-corp (C2C) welcome.'],
  ]);
});

test('classify keeps permanent postings that mention a contract on outreach', () => {
  cases({ route: 'outreach', reason: 'perm' }, [
    ['Data Engineer', 'Wat bieden wij? Een vast contract, 25 vakantiedagen.'],
    ['Senior Tech Lead / Full-Stack & DevOps Engineer (m/f/d)', 'Employment under a Spanish employment contract.'],
    ['Senior Software Engineer', 'You will support contract negotiation with suppliers.'],
    ['Senior QA Engineer', 'Experience with API contract testing (Pact).'],
    ['Senior Software Engineer', 'All contractual terms are agreed at offer stage.'],
    ['Senior Requirement Engineer (m/w/d)', 'Kundenbeziehungen im B2B-Umfeld weiterentwickeln.'],
    ['QA Automation Engineer', 'Clients from iconic global brands to B2B industry titans.'],
    ['Senior Backend Entwickler (m/w/d)', 'Ein unbefristeter Arbeitsvertrag.'],
  ]);
});

const company = (id: string): Company => ({
  id, name: id, domain: `${id}.test`, country: 'GB', phases: ['p1'],
  source: 'test', ats: { vendor: 'greenhouse', slug: id }, storefront: null, status: 'active', warm: false,
});

const posting = (external_id: string, title: string, body = ''): NormalizedPosting => ({
  external_id, title, location: 'London', url: `https://example.test/${external_id}`, body, posted_at: null, raw: {},
});

test('filterRun writes one signal per company, idempotent, keeps the owner status', () => {
  const db = openDb(':memory:');
  const badger = company('badger');
  const codal = company('codal');
  upsertCompanies(db, [badger, codal]);
  snapshotCompany(db, badger, [
    posting('1', 'Contract Senior Software Engineer'),
    posting('2', 'Senior Software Engineer'),
    posting('3', 'Engineering Talent Pool'),
  ], '2026-11-02');
  snapshotCompany(db, codal, [posting('4', 'Tech Lead - Full Stack'), posting('5', 'Solutions Architect')], '2026-11-02');
  diffRun(db, '2026-11-02');

  assert.deepEqual(filterRun(db, '2026-11-02'), { apply: 1, outreach: 1, dropped: 1 });
  const signals = () => db.prepare(`
    select s.company_id, s.list, s.kinds, s.ref_ids, s.status from signals s order by s.company_id`).all()
    .map((r) => ({ ...r, ref_ids: (JSON.parse(r.ref_ids as string) as string[]).length }));
  const routes = () => db.prepare('select external_id, route, route_reason from postings order by external_id').all().map((r) => ({ ...r }));
  const expected = [
    { company_id: 'badger', list: 'apply', kinds: '["posting_new"]', ref_ids: 2, status: 'new' },
    { company_id: 'codal', list: 'outreach', kinds: '["posting_new"]', ref_ids: 2, status: 'new' },
  ];
  assert.deepEqual(signals(), expected);
  const talentPool = routes().find((r) => r.external_id === '3')!;
  assert.deepEqual([talentPool.route, talentPool.route_reason], ['drop', 'evergreen']);

  // same day again: same rows, same values
  const before = routes();
  assert.deepEqual(filterRun(db, '2026-11-02'), { apply: 1, outreach: 1, dropped: 1 });
  assert.deepEqual(signals(), expected);
  assert.deepEqual(routes(), before);

  // the owner's action survives a re-run
  db.prepare("update signals set status = 'skipped', skip_reason = 'bad fit' where company_id = 'badger'").run();
  filterRun(db, '2026-11-02');
  assert.deepEqual(
    { ...db.prepare("select status, skip_reason from signals where company_id = 'badger'").get() },
    { status: 'skipped', skip_reason: 'bad fit' },
  );

  const out = report(db, '2026-11-02');
  assert.match(out, /^APPLY \(1 company, 2 postings\)\nbadger \(GB, greenhouse\)\n {2}- Contract Senior Software Engineer — London \S+ \[title:contract\]/);
  assert.match(out, /OUTREACH \(1 company, 2 postings\)/);
  assert.match(out, /dropped: 1 evergreen\nfilter 2026-11-02: 1 apply, 1 outreach, 1 dropped across 2 companies$/);
  db.close();
});

test('filterRun ignores gone postings and removes untouched signals that no longer hold', () => {
  const db = openDb(':memory:');
  const acme = company('acme');
  upsertCompanies(db, [acme]);
  snapshotCompany(db, acme, [posting('1', 'Senior Software Engineer')], '2026-11-01');
  diffRun(db, '2026-11-01');
  assert.deepEqual(filterRun(db, '2026-11-01'), { apply: 0, outreach: 1, dropped: 0 });

  // day 2: the only posting goes; nothing to signal
  snapshotCompany(db, acme, [], '2026-11-02');
  diffRun(db, '2026-11-02');
  assert.deepEqual(filterRun(db, '2026-11-02'), { apply: 0, outreach: 0, dropped: 0 });
  assert.equal((db.prepare("select count(*) as n from signals where run_date = '2026-11-02'").get() as { n: number }).n, 0);

  // a stale day-1 signal (status new) with nothing kept is deleted on re-run
  db.prepare("update postings set title = 'Engineering Talent Pool'").run();
  filterRun(db, '2026-11-01');
  assert.equal((db.prepare('select count(*) as n from signals').get() as { n: number }).n, 0);
  db.close();
});
