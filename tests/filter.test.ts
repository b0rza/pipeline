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
  ]);
});

test('classify routes B2B words to apply with a b2b reason, ahead of the contract words', () => {
  const b2b = (reason: string, items: [string, string?][]) => cases({ route: 'apply', reason: `b2b:${reason}` }, items);
  b2b('outside ir35', [['Software Engineer', '£550 day rate (Outside IR35).'], ['Outside IR35 Contract Developer']]);
  b2b('outside of ir35', [['Software Engineer', 'This role sits outside of IR35.']]);
  b2b('c2c', [['Software Engineer', '$65/hr W2 hourly // $80-$95/hr C2C.'], ['Java Developer (C2C)']]);
  b2b('corp-to-corp', [['Software Engineer', 'Corp-to-corp (C2C) welcome.']]);
  b2b('corp to corp', [['Software Engineer', 'Open to corp to corp.']]);
  b2b('1099', [['Software Engineer', 'Paid as a 1099 contractor.']]);
  b2b('zzp', [['Senior Ontwikkelaar (ZZP)'], ['Software Engineer', 'Ben je ZZP\'er? Dan horen we graag van je.']]);
  b2b('zzper', [['Software Engineer', 'Wij zoeken een zzper voor zes maanden.']]);
  b2b('freelance opdracht', [['Ontwikkelaar', 'Dit is een freelance opdracht van 6 maanden.']]);
  b2b('freelance opdracht', [['Freelance opdracht: Java Developer']]);
  b2b('underkonsult', [['Systemutvecklare', 'Uppdraget är som underkonsult via oss.']]);
  b2b('underkonsulter', [['Backend-utvecklare', 'Vi tar emot underkonsulter.']]);
  b2b('frilans', [['Utvecklare (frilans)']]);
  b2b('frilansuppdrag', [['Backend-utvecklare', 'Ett frilansuppdrag på 6 månader.']]);
  b2b('umowa b2b', [['Senior Java Developer', 'Forma zatrudnienia: umowa B2B.']]);
  b2b('umowie b2b', [['Frontend Developer', 'Współpraca na umowie B2B.']]);
  b2b('kontrakt b2b', [['Backend Developer', 'Oferujemy kontrakt B2B, 100% zdalnie.']]);
  b2b('contract type: b2b', [['Software Engineer', 'Contract type: B2B']]);
  b2b('b2b contract', [['Software Engineer', 'Paid on a B2B contract.'], ['Backend Developer (B2B contract)']]);
  b2b('b2b-basis', [['Software Engineer', 'Alternativ ist auch eine Zusammenarbeit auf B2B-Basis möglich.']]);
  b2b('self-employed', [['Software Engineer', 'Open to self-employed contractors.']]);
  b2b('als selbstständiger', [['Senior Entwickler (m/w/d)', 'Als Selbstständiger rechnest du direkt mit uns ab.']]);
  b2b('als selbständige', [['Entwickler (m/w/d)', 'Gern auch als Selbständige.']]);
  b2b('auf selbstständiger basis', [['Softwareentwickler (m/w/d)', 'Mitarbeit auf selbstständiger Basis.']]);
  b2b('invoice basis', [['Software Engineer', 'Engaged on an invoice basis.']]);
  b2b('paid on invoice', [['Software Engineer', 'Monthly, paid on invoice.']]);
  // A B2B word beats a contract word in the title.
  b2b('outside ir35', [['Contract Software Engineer', 'Outside IR35.']]);
});

test('classify ignores B2B as a market and German "selbstständig" as "independently"', () => {
  cases({ route: 'outreach', reason: 'perm' }, [
    ['Software Engineer', 'Build our B2B ecommerce platform.'],
    ['Software Engineer', 'Experience with B2B e-commerce and B2B commerce.'],
    ['Software Engineer', 'Our B2B customers love us.'],
    ['Software Engineer', 'You will negotiate B2B contracts with retailers.'],
    ['Shopware Entwickler (m/w/d)', 'Shopware-Projekterfahrung im B2B-Umfeld.'],
    ['Senior Developer', 'Du arbeitest selbstständig, strukturiert und lösungsorientiert.'],
    ['Senior Developer', 'Hohe Selbstständigkeit und Eigenverantwortung.'],
    ['Senior Developer', 'You will work on invoice processing.'],
    // A letter beside the word, in any script, is not a boundary.
    ['Software Engineer', 'Ref: xc2c, ac2cä, 10990.'],
  ]);
});

test('classify marks payroll-only contract postings, keeps them on apply, and leaves perm alone', () => {
  cases({ route: 'apply', reason: 'title:contract · payroll' }, [
    ['Senior Software Engineer, Contract', 'W2 only, no C2C.'],
    ['Contract Java Developer (W-2 only)'],
    ['Contract Backend Engineer', 'Inside IR35, via an umbrella company.'],
    ['Contract Backend Engineer', 'Payroll only.'],
  ]);
  cases({ route: 'apply', reason: 'body:day rate · payroll' }, [['Software Engineer', 'Day rate £500, inside IR35.']]);
  // "no c2c" is the payroll word, not the B2B word.
  cases({ route: 'apply', reason: 'body:6 month contract · payroll' }, [['Software Engineer', 'A 6 month contract. No Corp-to-Corp.']]);
  // A posting that offers both carries both.
  cases({ route: 'apply', reason: 'b2b:outside ir35 · payroll' }, [['Software Engineer', 'Ltd company outside IR35 or Umbrella contract.']]);
  cases({ route: 'outreach', reason: 'perm' }, [['Software Engineer', 'W2 only. No C2C.']]);
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
  assert.match(out, /^APPLY \(1 company, 2 postings\)\nbadger \(GB, greenhouse\)\n {2}- Contract Senior Software Engineer — London \S+ \[title:contract · unknown:GB\]\n {2}- Senior Software Engineer — London \S+ \[perm · unknown:GB\]/);
  assert.match(out, /OUTREACH \(1 company, 2 postings\)/);
  assert.match(out, /dropped: 1 evergreen\nfilter 2026-11-02: 1 apply, 1 outreach, 1 dropped across 2 companies$/);
  db.close();
});

test('filterRun drops postings outside the owner work arrangements and tags the rest', () => {
  const db = openDb(':memory:');
  const mixed = company('mixed');
  const offshore = company('offshore');
  const splitco = { ...company('splitco'), country: 'HR' };
  upsertCompanies(db, [mixed, offshore, splitco]);
  const at = (p: NormalizedPosting, location: string): NormalizedPosting => ({ ...p, location });
  snapshotCompany(db, mixed, [
    at(posting('1', 'Senior Software Engineer'), 'Remote'),
    at(posting('2', 'Senior Software Engineer, Contract'), 'Ahmedabad'),
  ], '2026-11-02');
  snapshotCompany(db, offshore, [at(posting('3', 'Tech Lead'), 'Pune'), at(posting('4', 'Backend Developer'), 'Pune or Bangalore, India')], '2026-11-02');
  snapshotCompany(db, splitco, [
    at(posting('5', 'Frontend Developer', 'This role is on-site only.'), 'Split, Croatia'),
    at(posting('6', 'Backend Developer', 'This role is on-site only.'), 'Zagreb'),
  ], '2026-11-02');
  diffRun(db, '2026-11-02');

  assert.deepEqual(filterRun(db, '2026-11-02'), { apply: 0, outreach: 2, dropped: 4 });
  const signals = db.prepare('select company_id, list, ref_ids from signals order by company_id').all()
    .map((r) => ({ company_id: r.company_id, list: r.list, refs: (JSON.parse(r.ref_ids as string) as string[]).length }));
  assert.deepEqual(signals, [
    { company_id: 'mixed', list: 'outreach', refs: 1 },
    { company_id: 'splitco', list: 'outreach', refs: 1 },
  ]);
  const postings = db.prepare('select external_id, route, route_reason, work_mode, work_country from postings order by external_id')
    .all().map((r) => ({ ...r }));
  assert.deepEqual(postings, [
    { external_id: '1', route: 'outreach', route_reason: 'perm · remote:GB', work_mode: 'remote', work_country: 'GB' },
    { external_id: '2', route: 'drop', route_reason: 'location:IN', work_mode: 'unknown', work_country: 'IN' },
    { external_id: '3', route: 'drop', route_reason: 'location:IN', work_mode: 'unknown', work_country: 'IN' },
    { external_id: '4', route: 'drop', route_reason: 'location:IN', work_mode: 'unknown', work_country: 'IN' },
    { external_id: '5', route: 'outreach', route_reason: 'perm · onsite:split', work_mode: 'onsite', work_country: 'HR' },
    { external_id: '6', route: 'drop', route_reason: 'onsite:HR', work_mode: 'onsite', work_country: 'HR' },
  ]);
  assert.match(report(db, '2026-11-02'), /dropped: 3 location, 1 onsite\n/);
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

test('filterRun tags remote restricted to one country, keeps its route, drops it when the country is out of area', () => {
  const db = openDb(':memory:');
  const usco = { ...company('usco'), country: 'US' };
  const anyco = company('anyco');
  upsertCompanies(db, [usco, anyco]);
  const at = (p: NormalizedPosting, location: string): NormalizedPosting => ({ ...p, location });
  snapshotCompany(db, usco, [
    at(posting('1', 'Shopify Senior Developer', 'This position qualifies for remote work anywhere in the United States.'), 'Remote (United States)'),
    at(posting('2', 'Senior Software Engineer', 'Remote. You must be based in India.'), 'Remote'),
    at(posting('3', 'Contract Senior Software Engineer', 'W2 only.'), 'Remote, Germany'),
  ], '2026-11-05');
  snapshotCompany(db, anyco, [at(posting('4', 'Senior Software Engineer', 'We are a fully remote company.'), 'Remote')], '2026-11-05');
  diffRun(db, '2026-11-05');

  assert.deepEqual(filterRun(db, '2026-11-05'), { apply: 1, outreach: 1, dropped: 1 });
  const postings = db.prepare('select external_id, route, route_reason, work_mode, work_country from postings order by external_id')
    .all().map((r) => ({ ...r }));
  assert.deepEqual(postings, [
    { external_id: '1', route: 'outreach', route_reason: 'perm · remote:US-only', work_mode: 'remote', work_country: 'US' },
    { external_id: '2', route: 'drop', route_reason: 'location:IN', work_mode: 'remote', work_country: 'US' },
    // Contract reason, then payroll, then the location tag.
    { external_id: '3', route: 'apply', route_reason: 'title:contract · payroll · remote:DE-only', work_mode: 'remote', work_country: 'DE' },
    { external_id: '4', route: 'outreach', route_reason: 'perm · remote:GB', work_mode: 'remote', work_country: 'GB' },
  ]);
  const signals = db.prepare('select company_id, list, ref_ids from signals order by company_id').all()
    .map((r) => ({ company_id: r.company_id, list: r.list, refs: (JSON.parse(r.ref_ids as string) as string[]).length }));
  assert.deepEqual(signals, [
    { company_id: 'anyco', list: 'outreach', refs: 1 },
    { company_id: 'usco', list: 'apply', refs: 2 },
  ]);
  assert.match(report(db, '2026-11-05'), /dropped: 1 location\n/);
  db.close();
});

test('filterRun puts an employer\'s engineering postings on apply and keeps only what is open to someone in Croatia', () => {
  const db = openDb(':memory:');
  // Stripe-like: US, office roles in US cities, a few remote ones. n8n-like: DE, remote in Europe.
  const stripeish = { ...company('stripeish'), country: 'US', kind: 'employer' as const };
  const n8nish = { ...company('n8nish'), country: 'DE', kind: 'employer' as const };
  const agency = { ...company('agency'), country: 'US' };
  upsertCompanies(db, [stripeish, n8nish, agency]);
  const at = (p: NormalizedPosting, location: string, raw: unknown = {}): NormalizedPosting => ({ ...p, location, raw });
  snapshotCompany(db, stripeish, [
    at(posting('s1', 'Software Engineer, Payments'), 'San Francisco, CA'),
    at(posting('s2', 'Backend Engineer', 'Hybrid, 3 days per week in the office.'), 'Dublin'),
    at(posting('s3', 'Senior Software Engineer'), 'Remote - US'),
    at(posting('s4', 'Full Stack Engineer'), 'Remote (Europe)'),
    at(posting('s5', 'Account Executive'), 'Remote'),
    at(posting('s6', 'Software Engineer, Billing', 'Remote within Germany, Poland or Spain.'), 'Remote'),
    at(posting('s7', 'Frontend Engineer', 'Hybrid, 2 days per week in the office.'), 'Zagreb, Croatia'),
    at(posting('s8', 'Contract Frontend Engineer'), 'Remote, Croatia'),
    at(posting('s9', 'Platform Engineer', 'This role is on-site only.'), 'Zagreb'),
    at(posting('s10', 'Data Engineer'), 'Bangalore', { workplace_type: 'remote' }),
    at(posting('s11', 'Software Engineer'), 'Split, Croatia'),
    // Real locations from the 2026-11-09 dry run (GitLab, Supabase, Sentry, Anthropic, Cursor).
    at(posting('s12', 'Senior Solutions Architect - Japan'), 'Remote, Japan'),
    at(posting('s13', 'Software Engineer - Auth'), 'Remote, Global', { remote: true }),
    at(posting('s14', 'Support Engineer (AMER)'), 'Remote, AMER', { remote: true }),
    at(posting('s15', 'Senior Software Engineer, AI Platform'), 'San Francisco, California', { remote: true, workplace_type: 'Hybrid' }),
    at(posting('s16', 'Data Center Mechanical Engineer'), 'Remote-Friendly, United States'),
    at(posting('s17', 'Backend Engineer (Ruby), Create: Change Record'), 'Remote, Poland; Remote, United Kingdom'),
    at(posting('s18', 'Field Engineer - South Korea'), 'South Korea', { remote: true }),
  ], '2026-11-09');
  snapshotCompany(db, n8nish, [
    at(posting('n1', 'Senior Software Engineer'), 'Remote (Europe)'),
    at(posting('n2', 'Engineering Talent Pool'), 'Remote'),
    at(posting('n3', 'Fullstack Engineer (B2B contract)'), 'Remote'),
    at(posting('n4', 'Software Engineer'), 'Berlin'),
    at(posting('n5', 'Engineering Manager | Remote | Europe'), 'Berlin Office', { remote: true }),
    at(posting('n6', 'Senior Product Engineer (TS/NodeJS/Vue)'), 'Berlin Office',
      { remote: true, secondary_locations: ['Slovenia', 'Germany', 'London Office', 'United Kingdom', 'Croatia', 'Spain'] }),
    at(posting('n7', 'Forward Deployed Engineer - US East Coast'), 'Boston', { remote: true }),
  ], '2026-11-09');
  snapshotCompany(db, agency, [
    at(posting('a1', 'Senior Software Engineer'), 'San Francisco, CA'),
    // The agency rule is unchanged except for the country table: Japan is no longer read as the company's US.
    at(posting('a2', 'Senior Solutions Architect - Japan'), 'Remote, Japan'),
    at(posting('a3', 'Full Stack Engineer'), 'Remote (Europe)'),
    at(posting('a4', 'Senior Software Engineer'), 'Remote - US'),
  ], '2026-11-09');
  diffRun(db, '2026-11-09');

  assert.deepEqual(filterRun(db, '2026-11-09'), { apply: 2, outreach: 1, dropped: 17 });
  const postings = db.prepare('select external_id, route, route_reason, work_country from postings order by company_id, external_id')
    .all().map((r) => [r.external_id, r.route, r.route_reason, r.work_country]);
  assert.deepEqual(postings, [
    ['a1', 'outreach', 'perm · unknown:US', 'US'],
    ['a2', 'drop', 'location:JP', 'JP'],
    ['a3', 'outreach', 'perm · remote:US', 'US'],
    ['a4', 'outreach', 'perm · remote:US-only', 'US'],
    // A covering scope is tagged by the scope, not the company's country.
    ['n1', 'apply', 'employer · remote:europe', 'DE'],
    ['n2', 'drop', 'evergreen', 'DE'],
    // Nothing said about where: kept for the owner to judge. A B2B posting keeps its reason.
    ['n3', 'apply', 'b2b:b2b contract · remote:unstated', 'DE'],
    ['n4', 'drop', 'employer:not-remote', 'DE'],
    // An office city in the location, the scope in the title.
    ['n5', 'apply', 'employer · remote:europe', 'DE'],
    // Croatia among the secondary locations: tagged and stored as HR.
    ['n6', 'apply', 'employer · remote:HR', 'HR'],
    ['n7', 'drop', 'employer:US-only', 'US'],
    // An office city with nothing said about remote, and hybrid outside Croatia.
    ['s1', 'drop', 'employer:not-remote', 'US'],
    ['s10', 'drop', 'employer:IN-only', 'IN'],
    ['s11', 'apply', 'employer · unknown:HR', 'HR'],
    ['s12', 'drop', 'employer:JP-only', 'JP'],
    ['s13', 'apply', 'employer · remote:global', 'US'],
    ['s14', 'drop', 'employer:elsewhere', 'US'],
    ['s15', 'drop', 'employer:US-only', 'US'],
    ['s16', 'drop', 'employer:US-only', 'US'],
    // A list of countries without Croatia is a restriction.
    ['s17', 'drop', 'employer:elsewhere', 'PL'],
    ['s18', 'drop', 'employer:KR-only', 'KR'],
    ['s2', 'drop', 'employer:not-remote', 'IE'],
    ['s3', 'drop', 'employer:US-only', 'US'],
    ['s4', 'apply', 'employer · remote:europe', 'US'],
    ['s5', 'drop', 'non-engineering', 'US'],
    ['s6', 'drop', 'employer:elsewhere', 'US'],
    ['s7', 'apply', 'employer · hybrid:HR', 'HR'],
    ['s8', 'apply', 'title:contract · remote:HR', 'HR'],
    // In Croatia whatever the mode, but the owner's on-site rule still holds.
    ['s9', 'drop', 'onsite:HR', 'HR'],
  ]);
  // One signal per company, on apply.
  const signals = db.prepare('select company_id, list, ref_ids from signals order by company_id').all()
    .map((r) => [r.company_id, r.list, (JSON.parse(r.ref_ids as string) as string[]).length]);
  assert.deepEqual(signals, [['agency', 'outreach', 3], ['n8nish', 'apply', 4], ['stripeish', 'apply', 5]]);
  assert.match(report(db, '2026-11-09'),
    /dropped: 7 employer:XX-only, 3 employer:elsewhere, 3 employer:not-remote, 1 evergreen, 1 location, 1 non-engineering, 1 onsite\n/);

  // Same day again: no new rows, same values.
  const before = postings;
  filterRun(db, '2026-11-09');
  assert.deepEqual(db.prepare('select external_id, route, route_reason, work_country from postings order by company_id, external_id')
    .all().map((r) => [r.external_id, r.route, r.route_reason, r.work_country]), before);
  assert.equal((db.prepare('select count(*) as n from signals').get() as { n: number }).n, 3);
  db.close();
});
