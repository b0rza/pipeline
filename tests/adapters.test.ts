import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { greenhouse } from '../adapters/ats/greenhouse.ts';
import { lever } from '../adapters/ats/lever.ts';
import { personio } from '../adapters/ats/personio.ts';
import { teamtailor } from '../adapters/ats/teamtailor.ts';
import { htmlToText } from '../core/html.ts';
import type { NormalizedPosting } from '../core/types.ts';

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

test('normalized postings carry no body_html', () => {
  const all = [
    ...greenhouse.parse(fixture('greenhouse.json'), 'application/json', 'getyourguide'),
    ...lever.parse(fixture('lever.json'), 'application/json', 'emma-sleep'),
    ...personio.parse(fixture('personio.xml'), 'text/xml; charset=UTF-8', 'eshop-guide'),
    ...teamtailor.parse(fixture('teamtailor.json'), 'application/feed+json', 'careers.columbusglobal.com'),
  ];
  for (const p of all) assert.ok(!('body_html' in p));
});

test('htmlToText separates table cells and drops unknown entities', () => {
  assert.ok(!htmlToText('<table><tr><td>a</td><td>b</td></tr></table>').includes('ab'));
  assert.equal(htmlToText('5&times;3&deg; &hellip;&zwnj; &#123;&#x41;'), '5×3° … {A');
});
