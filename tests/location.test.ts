import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eligible, workCountry, workMode } from '../core/location.ts';

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
