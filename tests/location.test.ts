import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eligible, HOME, remoteScope, workCountry, workMode } from '../core/location.ts';

test('workMode reads adapter flags in raw first', () => {
  assert.equal(workMode('Engineer', 'London', '', { remote: true }), 'remote');
  assert.equal(workMode('Engineer', 'London', '', { telecommuting: true }), 'remote');
  assert.equal(workMode('Engineer', 'London', '', { workplace_type: 'Remote' }), 'remote');
  assert.equal(workMode('Engineer', 'London', '', { remote: false, hybrid: true, on_site: false }), 'hybrid');
  assert.equal(workMode('Engineer', 'London', '', { workplace_type: 'Hybrid' }), 'hybrid');
  assert.equal(workMode('Engineer', 'London', 'Fully remote team.', { on_site: true }), 'onsite');
  // false is not a signal: teamtailor writes remote: false for every non-TELECOMMUTE posting
  assert.equal(workMode('Engineer', 'London', '', { remote: false, telecommuting: false }), 'unknown');
});

test('workMode reads the title and location text', () => {
  assert.equal(workMode('Remote Senior Engineer', 'London', '', {}), 'remote');
  assert.equal(workMode('Engineer', 'Remote (United States)', '', {}), 'remote');
  assert.equal(workMode('Engineer', 'Anywhere', '', {}), 'remote');
  assert.equal(workMode('Engineer (Work from home)', null, '', {}), 'remote');
  assert.equal(workMode('Engineer', 'Hybrid / London', '', {}), 'hybrid');
  assert.equal(workMode('Distributed Systems Engineer', 'London', '', {}), 'unknown');
});

test('workMode reads body phrases last', () => {
  assert.equal(workMode('Engineer', 'London', 'We are a fully remote company.', {}), 'remote');
  assert.equal(workMode('Engineer', 'London', 'Remote-first since 2015.', {}), 'remote');
  assert.equal(workMode('Engineer', 'London', 'You can work remotely.', {}), 'remote');
  assert.equal(workMode('Engineer', 'London', 'A hybrid role.', {}), 'hybrid');
  assert.equal(workMode('Engineer', 'Utrecht', 'Hybride werken vanuit huis.', {}), 'hybrid');
  assert.equal(workMode('Engineer', 'Utrecht', 'Hybride cloudomgevingen, hybrid-cloud, hybrid search.', {}), 'unknown');
  assert.equal(workMode('Engineer', 'London', 'Expect 2 days a week in the office.', {}), 'hybrid');
  assert.equal(workMode('Engineer', 'London', 'Three days onsite.', {}), 'hybrid');
  assert.equal(workMode('Engineer', 'London', 'In-office 3 days.', {}), 'hybrid');
  assert.equal(workMode('Engineer', 'London', 'This role is on-site only.', {}), 'onsite');
  assert.equal(workMode('Engineer', 'London', 'You work in the office full-time.', {}), 'onsite');
});

test('workMode leaves a city alone as unknown', () => {
  assert.equal(workMode('Engineer', 'Cape Town', '', {}), 'unknown');
  assert.equal(workMode('Engineer', null, '', null), 'unknown');
});

test('workCountry reads raw country fields first', () => {
  assert.equal(workCountry('Davao City', { countries: ['PH'] }, 'FI'), 'PH');
  assert.equal(workCountry('Stockholm, Lisbon', { countries: ['FI', 'SE', 'PT'] }, 'FI'), 'FI');
  assert.equal(workCountry('Helsinki', { countries: ['Sweden'] }, 'FI'), 'SE');
  assert.equal(workCountry('Tirana', { country: 'Albania' }, 'US'), 'AL');
  assert.equal(workCountry('London', { country: 'gb' }, 'US'), 'GB');
  assert.equal(workCountry('London', { country_code: 'IE' }, 'US'), 'IE');
  assert.equal(workCountry('Leeds', { countries: [] }, 'US'), 'GB');
});

test('workCountry reads the location text, country names before cities', () => {
  const cases: [string, string][] = [
    ['Multiple Cities/States, MN', 'US'], ['Lincoln, England, United Kingdom', 'GB'], ['Remote (United States)', 'US'],
    ['Ahmedabad', 'IN'], ['Mexico City', 'MX'], ['Mexico', 'MX'], ['New Mexico', 'US'], ['London, UK', 'GB'],
    ['Remote (US)', 'US'], ['Northern Virginia - Remote, U.S.', 'US'], ['Kansas City or Minneapolis, MO', 'US'],
    ['Pune & Bangalore, India', 'IN'], ['Copenhagen, DK', 'DK'], ['Malmö, Lund', 'SE'], ['Düsseldorf Werftstr.', 'DE'],
    ['München, Bregenz, Wien, Düsseldorf', 'DE'], ['Germany | Switzerland | Spain', 'DE'], ['Davao City', 'PH'],
    ['Cape Town', 'ZA'], ['Tirana', 'AL'], ['Split, Croatia', 'HR'], ['Zürich', 'CH'], ['Tønsberg, Norway', 'NO'],
    ['Westerville, OH, Argentina, India', 'US'], ['Remote (Argentina), Remote (India)', 'AR'],
    ['Montreal, Canada, Remote (Canada)', 'CA'], ['Hybrid (Quito), Remote (LATAM)', 'EC'],
  ];
  for (const [location, code] of cases) assert.equal(workCountry(location, {}, 'XX'), code, location);
});

test('workCountry falls back to the company country only for remote', () => {
  assert.equal(workCountry('Remote', {}, 'GB'), 'GB');
  assert.equal(workCountry('Remote (Global)', {}, 'US'), 'US');
  assert.equal(workCountry(null, { telecommuting: true }, 'US'), 'US');
  assert.equal(workCountry(null, {}, 'GB', 'remote'), 'GB');
  assert.equal(workCountry('Westport', {}, 'US'), null);
  assert.equal(workCountry(null, {}, 'GB'), null);
});

test('eligible applies the owner rule', () => {
  assert.deepEqual(eligible('remote', 'US', 'Remote (United States)'), { ok: true, reason: 'remote:US' });
  assert.deepEqual(eligible('hybrid', 'GB', 'Hybrid / London'), { ok: true, reason: 'hybrid:GB' });
  assert.deepEqual(eligible('unknown', 'GB', 'London'), { ok: true, reason: 'unknown:GB' });
  assert.deepEqual(eligible('remote', 'NO', 'Oslo'), { ok: true, reason: 'remote:NO' });
  assert.deepEqual(eligible('unknown', null, null), { ok: true, reason: 'unknown' });
  assert.deepEqual(eligible('onsite', 'HR', 'Split, Croatia'), { ok: true, reason: 'onsite:split' });
  assert.deepEqual(eligible('onsite', 'HR', 'Zagreb'), { ok: false, reason: 'onsite:HR' });
  assert.deepEqual(eligible('onsite', 'DE', 'Berlin'), { ok: false, reason: 'onsite:DE' });
  assert.deepEqual(eligible('onsite', null, null), { ok: false, reason: 'onsite' });
  assert.deepEqual(eligible('remote', 'IN', 'Remote (India)'), { ok: false, reason: 'location:IN' });
  assert.deepEqual(eligible('unknown', 'ZA', 'Cape Town'), { ok: false, reason: 'location:ZA' });
  assert.deepEqual(eligible('onsite', 'PH', 'Davao City'), { ok: false, reason: 'location:PH' });
});

test('remoteScope reads a country tied to remote in the location or title', () => {
  const cases: [string, string | null, string][] = [
    ['Engineer', 'Remote (United States)', 'US'], ['Engineer', 'Remote - US', 'US'], ['Engineer', 'Remote, Germany', 'DE'],
    ['Engineer', 'United States (Remote)', 'US'], ['Engineer', 'Remote (US)', 'US'], ['Engineer', 'Remote - UK only', 'GB'],
    ['Engineer', 'Northern Virginia - Remote, U.S.', 'US'], ['Engineer', 'Stuttgart, Remote (Germany)', 'DE'],
    ['Engineer', 'Montreal, Canada, Remote (Canada)', 'CA'],
    // the location is just a country and the posting is remote (raw flag)
    ['Engineer', 'United States', 'US'], ['Engineer', 'USA', 'US'], ['Engineer', 'Germany', 'DE'],
    ['Senior Engineer (Remote, US)', 'London', 'US'], ['Senior Engineer - Remote UK', null, 'GB'],
  ];
  for (const [title, location, code] of cases) assert.equal(remoteScope(title, location, '', 'XX'), code, `${title} / ${location}`);
});

test('remoteScope reads restricting body phrases that name a country', () => {
  const cases: [string, string][] = [
    ['Remote Work This position qualifies for remote work anywhere in the United States. About DemandPDX', 'US'],
    ['Note: This is a remote opportunity and can be located from anywhere in the United States. #LI-Remote.', 'US'],
    ['Note: This is a remote opportunity and can be based from any location in the United States.', 'US'],
    ['Note: This is a remote opportunity but must be based in the United States.', 'US'],
    ['This position is fully remote. All applicants must live and work in the United States.', 'US'],
    ['You must reside in Germany.', 'DE'], ['Candidates must be located in the UK.', 'GB'],
    ['This role is remote within Germany.', 'DE'], ['You can work from anywhere within the UK.', 'GB'],
    ['Prefer candidates located in Kansas City, but open to remote work in the US.', 'US'],
    ['Location: Remote (US-based) | Type: Full-time', 'US'],
    ['We are hiring UK-based candidates only.', 'GB'], ['Open to US-based applicants.', 'US'],
    ['Remote, but based in Spain only.', 'ES'],
    ['Requirements: Must be legally authorized to work in the United States without company sponsorship.', 'US'],
    ['Requirements: Must be authorized to work legally in the US without sponsorship, now or in the future.', 'US'],
    ['Legal right to work in the United States', 'US'], ['You will therefore be needing a work visa or Right to Work in the UK.', 'GB'],
    ['You must be authorised to work in the UK.', 'GB'], ['Applicants must be eligible to work in Ireland.', 'IE'],
    ['Please note - this position is based in Sweden and fluency in Swedish is required.', 'SE'],
    ['Must be based in Texas.', 'US'],
  ];
  for (const [body, code] of cases) assert.equal(remoteScope('Engineer', 'Remote', body, 'XX'), code, body);
});

test('remoteScope restricts to the work country when the body restricts without naming one', () => {
  const cases = [
    'Work authorization required.', 'No visa sponsorship is available.', 'We are unable to sponsor visas.',
    'At this time, Velir does not sponsor candidates and unfortunately cannot accept those on OPT or CPT.',
    'Please note this role is not eligible for sponsorship.', 'You must be able to work without sponsorship.',
  ];
  for (const body of cases) assert.equal(remoteScope('Engineer', 'Remote', body, 'GB'), 'GB', body);
  assert.equal(remoteScope('Engineer', 'Remote', 'No visa sponsorship.', null), null);
});

test('remoteScope finds no restriction where none is stated', () => {
  const cases: [string, string | null, string][] = [
    ['Engineer', 'Sofia', ''], ['Engineer', 'Remote', ''], ['Engineer', null, ''], ['Engineer', 'Remote job', ''],
    ['Engineer', 'Stuttgart, Remote', ''], ['Engineer', 'Remote / London', ''], ['Engineer', 'London, United Kingdom', ''],
    ['Engineer', 'Red Hook, New York, United States', ''],
    // wide scopes
    ['Engineer', 'Remote (Global)', ''], ['Engineer', 'Worldwide', ''], ['Engineer', 'Remote - EMEA', ''],
    ['Engineer', 'Remote (Europe)', ''], ['Engineer', 'Remote, EU', ''], ['Engineer', 'Anywhere', ''],
    ['Engineer (Remote, Europe)', null, ''],
    ['Engineer', 'Remote', 'You can work from anywhere.'], ['Engineer', 'Remote', 'Remote anywhere in Europe.'],
    ['Engineer', 'Remote', 'You must be eligible to work in the EU. No visa sponsorship.'],
    ['Engineer', 'Remote', 'Remote within the EU.'],
    // several countries
    ['Engineer', 'Remote (United States), Canada', ''], ['Engineer', 'Remote (Germany), Remote (Austria)', ''],
    ['Engineer', 'Remote', 'You must be based in the US or Canada.'],
    ['Engineer', 'Tampere, København, Wrocław', ''],
    // a country in the title not tied to remote, a demonym that is a language
    ['Senior Fullstack Developer (Philippines)', 'Remote', ''], ['Remote German-speaking Engineer', 'Remote', ''],
    // company descriptions and preferences, seen in live postings
    ['Engineer', 'Remote', 'Because our clients are mostly US-based organizations, we look for the ability to communicate.'],
    ['Engineer', 'Remote', 'Our entire team is U.S.-based, and we pride ourselves on delivering high-end guidance.'],
    ['Engineer', 'Remote', 'We serve clients across the United States.'],
    ['Engineer', 'Remote', 'Our entire team resides in the United States.'],
    ['Engineer', 'Remote', '100% US-based remote team'],
    ['Engineer', 'Remote', 'We post salary ranges in compliance with state requirements for U.S.-based roles.'],
    ['Engineer', 'Remote', 'This position can be remote, with a preference for candidates based in Canada.'],
    ['Engineer', 'Remote', 'Preferably located in the Philippines.'],
    ['Engineer', 'Remote', 'Full Health Benefits and 401k Fixed Percentage Plan (USA only) RRSP (Canada)'],
    ['Engineer', 'Remote', 'We are the leading agency within the UK.'],
    ['Engineer', 'Remote', 'Based in Finland, the United Kingdom, and the Philippines, our team works collaboratively.'],
    ['Engineer', 'Remote', 'Strong sponsor and VP-level relationships; company-sponsored activities.'],
  ];
  for (const [title, location, body] of cases) assert.equal(remoteScope(title, location, body, 'US'), null, `${title} / ${location} / ${body}`);
});

test('remoteScope: a wide scope in the location wins over body phrases, several countries leave it to the body', () => {
  assert.equal(remoteScope('Engineer', 'Remote (Global)', 'Must be authorized to work in the United States.', 'US'), null);
  assert.equal(remoteScope('Engineer', 'Remote (Europe)', 'No visa sponsorship.', 'DE'), null);
  assert.equal(remoteScope('Engineer', 'United States, Canada', 'All applicants must live and work in the United States.', 'US'), 'US');
  // the location's country wins over a body that names another
  assert.equal(remoteScope('Engineer', 'Remote (United States)', 'Must have the right to work in the UK.', 'US'), 'US');
});

test('eligible tags remote restricted to one country', () => {
  assert.equal(HOME, 'HR');
  assert.deepEqual(eligible('remote', 'US', 'Remote (United States)', 'US'), { ok: true, reason: 'remote:US-only' });
  assert.deepEqual(eligible('remote', 'GB', 'Remote', 'DE'), { ok: true, reason: 'remote:DE-only' });
  assert.deepEqual(eligible('remote', 'DE', 'Remote', 'HR'), { ok: true, reason: 'remote:HR' });
  assert.deepEqual(eligible('remote', 'HR', 'Remote, Croatia', remoteScope('Engineer', 'Remote, Croatia', '', 'HR')), { ok: true, reason: 'remote:HR' });
  assert.deepEqual(eligible('remote', 'US', 'Minneapolis', 'IN'), { ok: false, reason: 'location:IN' });
  assert.deepEqual(eligible('remote', 'IN', 'Remote (India)', 'IN'), { ok: false, reason: 'location:IN' });
  assert.deepEqual(eligible('remote', 'US', 'Remote', null), { ok: true, reason: 'remote:US' });
  // the scope is only for remote
  assert.deepEqual(eligible('hybrid', 'GB', 'Hybrid / London', 'GB'), { ok: true, reason: 'hybrid:GB' });
});

test('raw fields written by the workday, deel, shopify-careers and remote-ats adapters', () => {
  // workday: remoteType as workplace_type, the requisition country as country
  const infobip = { workplace_type: 'hybrid', on_site: null, country: 'BA' };
  assert.equal(workMode('Mid/Senior Software Engineer', 'Sarajevo (BiH)', '', infobip), 'hybrid');
  assert.equal(workCountry('Sarajevo (BiH)', infobip, 'HR'), 'BA');
  const zagreb = { workplace_type: 'onsite', on_site: true, country: 'HR' };
  assert.equal(workMode('Engineer', 'Zagreb (Croatia)', '', zagreb), 'onsite');
  assert.equal(workMode('Engineer', 'United States - Remote', '', { workplace_type: 'remote', country: 'US' }), 'remote');
  // deel: workArrangementEnum ON_SITE as on_site, flight-data country codes as countries
  const klarna = { workplace_type: 'onsite', on_site: true, remote: null, countries: ['GB'] };
  assert.equal(workMode('Fraud Operations Lead', 'London', 'Remote-first culture.', klarna), 'onsite');
  assert.equal(workCountry('London', klarna, 'SE'), 'GB');
  // shopify-careers and remote-ats: Ashby's workplaceType "Remote", Remote's workplace "remote"
  assert.equal(workMode('Engineer', 'Remote - Ireland', '', { remote: true, workplace_type: 'Remote' }), 'remote');
  assert.equal(workMode('Principal CRM Engineer', 'EMEA, NORAM', '', { workplace_type: 'remote' }), 'remote');
});
