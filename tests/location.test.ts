import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eligible, employerRule, HOME, remoteScope, workCountry, workMode } from '../core/location.ts';
import type { EmployerVerdict, WorkMode } from '../core/location.ts';

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

// Fix 1 of the 2026-11-09 employer dry run: countries the table did not know fell back to the company's country.
test('workCountry knows every country, not only the ones seen before', () => {
  const cases: [string, string][] = [
    // GitLab, Cursor, Grafana, Linear and Checkout.com locations from the 2026-11-09 dry run
    ['Remote, Japan', 'JP'], ['Remote, Singapore', 'SG'], ['Remote, South Korea', 'KR'], ['Japan', 'JP'], ['Singapore', 'SG'],
    ['South Korea', 'KR'], ['Israel | Remote | Israel (Remote)', 'IL'], ['Tokyo, Japan | Remote | Japan (Remote)', 'JP'],
    ['Republic of Ireland (Remote)', 'IE'], ['Remote, UAE', 'AE'], ['Croatia, Serbia, Romania or Bulgaria', 'HR'],
    // variants and look-alikes
    ['Taipei, Taiwan', 'TW'], ['Hong Kong', 'HK'], ['Seoul, Republic of Korea', 'KR'], ['Pyongyang, North Korea', 'KP'],
    ['Lagos, Nigeria', 'NG'], ['Niamey, Niger', 'NE'], ['Port Moresby, Papua New Guinea', 'PG'], ['Conakry, Guinea', 'GN'],
    ['Santo Domingo, Dominican Republic', 'DO'], ['Kinshasa, DRC', 'CD'], ['Skopje, North Macedonia', 'MK'],
    ['Pristina, Kosovo', 'XK'], ['Podgorica, Montenegro', 'ME'], ['Reykjavik, Iceland', 'IS'], ['Auckland, New Zealand', 'NZ'],
    ['Tbilisi, Republic of Georgia', 'GE'], ['San José, Costa Rica', 'CR'], ['Santiago, Chile', 'CL'],
    // "Georgia" stays the US state, "New Jersey" is not Jersey
    ['Atlanta, Georgia', 'US'], ['Newark, New Jersey', 'US'],
  ];
  for (const [location, code] of cases) assert.equal(workCountry(location, {}, 'US'), code, location);
  // The company's country is the fallback only when nothing is named.
  assert.equal(workCountry('Remote, Japan', {}, 'US', 'remote'), 'JP');
  assert.equal(workCountry('Remote', {}, 'US', 'remote'), 'US');
});

test('the country-table fix changes the agency rule only where a new country is named', () => {
  // Before: remote:US (the company's country). After: the posting's own country, outside the owner's list.
  assert.deepEqual(eligible('remote', workCountry('Remote, Japan', {}, 'US', 'remote'), 'Remote, Japan'), { ok: false, reason: 'location:JP' });
  assert.deepEqual(eligible('unknown', workCountry('Singapore', {}, 'US'), 'Singapore'), { ok: false, reason: 'location:SG' });
  // Unchanged: countries the table already knew, and nothing named.
  assert.deepEqual(eligible('remote', workCountry('Remote (United States)', {}, 'US', 'remote'), 'Remote (United States)'), { ok: true, reason: 'remote:US' });
  assert.deepEqual(eligible('remote', workCountry('Remote', {}, 'GB', 'remote'), 'Remote'), { ok: true, reason: 'remote:GB' });
  assert.equal(remoteScope('Engineer', 'Remote (Global)', '', 'US'), null);
  assert.equal(remoteScope('Engineer', 'Remote - EMEA', '', 'US'), null);
  // A body restriction to a country the table did not know now names it.
  assert.equal(remoteScope('Engineer', 'Remote', 'You must be based in Singapore.', 'US'), 'SG');
});

// employerRule() from real postings of the 2026-11-09 employer dry run (title, location, Ashby secondary_locations in
// raw, body excerpts). Each case names the company it comes from.
type Case = [company: string, title: string, location: string | null, body: string, raw: unknown, mode: WorkMode, want: string];
const verdict = (v: EmployerVerdict) => (v.keep ? (v.home ? 'home' : v.tag) : v.reason);
const run = (cases: Case[]) => {
  for (const [company, title, location, body, raw, mode, want] of cases) {
    assert.equal(verdict(employerRule(title, location, body, raw, mode)), want, `${company}: ${title} / ${location}`);
  }
};
const N8N_EU = ['Romania', 'Norway', 'Estonia', 'Latvia', 'Slovenia', 'Netherlands', 'Hungary', 'Kosovo', 'Portugal', 'Poland',
  'Serbia', 'Germany', 'Austria', 'Finland', 'London Office', 'Albania', 'Lithuania', 'Slovakia', 'Ireland', 'Bulgaria', 'Denmark',
  'Belgium', 'Czech Republic', 'United Kingdom', 'Croatia', 'Spain', 'Greece'];

test('employerRule: Croatia named anywhere keeps the posting, whatever else it names', () => {
  run([
    ['Microblink', 'Information Security Engineer', 'Croatia, Serbia, Romania or Bulgaria', '', {}, 'remote', 'home'],
    ['Microblink', 'Android/iOS Developer (Mid-level)', 'Zagreb, Croatia', '', {}, 'remote', 'home'],
    ['ReversingLabs', 'Senior DevOps Engineer', 'Zagreb', '', { telecommuting: false }, 'hybrid', 'home'],
    // The list of eligible countries is in Ashby's secondary_locations, not in the body.
    ['n8n', 'Senior Product Engineer (TS/NodeJS/Vue)', 'Berlin Office', '', { remote: true, secondary_locations: N8N_EU }, 'remote', 'home'],
    ['ReversingLabs', 'Senior Software Engineer', 'Ireland',
      'This position is open only to candidates currently based in Croatia with the legal right to work in Croatia.', {}, 'remote', 'home'],
    ['(adapted)', 'Senior Engineer (Croatia)', 'Remote', '', {}, 'remote', 'home'],
  ]);
});

test('employerRule: a posting that is not remote and not in Croatia drops as not-remote', () => {
  run([
    ['Cursor (Anysphere)', 'Software Engineer, Growth', 'San Francisco, CA', '', { workplace_type: 'OnSite', secondary_locations: ['New York, NY'] }, 'unknown', 'employer:not-remote'],
    ['Wise', 'Senior Data Engineer I - Global KYC & Onboarding', 'London, , United Kingdom', '', { country: 'gb' }, 'hybrid', 'employer:not-remote'],
  ]);
});

test('employerRule: places tied to remote in the location are the hire list (fixes 3 and 4)', () => {
  run([
    ['GitLab', 'Backend Engineer (Ruby), Create: Change Record', 'Remote, Poland; Remote, United Kingdom', '', {}, 'remote', 'employer:elsewhere'],
    ['GitLab', 'Senior Customer Success Architect, CEUR', 'Remote, Austria; Remote, Germany', '', {}, 'remote', 'employer:elsewhere'],
    // The title's EMEA does not widen the location's list.
    ['GitLab', 'Forward Deployed Engineer - EMEA', 'Remote Ireland; Remote, France; Remote, Germany; Remote, Netherlands; Remote, United Kingdom', '', {}, 'remote', 'employer:elsewhere'],
    ['GitLab', 'Customer Success Architect, Japan', 'Remote, Japan', '', {}, 'remote', 'employer:JP-only'],
    ['Supabase', 'Support Engineer (AMER)', 'Remote, AMER', 'We hire globally. We believe you can do your best work from anywhere.', { remote: true }, 'remote', 'employer:elsewhere'],
    ['Supabase', 'Support Engineer (APAC)', 'Remote, APAC', '', { remote: true }, 'remote', 'employer:elsewhere'],
    ['Constructor', 'Integration Engineer (AMER)', 'Remote - AMER', '', { secondary_locations: ['Remote - Argentina', 'Remote - Canada'] }, 'remote', 'employer:elsewhere'],
    ['Grafana Labs', 'Senior Software Engineer', 'United States (Remote)', '', {}, 'remote', 'employer:US-only'],
    ['Sanity', 'Senior Site Reliability Engineer', 'Remote in the United States or Canada (East Coast/ET)', '', {}, 'remote', 'employer:elsewhere'],
    ['Stripe', 'Engineering Manager, Data Transformation', 'US-SEA, US-SF, US-NYC, US-Remote', '', {}, 'remote', 'employer:US-only'],
    // Fix 2: "Remote-Friendly, United States".
    ['Anthropic', 'Data Center Mechanical Engineer', 'Remote-Friendly, United States', '', {}, 'remote', 'employer:US-only'],
  ]);
});

test('employerRule: a covering scope in the title keeps the posting, an office city in the location does not stop it', () => {
  run([
    // The spec's example, without n8n's secondary list (which names Croatia and would make it `home`).
    ['n8n', 'Engineering Manager | Remote | Europe', 'Berlin Office', '', { remote: true }, 'remote', 'remote:europe'],
    ['Cursor (Anysphere)', 'Forward Deployed Engineer - EMEA', 'London', '', { remote: true }, 'remote', 'remote:emea'],
    ['Storyblok', 'Senior QA Engineer_Foundations & Enablement Team - Europe', 'Remote', '', {}, 'remote', 'remote:europe'],
    ['Supabase', 'Support Engineer (EMEA - Weekends)', 'Remote, EMEA', '', { remote: true }, 'remote', 'remote:emea'],
    // Not a scope: a language, and a product word that is not a segment of its own.
    ['Algolia', 'Sales Engineer - Italian Speaking', 'Remote', '', {}, 'remote', 'remote:unstated'],
    ['Wise', 'Senior II/Lead Software Engineer - Global KYC and Onboarding', 'Remote', '', {}, 'remote', 'remote:unstated'],
  ]);
});

test('employerRule: another place in the title drops the posting', () => {
  run([
    ['Cursor (Anysphere)', 'Field Engineering - Japan', 'Japan', '', { remote: true }, 'remote', 'employer:JP-only'],
    ['Cursor (Anysphere)', 'Field Engineer - South Korea', 'South Korea', '', { remote: true }, 'remote', 'employer:KR-only'],
    // The title outranks a blanket "Remote, Global".
    ['Supabase', 'Platform Security Engineer (AMER/APAC)', 'Remote, Global', '', { remote: true }, 'remote', 'employer:elsewhere'],
    // Fix 4: "US East Coast" is inside the US.
    ['n8n', 'Forward Deployed Engineer - US East Coast', 'Boston', 'Our team works remotely across Europe, with regular off-sites for team bonding.', { remote: true }, 'remote', 'employer:US-only'],
    ['Klaviyo', 'Principal Engineer, Enterprise Scalability (Remote - East Coast Only)', 'Boston, MA', '', {}, 'remote', 'employer:US-only'],
    ['Storyblok', 'Senior Database Reliability Engineer I - Germany/Austria/UK', 'Remote', '', {}, 'remote', 'employer:elsewhere'],
    ['Storyblok', 'Developer Relations Engineer - USA', 'Remote', '', {}, 'remote', 'employer:US-only'],
    ['Storyblok', 'Technical Support Engineer II - Costa Rica, Colombia, Mexico', 'Remote', '', {}, 'remote', 'employer:elsewhere'],
    ['Cloudflare', 'Senior Customer Engineer, Majors - Pittsburgh, PA', 'Distributed', '', {}, 'remote', 'employer:US-only'],
    ['Cloudflare', 'Senior Customer Engineer - Vancouver BC', 'Distributed', '', {}, 'remote', 'employer:CA-only'],
    ['Cloudflare', 'Senior Presales Customer Engineer (based in Canberra)', 'Distributed', '', {}, 'remote', 'employer:elsewhere'],
    ['Cursor (Anysphere)', 'Solutions Architect - Western Europe', 'London', '', { remote: true }, 'remote', 'employer:elsewhere'],
  ]);
});

test('employerRule: a covering scope in the location keeps the posting, tagged by the scope (fix 6)', () => {
  run([
    ['Supabase', 'Software Engineer - Auth', 'Remote, Global', '', { remote: true }, 'remote', 'remote:global'],
    ['Supabase', 'Database Support Engineer (EMEA)', 'Remote, EMEA', '', { remote: true }, 'remote', 'remote:emea'],
    ['Linear', 'Senior / Staff Product Engineer', 'Europe', '', { remote: true }, 'remote', 'remote:europe'],
    ['Sanity', 'Director, Support Engineering', 'Remote in Europe', '', { remote: true, secondary_locations: ['London, UK', 'San Francisco Bay Area'] }, 'remote', 'remote:europe'],
    ['Linear', 'Developer Relations', 'North America', '', { remote: true, secondary_locations: ['Europe'] }, 'remote', 'remote:europe'],
    ['n8n', 'Sr Security Engineer', 'Remote | Europe | Berlin Office', '', { remote: true }, 'remote', 'remote:europe'],
  ]);
});

test('employerRule: body phrases that name Europe or EMEA keep the posting', () => {
  run([
    ['Supabase', 'Support Engineer', 'Remote', 'TIMEZONES & LOGISTICS - It’s a full-time position with a required location in European time zones (we don’t believe in sustainability of overnight shifts).', {}, 'remote', 'remote:europe'],
    ['Supabase', 'Database Support Engineer', 'Remote', 'Location: Required residency/location within EMEA time zones (we do not believe in the sustainability of overnight shifts).', {}, 'remote', 'remote:emea'],
    ['Supabase', 'Support Engineer', 'Remote', 'We are primarily looking for someone in Europe, Africa, or Middle Eastern timezones for this shift.', {}, 'remote', 'remote:europe'],
    ['Linear', 'Senior / Staff Product Engineer', 'Remote', 'This role is open to candidates based in the US and Europe. You can work from anywhere within these regions.', {}, 'remote', 'remote:europe'],
    ['Sanity', 'Director, Support Engineering', 'Remote', 'ABOUT YOU: - Based in: North America or Europe - 7+ years in technical support', {}, 'remote', 'remote:europe'],
    ['Constructor', 'BackEnd Engineer: Experiments', 'Remote', 'LOCATION / TIME ZONES - We’re a distributed team. Preferred time zones are UTC+1 to UTC+7, but we’re flexible', {}, 'remote', 'remote:europe'],
    ['Sourcegraph', 'Software Engineer - Platform [IC3]', 'Remote', 'Preferred time zone between UTC-8 and UTC+2 Nice to haves:', {}, 'remote', 'remote:europe'],
    ['GitLab', 'Staff Forward Deployed Engineer, Agentic SDLC', 'Remote', 'Staff Forward Deployed Engineer, Agentic SDLC - (EMEA Only) An overview of this role', {}, 'remote', 'remote:emea'],
    ['(adapted)', 'Engineer', 'Remote', 'You must be eligible to work in the EU.', {}, 'remote', 'remote:europe'],
  ]);
});

test('employerRule: body phrases that name other places drop the posting', () => {
  run([
    ['Linear', 'Senior / Staff Product Engineer, Applied AI', 'Remote', 'This role is open to candidates based in North America. You can work from anywhere within this region.', {}, 'remote', 'employer:elsewhere'],
    ['Grafana Labs', 'Senior Software Engineer', 'Remote', 'This is a remote position. We are looking for candidates in Canadian time zones.', {}, 'remote', 'employer:CA-only'],
    ['Grafana Labs', 'Senior Software Engineer', 'Remote', 'This is a remote position. We are looking for candidates in the UK, Ireland, Spain, Germany or Sweden.', {}, 'remote', 'employer:elsewhere'],
    ['Stripe', 'Software Engineer', 'Remote', 'Location This role is remote within the United States.', {}, 'remote', 'employer:US-only'],
    ['Cloudflare', 'Senior Customer Engineer, Majors', 'Distributed', 'Compensation For Germany based hires: Estimated annual salary is between €116,000 - €182,000.', {}, 'remote', 'employer:DE-only'],
    // A restriction beats worldwide boilerplate in the same body.
    ['Sourcegraph', 'Enterprise Account Executive, US [IC5]', 'Remote', 'While we are an all-remote company and hire almost anywhere in the world, we do require successful candidates to be located in the United States.', {}, 'remote', 'employer:US-only'],
    ['Supabase', 'Support Engineer', 'Remote', 'It’s a full-time position with a required location in APAC time zones. WHAT WE OFFER - Fully Remote We hire globally. We believe you can do your best work from anywhere.', {}, 'remote', 'employer:elsewhere'],
  ]);
});

test('employerRule: worldwide in the body keeps the posting as global', () => {
  run([
    ['Supabase', 'AI Platform Engineer', 'Remote', 'WHAT WE OFFER - Fully Remote We hire globally. We believe you can do your best work from anywhere.', {}, 'remote', 'remote:global'],
    ['Doist', 'Apple Engineer', 'Remote', 'THE BASICS - Work from anywhere. Todoisters can work from anywhere in the world. We never place restrictions on location.', {}, 'remote', 'remote:global'],
    ['Automattic', 'Experienced Software Engineer', 'Remote', 'We’re always looking for talented and experienced engineers worldwide, excited to help', {}, 'remote', 'remote:global'],
    ['Sourcegraph', 'ML & Agentic Systems Engineer [IC4]', 'Remote', 'While we hire almost anywhere in the world, we have a preference for someone to reside in the following locations for this role.', {}, 'remote', 'remote:global'],
  ]);
});

test('employerRule: any other place in the location drops the posting (fixes 2 and 5)', () => {
  run([
    ['Sentry', 'Senior Software Engineer, AI Platform', 'San Francisco, California', '', { remote: true, workplace_type: 'Hybrid' }, 'remote', 'employer:US-only'],
    ['Cursor (Anysphere)', 'Solutions Architect', 'London', '', { remote: true }, 'remote', 'employer:GB-only'],
    ['Anthropic', 'Security Data Engineer', 'Remote-Friendly (Travel Required) | San Francisco, CA', '', {}, 'remote', 'employer:US-only'],
    ['Checkout.com', 'Software Engineer I', 'Sao Paulo', '', { remote: true }, 'remote', 'employer:elsewhere'],
    ['Mollie', 'Analytics Engineer', 'Milan', '', { remote: true }, 'remote', 'employer:elsewhere'],
    ['PostHog', 'AI Research Engineer', 'Hybrid (UK)', '', { remote: true }, 'remote', 'employer:GB-only'],
    ['Cursor (Anysphere)', 'Field Engineer', 'Remote', '', { remote: true, secondary_locations: ['New York, NY', 'San Francisco, CA'] }, 'remote', 'employer:US-only'],
    ['Voucherify', 'GTM Engineer', 'Remote / Katowice, Katowice', '', { country: 'Poland' }, 'remote', 'employer:PL-only'],
  ]);
});

test('employerRule: nothing named keeps a remote posting as unstated', () => {
  run([
    ['PostHog', 'Product Engineer', 'Remote', '', { remote: true }, 'remote', 'remote:unstated'],
    ['Stripe', 'Software Engineer, Secrets Infrastructure', 'na', '', {}, 'remote', 'remote:unstated'],
    ['Cloudflare', 'Forward Deployed Engineer, Professional Services', 'Distributed', '', {}, 'remote', 'remote:unstated'],
    ['(adapted)', 'Software Engineer', null, '', { remote: true }, 'remote', 'remote:unstated'],
    // Bodies mention Europe, EMEA and "anywhere in the world" for other reasons; none of these is a scope.
    ['n8n', 'Staff Core Platform Engineer', 'Remote', 'Remote-first 🌏 – Our team works remotely across Europe, with regular off-sites for team bonding.', {}, 'remote', 'remote:unstated'],
    ['GitLab', 'Senior Solutions Architect', 'Remote', 'with this role focused on opportunities across Southern EMEA and reporting into a regional Solutions Architect', {}, 'remote', 'remote:unstated'],
    ['GitLab', 'Support Engineer', 'Remote', 'We are distributed globally across the AMER, EMEA, and APAC regions and own the customer support experience.', {}, 'remote', 'remote:unstated'],
    ['Supabase', 'Engineer', 'Remote', 'we provide a WeWork membership or co-working allowance you can use anywhere in the world.', {}, 'remote', 'remote:unstated'],
    ['Mollie', 'Senior UI Engineer', 'Remote', 'We’re one of Europe’s fastest-growing fintechs, with 900+ Mollies across', {}, 'remote', 'remote:unstated'],
    ['Linear', 'Solutions Engineer', 'Remote', 'While Linear is a remote-first company across the US and Europe, this role', {}, 'remote', 'remote:unstated'],
  ]);
});
