import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ashby } from '../adapters/ats/ashby.ts';
import { bamboohr } from '../adapters/ats/bamboohr.ts';
import { breezy } from '../adapters/ats/breezy.ts';
import { greenhouse } from '../adapters/ats/greenhouse.ts';
import { fetchPostings } from '../adapters/ats/index.ts';
import { jazzhr } from '../adapters/ats/jazzhr.ts';
import { lever } from '../adapters/ats/lever.ts';
import { personio } from '../adapters/ats/personio.ts';
import { recruitee } from '../adapters/ats/recruitee.ts';
import { rippling } from '../adapters/ats/rippling.ts';
import { smartrecruiters } from '../adapters/ats/smartrecruiters.ts';
import { teamtailor } from '../adapters/ats/teamtailor.ts';
import { workable } from '../adapters/ats/workable.ts';
import { zoho } from '../adapters/ats/zoho.ts';
import { htmlToText } from '../core/html.ts';
import type { Company, NormalizedPosting } from '../core/types.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

function assertWellFormed(postings: NormalizedPosting[], count: number) {
  assert.equal(postings.length, count);
  for (const p of postings) {
    assert.ok(p.external_id, 'external_id');
    assert.ok(p.title, 'title');
    assert.match(p.url, /^https:\/\//);
    assert.ok(p.posted_at && !Number.isNaN(Date.parse(p.posted_at)), 'posted_at');
    assert.ok(p.body.length > 20, 'body has text');
    assert.ok(!p.body.includes('<'), `body has no tags: ${p.body.slice(0, 80)}`);
    assert.ok(!p.body.includes('&lt;') && !p.body.includes('&nbsp;'), 'body has no entities');
  }
}

test('greenhouse fixture', () => {
  const postings = greenhouse.parse(fixture('greenhouse.json'), 'application/json', 'getyourguide');
  assertWellFormed(postings, 2);
  assert.equal(postings[0].external_id, '8173479');
  assert.equal(postings[0].location, 'Berlin');
  assert.equal(postings[0].posted_at, '2026-09-02T14:30:55.000Z');
  assert.ok(postings[0].body.startsWith('Change the way the world travels\n'));
});

test('lever fixture', () => {
  const postings = lever.parse(fixture('lever.json'), 'application/json', 'emma-sleep');
  assertWellFormed(postings, 2);
  assert.equal(postings[0].external_id, '83014287-152d-4fa2-90b7-0e374b0839c4');
  assert.equal(postings[0].posted_at, new Date(1788943888896).toISOString());
  assert.ok(postings[0].body.includes('What you´ll do:'), 'list heading kept');
  assert.equal((postings[0].raw as { commitment: string }).commitment, 'Permanent – Full Time');
});

test('personio fixture', () => {
  const postings = personio.parse(fixture('personio.xml'), 'text/xml; charset=UTF-8', 'eshop-guide');
  assertWellFormed(postings, 2);
  assert.equal(postings[0].url, 'https://eshop-guide.jobs.personio.de/job/1845935');
  assert.equal(postings[0].location, 'Bochum, Berlin');
  assert.ok(postings[0].body.includes('Deine Mission'));
  assert.equal((postings[1].raw as { seniority: string }).seniority, 'experienced');
});

test('personio rejects an HTML 404 page', () => {
  assert.throws(() => personio.parse('<!doctype html><html><body>Not found</body></html>', 'text/html', 'dead'));
});

test('teamtailor fixture', () => {
  const postings = teamtailor.parse(fixture('teamtailor.json'), 'application/feed+json; charset=utf-8', 'careers.columbusglobal.com');
  assertWellFormed(postings, 2);
  assert.equal(postings[0].external_id, '437caf58-5987-404f-890c-48504bdf297a');
  assert.equal(postings[0].url, 'https://careers.columbusglobal.com/jobs/8564433-m3-cloudsuite-integration-architect');
  assert.equal(postings[0].posted_at, '2026-10-16T16:07:10.000Z');
  assert.deepEqual(postings[0].raw, {
    job_id: '8564433', employment_type: 'FULL_TIME', remote: true, applicant_countries: ['Denmark'],
    countries: ['US'], hiring_organization: 'Columbus',
  });
  assert.equal(postings[1].location, 'Tønsberg, Norway');
  assert.ok(postings[1].body.startsWith('Senior Dynamics 365-konsulent'));
});

test('teamtailor feedUrl takes a subdomain slug or a custom-domain host', () => {
  assert.equal(teamtailor.feedUrl('vincitoyj'), 'https://vincitoyj.teamtailor.com/jobs.json');
  assert.equal(teamtailor.feedUrl('career.novicell.co.uk'), 'https://career.novicell.co.uk/jobs.json');
});

test('teamtailor rejects an HTML careers page', () => {
  assert.throws(() => teamtailor.parse('<!doctype html><html><body>Jobs</body></html>', 'text/html', 'dead'));
});

test('jazzhr list page and job page', () => {
  const list = jazzhr.parse(fixture('jazzhr-list.html'), 'text/html; charset=UTF-8', 'ConcordUSA');
  assert.deepEqual(list.map((p) => [p.external_id, p.title, p.location, p.body, p.posted_at]), [
    ['9i8L5P5TVU', 'Business Intelligence Engineer', 'Kansas City or Minneapolis, MO', '', null],
    ['pecO9wzTZE', 'Salesforce Commerce Cloud (SFCC) Architect/Lead', 'Multiple Cities/States, CA', '', null],
  ]);
  assert.equal(list[0].url, 'https://concordusa.applytojob.com/apply/9i8L5P5TVU/Business-Intelligence-Engineer');
  assert.deepEqual(list[0].raw, { department: 'Data and Analytics' });
  assert.equal(jazzhr.detail!.url(list[1], 'ConcordUSA'), list[1].url);
  const job = jazzhr.detail!.parse(fixture('jazzhr-job.html'), 'text/html; charset=UTF-8', list[1]);
  assertWellFormed([job], 1);
  assert.equal(job.posted_at, '2026-10-28T00:00:00.000Z');
  assert.ok(job.body.startsWith('Location: Prefer candidates in the LA area'));
  assert.deepEqual(job.raw, {
    department: null, employment_type: 'CONTRACTOR', remote: false, applicant_countries: [], experience: 'Experienced',
    valid_through: '2027-01-26', job_code: 'job_20261028151156_NXGUHZTL1OHT79CI',
  });
});

test('jazzhr feedUrl lowercases the slug', () => {
  assert.equal(jazzhr.feedUrl('ConcordUSA'), 'https://concordusa.applytojob.com/apply');
});

test('jazzhr rejects an inactive board and a job page without JobPosting', () => {
  const inactive = '<html><head><title>JazzHR - Inactive Career Page</title></head><body></body></html>';
  assert.throws(() => jazzhr.parse(inactive, 'text/html', 'avatria'), /no job list/);
  const [p] = jazzhr.parse(fixture('jazzhr-list.html'), 'text/html', 'concordusa');
  assert.throws(() => jazzhr.detail!.parse(inactive, 'text/html', p), /no JobPosting/);
});

test('jazzhr older resumator template list page', () => {
  const list = jazzhr.parse(fixture('jazzhr-resumator-list.html'), 'text/html; charset=UTF-8', 'plumtreegroup');
  assert.deepEqual(list.map((p) => [p.external_id, p.title, p.location, p.raw, p.body, p.posted_at]), [
    ['z7gUEEsP7f', 'AI Engineering Lead', 'Remote', { department: null }, '', null],
    ['cJ2hjqv9yW', 'Business Growth & Operations Manager', 'Karachi, Sindh, Pakistan', { department: null }, '', null],
    ['jQylQMyZRE', 'SEM/PPC/Paid Social Specialist', 'Chicago, IL', { department: 'Phase 3 Commerce - Customer Acquisition' }, '', null],
  ]);
  assert.equal(list[0].url, 'https://plumtreegroup.applytojob.com/apply/z7gUEEsP7f/AI-Engineering-Lead');
  const empty = '<div id="resumator-content-left" class="resumator-home-joblist">\n'
    + '<div class="resumator-jobs-text" id="resumator-jobs-title">Current Openings</div>\n</div>';
  assert.deepEqual(jazzhr.parse(empty, 'text/html', 'plumtreegroup'), []);
});

test('jazzhr resumator job page without JobPosting takes the page description', () => {
  const posting = {
    external_id: 'Iec1yyOgvP', title: 'AI Engineering Lead (LATAM)', location: 'Remote', body: '', posted_at: null,
    url: 'https://plumtreegroup.applytojob.com/apply/Iec1yyOgvP/AI-Engineering-Lead-LATAM', raw: { department: null },
  };
  const job = jazzhr.detail!.parse(fixture('jazzhr-resumator-job.html'), 'text/html; charset=UTF-8', posting);
  assert.ok(job.body.startsWith('We’re Hiring: AI Engineering Lead\n\nCompany: CoPilot Innovations'), job.body);
  assert.ok(job.body.includes('help shape the future of AI engineering at CoPilot Innovations.'));
  assert.ok(!job.body.includes('<') && !job.body.includes('Share Job'));
  assert.equal(job.posted_at, null);
  assert.deepEqual(job.raw, { department: null });
});

test('jazzhr open-application page without JobPosting takes the page description', () => {
  const pool = {
    external_id: 'swMdqwV0MY', title: 'Candidate Pool', location: null, body: '', posted_at: null,
    url: 'https://classyllama.applytojob.com/apply/swMdqwV0MY/Candidate-Pool', raw: { department: null },
  };
  const job = jazzhr.detail!.parse(fixture('jazzhr-pool.html'), 'text/html; charset=UTF-8', pool);
  assert.ok(job.body.startsWith('🌟 Join our Candidate Pool at Classy Llama! 🌟\n\nWelcome to our Candidate Pool!'), job.body);
  assert.ok(!job.body.includes('<') && !job.body.includes('Share'));
  assert.equal(job.posted_at, null);
  assert.deepEqual(job.raw, { department: null });
});

test('bamboohr list and detail', () => {
  const list = bamboohr.parse(fixture('bamboohr-list.json'), 'application/json', 'sherocommerce');
  assert.equal(list.length, 1);
  assert.equal(list[0].external_id, '60');
  assert.equal(list[0].title, 'Marketing Technology Engineer');
  assert.equal(list[0].location, 'Tirana');
  assert.equal(bamboohr.detail!.url(list[0], 'sherocommerce'), 'https://sherocommerce.bamboohr.com/careers/60/detail');
  const job = bamboohr.detail!.parse(fixture('bamboohr-detail.json'), 'application/json', list[0]);
  assertWellFormed([job], 1);
  assert.equal(job.url, 'https://sherocommerce.bamboohr.com/careers/60');
  assert.equal(job.posted_at, '2026-09-04T00:00:00.000Z');
  assert.ok(job.body.startsWith('About the role\n'));
  assert.deepEqual(job.raw, {
    department: 'Design & Creative', employment_status: 'Full-Time - UK', location_type: '2', remote: null,
    minimum_experience: 'Mid-level', compensation: null, country: 'Albania',
  });
});

test('bamboohr list prefers atsLocation', () => {
  const text = JSON.stringify({ result: [{ id: '27', jobOpeningName: 'x', location: { city: null, state: null },
    atsLocation: { country: 'United States', state: 'Illinois', province: null, city: 'Chicago' } }] });
  assert.equal(bamboohr.parse(text, 'application/json', 'cql')[0].location, 'Chicago, Illinois, United States');
});

test('bamboohr rejects an HTML page', () => {
  assert.throws(() => bamboohr.parse('<!doctype html><html></html>', 'text/html', 'dead'));
});

test('breezy fixture', () => {
  const postings = breezy.parse(fixture('breezy.json'), 'application/json; charset=utf-8', 'thirdandgrove');
  assertWellFormed(postings, 2);
  assert.equal(postings[0].external_id, '1cb893fe33d9');
  assert.equal(postings[0].url, 'https://thirdandgrove.breezy.hr/p/1cb893fe33d9-project-manager');
  assert.equal(postings[0].posted_at, '2026-09-26T22:35:28.771Z');
  assert.equal(postings[1].location, 'United States, Canada');
  assert.deepEqual(postings[1].raw, {
    friendly_id: '830aa35bfa66-senior-digital-analytics-strategist', type: 'Full-Time', department: 'Strategy',
    salary: null, remote: true, countries: ['US', 'CA'],
  });
  assert.equal(breezy.feedUrl('thirdandgrove'), 'https://thirdandgrove.breezy.hr/json?verbose=true');
  assert.deepEqual(breezy.parse('[]', 'application/json', 'object-edge-inc'), []);
});

test('rippling list collapses per-location rows, detail completes the posting', () => {
  const list = rippling.parse(fixture('rippling-list.json'), 'application/json', 'verndale-llc');
  assert.deepEqual(list.map((p) => [p.external_id, p.location]), [
    ['d240587d-9b8d-48df-af24-d744a3e48eef', 'Remote (US)'],
    ['398f8a9c-cd37-4fb8-a4d4-a0abce04d0a6', 'Hybrid (Quito), Remote (LATAM)'],
  ]);
  assert.equal(rippling.detail!.url(list[0], 'verndale-llc'),
    'https://api.rippling.com/platform/api/ats/v1/board/verndale-llc/jobs/d240587d-9b8d-48df-af24-d744a3e48eef');
  const job = rippling.detail!.parse(fixture('rippling-job.json'), 'application/json', list[0]);
  assertWellFormed([job], 1);
  assert.equal(job.url, 'https://ats.rippling.com/verndale-llc/jobs/d240587d-9b8d-48df-af24-d744a3e48eef');
  assert.equal(job.posted_at, '2026-10-27T16:11:24.570Z');
  assert.ok(job.body.startsWith('About the role\n'));
  assert.equal((job.raw as { employment_type: string }).employment_type, 'Independent Contractor');
  assert.equal((job.raw as { department: string }).department, 'Digital Marketing');
  assert.throws(() => rippling.detail!.parse(fixture('rippling-job.json'), 'application/json', list[1]), /has uuid/);
});

test('fetchPostings fetches a detail per listed posting', async () => {
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    urls.push(url);
    const body = url.endsWith('/careers/list') ? fixture('bamboohr-list.json') : fixture('bamboohr-detail.json');
    return new Response(body, { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const company = { id: 'shero-commerce', ats: { vendor: 'bamboohr', slug: 'sherocommerce' } } as Company;
    const postings = await fetchPostings(company);
    assert.deepEqual(urls, [
      'https://sherocommerce.bamboohr.com/careers/list', 'https://sherocommerce.bamboohr.com/careers/60/detail',
    ]);
    assertWellFormed(postings, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('workable collapses per-location rows by shortcode', () => {
  const postings = workable.parse(fixture('workable.json'), 'application/json', 'tryzensglobal');
  assertWellFormed(postings, 2);
  assert.deepEqual(postings.map((p) => [p.external_id, p.location]), [
    ['082DFE38B2', 'Melbourne, Sydney'], ['C3939D0217', 'Thiruvananthapuram'],
  ]);
  assert.equal(postings[0].url, 'https://apply.workable.com/tryzensglobal/j/082DFE38B2/');
  assert.equal(postings[0].posted_at, '2026-08-20T00:00:00.000Z');
  assert.deepEqual(postings[1].raw, {
    employment_type: 'Contract', telecommuting: false, department: 'Project Management', created_at: '2026-08-03',
  });
  assert.throws(() => workable.parse('Not Found', 'text/plain', 'dead'), /not a JSON feed/);
});

test('recruitee converts its UTC date format and appends requirements', () => {
  const postings = recruitee.parse(fixture('recruitee.json'), 'application/json; charset=utf-8', 'youwe');
  assertWellFormed(postings, 2);
  assert.equal(postings[0].external_id, '2788939');
  assert.equal(postings[0].posted_at, '2026-10-19T12:06:39.000Z');
  assert.equal(postings[0].url, 'https://careers.youweagency.com/o/senior-financial-controller');
  assert.ok(postings[1].body.includes('and within scope.\n\n4-6 years of experience as a Project Manager'), 'requirements after a blank line');
  assert.deepEqual(postings[1].raw, {
    employment_type_code: 'fulltime_permanent', remote: false, hybrid: true, on_site: false, department: 'Operations', tags: [],
  });
  assert.deepEqual(recruitee.parse('{"offers":[]}', 'application/json', 'youweconnectit'), []);
  assert.equal(recruitee.feedUrl('youwe'), 'https://youwe.recruitee.com/api/offers/');
  assert.equal(recruitee.feedUrl('careers.youweagency.com'), 'https://careers.youweagency.com/api/offers/');
});

test('smartrecruiters list, detail and next page', () => {
  const list = smartrecruiters.parse(fixture('smartrecruiters-list.json'), 'application/json', 'smartrecruiters');
  assert.deepEqual(list.map((p) => [p.external_id, p.url, p.body]), [
    ['744000158320111', 'https://jobs.smartrecruiters.com/smartrecruiters/744000158320111', ''],
    ['744000158015889', 'https://jobs.smartrecruiters.com/smartrecruiters/744000158015889', ''],
  ]);
  assert.equal(smartrecruiters.detail!.url(list[0], 'smartrecruiters'),
    'https://api.smartrecruiters.com/v1/companies/smartrecruiters/postings/744000158320111');
  const job = smartrecruiters.detail!.parse(fixture('smartrecruiters-detail.json'), 'application/json', list[0]);
  assertWellFormed([job], 1);
  assert.equal(job.url, 'https://jobs.smartrecruiters.com/smartrecruiters/744000158320111-senior-lead-engineering-operations-manager');
  assert.ok(job.body.startsWith('SmartRecruiters is the Recruiting AI Company'), 'company description first');
  assert.ok(!JSON.stringify(job.raw).includes('creator'));
  assert.throws(() => smartrecruiters.detail!.parse(fixture('smartrecruiters-detail.json'), 'application/json', list[1]), /has id/);

  const feed = smartrecruiters.feedUrl('BoschGroup');
  const page = (offset: number) => JSON.stringify({ offset, limit: 100, totalFound: 250, content: [] });
  assert.equal(smartrecruiters.next!(page(0), 'application/json', feed),
    'https://api.smartrecruiters.com/v1/companies/BoschGroup/postings?limit=100&offset=100');
  assert.equal(smartrecruiters.next!(page(200), 'application/json', feed), null);
  assert.equal(smartrecruiters.next!(fixture('smartrecruiters-list.json'), 'application/json', feed), null);
  assert.deepEqual(smartrecruiters.parse('{"offset":0,"limit":100,"totalFound":0,"content":[]}', 'application/json', 'nobody'), []);
});

test('fetchPostings follows next pages before fetching details', async () => {
  const realFetch = globalThis.fetch;
  const listed = JSON.parse(fixture('smartrecruiters-list.json')) as { content: { id: string }[] };
  const detail = JSON.parse(fixture('smartrecruiters-detail.json')) as { id: string };
  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL) => {
    const url = new URL(String(input));
    urls.push(url.href);
    const offset = url.searchParams.get('offset');
    const body = offset === null
      ? { ...detail, id: url.pathname.split('/').pop() }
      : { offset: Number(offset), limit: 1, totalFound: 2, content: [listed.content[Number(offset)]] };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const company = { id: 'smartrecruiters', ats: { vendor: 'smartrecruiters', slug: 'smartrecruiters' } } as Company;
    const postings = await fetchPostings(company);
    const api = 'https://api.smartrecruiters.com/v1/companies/smartrecruiters/postings';
    assert.deepEqual(urls, [
      `${api}?limit=100&offset=0`, `${api}?limit=100&offset=1`, `${api}/744000158320111`, `${api}/744000158015889`,
    ]);
    assertWellFormed(postings, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('ashby drops unlisted jobs', () => {
  const postings = ashby.parse(fixture('ashby.json'), 'application/json; charset=utf-8', 'ashby');
  assertWellFormed(postings, 2);
  assert.ok(!postings.some((p) => p.external_id === JSON.parse(fixture('ashby.json')).jobs[2].id));
  assert.equal(postings[0].url, 'https://jobs.ashbyhq.com/ashby/7458d4e9-da2e-47bd-98cb-adfda43d42b2');
  assert.equal(postings[0].posted_at, '2024-03-04T14:29:08.532Z');
  assert.deepEqual(postings[0].raw, {
    department: 'Engineering', team: 'EMEA Engineering', employment_type: 'FullTime', remote: true, workplace_type: 'Remote',
    secondary_locations: ['Spain', 'Italy', 'Germany'], compensation: '€150K – €250K • Offers Equity • Offers Bonus',
  });
  assert.throws(() => ashby.parse('Not Found', 'text/plain', 'dead'), /not a JSON feed/);
});

test('zoho RSS: clean url, US-zone date, location from the prefix', () => {
  const postings = zoho.parse(fixture('zoho.xml'), 'application/rss+xml;charset=UTF-8', 'ziffity/Ziffity-Job-Opening');
  assertWellFormed(postings, 2);
  assert.equal(postings[0].external_id, '301885000010864001');
  assert.equal(postings[0].url, 'https://ziffity.zohorecruit.com/jobs/Careers/301885000010864001/Account-Executive-of-Sales-Ecommerce-for-US');
  assert.equal(postings[0].posted_at, '2026-07-02T19:00:00.000Z');
  assert.equal(postings[0].location, null);
  assert.equal(postings[1].location, 'Chennai City Corporation, Tamil Nadu, India');
  assert.equal(postings[1].posted_at, '2026-01-13T17:00:00.000Z');
  assert.equal(zoho.feedUrl('ziffity/Ziffity-Job-Opening'), 'https://ziffity.zohorecruit.com/jobs/Ziffity-Job-Opening/rss');
  assert.equal(zoho.feedUrl('acme.zohorecruit.eu/Careers-Portal'), 'https://acme.zohorecruit.eu/jobs/Careers-Portal/rss');
  assert.throws(() => zoho.feedUrl('ziffity'), /slug must be/);
});

test('zoho rejects a removed portal and a dead account', () => {
  assert.throws(() => zoho.parse('Oops! It seems that the joblist has been removed.', 'application/rss+xml', 'ziffity/Careers'), /not an RSS feed/);
  assert.throws(() => zoho.parse('<html><head></head><body>Page does not exist</body></html>', 'text/html', 'dead/Jobs'), /not an RSS feed/);
});

test('normalized postings carry no body_html', () => {
  const all = [
    ...greenhouse.parse(fixture('greenhouse.json'), 'application/json', 'getyourguide'),
    ...lever.parse(fixture('lever.json'), 'application/json', 'emma-sleep'),
    ...personio.parse(fixture('personio.xml'), 'text/xml; charset=UTF-8', 'eshop-guide'),
    ...teamtailor.parse(fixture('teamtailor.json'), 'application/feed+json', 'careers.columbusglobal.com'),
    ...breezy.parse(fixture('breezy.json'), 'application/json', 'thirdandgrove'),
  ];
  for (const p of all) assert.ok(!('body_html' in p));
});

test('htmlToText separates table cells and drops unknown entities', () => {
  assert.ok(!htmlToText('<table><tr><td>a</td><td>b</td></tr></table>').includes('ab'));
  assert.equal(htmlToText('5&times;3&deg; &hellip;&zwnj; &#123;&#x41;'), '5×3° … {A');
});
