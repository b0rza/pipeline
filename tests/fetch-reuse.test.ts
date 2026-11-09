// fetchBoard with the company's stored postings: reuse what is stored, skip the detail the title rules out.
// Requests go through core/http.ts, 1 s apart per host, so each scenario keeps to a handful and to its own host.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';
import { bamboohr } from '../adapters/ats/bamboohr.ts';
import { deel } from '../adapters/ats/deel.ts';
import { gohire } from '../adapters/ats/gohire.ts';
import { haileyhr } from '../adapters/ats/haileyhr.ts';
import { adapters, reuse } from '../adapters/ats/index.ts';
import { jazzhr } from '../adapters/ats/jazzhr.ts';
import { pinpoint } from '../adapters/ats/pinpoint.ts';
import { remoteAts } from '../adapters/ats/remote-ats.ts';
import { rippling } from '../adapters/ats/rippling.ts';
import { shopifyCareers } from '../adapters/ats/shopify-careers.ts';
import { smartrecruiters } from '../adapters/ats/smartrecruiters.ts';
import type { AtsAdapter } from '../adapters/ats/types.ts';
import { workday } from '../adapters/ats/workday.ts';
import { upsertCompanies } from '../core/companies.ts';
import { openDb, sha256 } from '../core/db.ts';
import { diffRun } from '../core/diff.ts';
import { fetchCompany, snapshotCompany, storedPostings } from '../core/snapshot.ts';
import type { Company, NormalizedPosting } from '../core/types.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const company = (id: string, vendor: string, slug: string): Company => ({
  id, name: id, domain: `${id}.test`, country: 'GB', phases: ['p1'], source: 'test', ats: { vendor, slug },
  storefront: null, status: 'active', warm: false,
});

function dbWith(c: Company): DatabaseSync {
  const db = openDb(':memory:');
  upsertCompanies(db, [c]);
  return db;
}

// Each adapter with a detail page: its list fixture, which listed posting the detail fixture belongs to, and the
// detail fixture (the pairs tests/adapters.test.ts uses).
const type = (file: string) => (file.endsWith('.json') ? 'application/json' : 'text/html');
const family = (adapter: AtsAdapter, slug: string, list: string, i: number, page: string) => {
  const listed = adapter.parse(fixture(list), type(list), slug)[i];
  return { adapter, slug, listed, full: adapter.detail!.parse(fixture(page), type(page), listed) };
};
const families = [
  family(smartrecruiters, 'smartrecruiters', 'smartrecruiters-list.json', 0, 'smartrecruiters-detail.json'),
  family(bamboohr, 'sherocommerce', 'bamboohr-list.json', 0, 'bamboohr-detail.json'),
  family(jazzhr, 'ConcordUSA', 'jazzhr-list.html', 1, 'jazzhr-job.html'),
  family(rippling, 'verndale-llc', 'rippling-list.json', 0, 'rippling-job.json'),
  family(pinpoint, 'ctidigital', 'pinpoint.json', 0, 'pinpoint-job.html'),
  family(gohire, 'mfqEeOYP', 'gohire-list.json', 1, 'gohire-job.html'),
  family(haileyhr, 'motillo', 'haileyhr-list.html', 0, 'haileyhr-job.html'),
  family(workday, 'infobip.wd3/InfobipCareers', 'workday-list.json', 1, 'workday-detail.json'),
  family(deel, 'klarna', 'deel-board.html', 1, 'deel-job.html'),
  family(shopifyCareers, 'www.shopify.com', 'shopify-careers-list.html', 0, 'shopify-careers-job.html'),
  family(remoteAts, 'apply.remote.com', 'remote-ats-list.json', 1, 'remote-ats-job.json'),
];

test('the key of a listed posting equals the key of its stored row, and reusing the row rebuilds the posting', () => {
  assert.equal(families.length, Object.values(adapters).filter((a) => a.detail).length, 'every detail adapter is here');
  for (const { adapter, slug, listed, full } of families) {
    const detail = adapter.detail!;
    const c = company(`co-${adapter.vendor}`, adapter.vendor, slug);
    const db = dbWith(c);
    snapshotCompany(db, c, [full], '2026-11-01');
    const [row] = storedPostings(db, c.id);
    const key = (p: NormalizedPosting) => detail.key?.(p) ?? p.external_id;
    assert.equal(key(listed), key(row), `${adapter.vendor}: key`);
    const { gone, ...stored } = row;
    assert.equal(gone, false);
    // What a fetch would give, without the fetch: every field parse() sets is declared in `sets`.
    assert.deepEqual(reuse(detail, listed, stored), JSON.parse(JSON.stringify(full)), `${adapter.vendor}: reuse`);
  }
  // Workday is the one whose detail replaces the id, so its key is the path, not external_id.
  const wd = families.find((f) => f.adapter === workday)!;
  assert.notEqual(wd.full.external_id, wd.listed.external_id);
  assert.equal(workday.detail!.key!(wd.full), wd.listed.external_id);
});

// A fetch stand-in routed by host, so the scenarios below (one host each) can run at the same time. Each records its
// own requests.
type Answer = (url: string, init?: RequestInit) => { body: string; type: string };
const hosts = new Map<string, { answer: Answer; calls: string[] }>();
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const route = hosts.get(new URL(url).host);
    if (!route) throw new Error(`no mock for ${url}`);
    route.calls.push(`${init?.method ?? 'GET'} ${url}`);
    const { body, type } = route.answer(url, init);
    return new Response(body, { headers: { 'content-type': type } });
  }) as typeof fetch;
});
after(() => { globalThis.fetch = realFetch; });

function mockHost(host: string, answer: Answer) {
  const calls: string[] = [];
  hosts.set(host, { answer, calls });
  return { calls, restore: () => { hosts.delete(host); } };
}

// One night for one company: fetch with what is stored, snapshot, diff. Returns the requests it sent.
async function night(db: DatabaseSync, c: Company, runDate: string, calls: string[]) {
  const from = calls.length;
  const { postings, counts: board } = await fetchCompany(db, c);
  const counts = snapshotCompany(db, c, postings, runDate);
  const events = diffRun(db, runDate);
  return { requests: calls.slice(from), board, counts, events };
}

const count = (db: DatabaseSync, sql: string) => (db.prepare(sql).get() as { n: number }).n;
const noEvents = { posting_new: 0, posting_edited: 0, posting_reposted: 0, posting_gone: 0 };

describe('nights with mocked boards', { concurrency: true }, () => {
  test('bamboohr board across nights: title skip, same-day re-run, new, gone and back, empty body now passing', async () => {
    const c = company('acme', 'bamboohr', 'acme');
    const db = dbWith(c);
    const base = 'https://acme.bamboohr.com/careers';
    let board: [number, string][] = [[1, 'Backend Engineer'], [2, 'Account Executive'], [3, 'Talent Pool'], [4, 'Frontend Developer']];
    const { calls, restore } = mockHost('acme.bamboohr.com', (url) => {
      if (url === `${base}/list`) {
        const result = board.map(([id, title]) => ({ id: String(id), jobOpeningName: title, atsLocation: { city: 'London', country: 'United Kingdom' } }));
        return { body: JSON.stringify({ result }), type: 'application/json' };
      }
      const id = /\/careers\/(\d+)\/detail$/.exec(url)![1];
      const jobOpening = { description: `<p>The text of posting ${id}.</p>`, datePosted: '2026-10-01', jobOpeningShareUrl: `${base}/${id}` };
      return { body: JSON.stringify({ result: { jobOpening } }), type: 'application/json' };
    });
    const detail = (id: number) => `GET ${base}/${id}/detail`;
    const body = (id: number) => (db.prepare('select body from postings where external_id = ?').get(String(id)) as { body: string }).body;
    try {
      // Night 1: the two engineering titles are fetched, the sales and evergreen ones kept from the list.
      let n = await night(db, c, '2026-11-01', calls);
      assert.deepEqual(n.requests, [`GET ${base}/list`, detail(1), detail(4)]);
      assert.deepEqual(n.board, { listed: 4, fetched: 2, reused: 0, skipped: 2 });
      assert.deepEqual(n.events, { ...noEvents, posting_new: 4 });
      assert.equal(body(1), 'The text of posting 1.');
      assert.equal(body(2), '');
      assert.equal(body(3), '');

      // Night 1 again: the list only, no new rows, the same events.
      const before = [count(db, 'select count(*) as n from postings'), count(db, 'select count(*) as n from events')];
      n = await night(db, c, '2026-11-01', calls);
      assert.deepEqual(n.requests, [`GET ${base}/list`]);
      assert.deepEqual(n.board, { listed: 4, fetched: 0, reused: 4, skipped: 0 });
      assert.deepEqual(n.counts, { seen: 4, new: 0, edited: 0, gone: 0 });
      assert.deepEqual(n.events, { ...noEvents, posting_new: 4 });
      assert.deepEqual([count(db, 'select count(*) as n from postings'), count(db, 'select count(*) as n from events')], before);

      // Night 2: 4 goes, an engineering and an office posting appear. Only the engineering one is fetched.
      board = [[1, 'Backend Engineer'], [2, 'Account Executive'], [3, 'Talent Pool'], [5, 'Data Engineer'], [6, 'Office Manager']];
      n = await night(db, c, '2026-11-02', calls);
      assert.deepEqual(n.requests, [`GET ${base}/list`, detail(5)]);
      assert.deepEqual(n.board, { listed: 5, fetched: 1, reused: 3, skipped: 1 });
      assert.deepEqual(n.events, { ...noEvents, posting_new: 2, posting_gone: 1 });

      // Night 3: 4 is back. A gone posting is fetched again, and comes back as a repost, not an edit.
      board = [...board, [4, 'Frontend Developer']];
      n = await night(db, c, '2026-11-03', calls);
      assert.deepEqual(n.requests, [`GET ${base}/list`, detail(4)]);
      assert.deepEqual(n.board, { listed: 6, fetched: 1, reused: 5, skipped: 0 });
      assert.deepEqual(n.events, { ...noEvents, posting_reposted: 1 });

      // Night 4: 2 is retitled to an engineering title in the list, and 1 has an empty stored body (as it would after
      // a title rule change: stored without its text when the rules ruled it out). Both are fetched, both are edits.
      board = board.map(([id, title]) => [id, id === 2 ? 'Solutions Engineer' : title]);
      db.prepare("update postings set body = '', body_hash = ? where external_id = '1'").run(sha256('Backend Engineer\n'));
      n = await night(db, c, '2026-11-04', calls);
      assert.deepEqual(n.requests, [`GET ${base}/list`, detail(1), detail(2)]);
      assert.deepEqual(n.board, { listed: 6, fetched: 2, reused: 4, skipped: 0 });
      assert.deepEqual(n.events, { ...noEvents, posting_edited: 2 });
      assert.equal(body(1), 'The text of posting 1.');
      assert.equal(body(2), 'The text of posting 2.');
      assert.equal(count(db, 'select count(*) as n from postings'), 6);
    } finally {
      restore();
    }
  });

  test('workday: the detail replaces the id, and the stored row is still found by its path', async () => {
    const c = company('acme-wd', 'workday', 'acme.wd3/Careers');
    const db = dbWith(c);
    const api = 'https://acme.wd3.myworkdayjobs.com/wday/cxs/acme/Careers';
    const jobs = [
      { title: 'Software Engineer', externalPath: '/job/Zagreb/Software-Engineer_JR1', locationsText: 'Zagreb' },
      { title: 'Account Executive', externalPath: '/job/Zagreb/Account-Executive_JR2', locationsText: 'Zagreb' },
    ];
    const info = (JSON.parse(fixture('workday-detail.json')) as { jobPostingInfo: Record<string, unknown> }).jobPostingInfo;
    const { calls, restore } = mockHost('acme.wd3.myworkdayjobs.com', (url, init) => {
      if (init?.method === 'POST') return { body: JSON.stringify({ total: 2, jobPostings: jobs }), type: 'application/json' };
      const path = url.slice(api.length);
      const job = jobs.find((j) => j.externalPath === path)!;
      const jobPostingInfo = {
        ...info, id: `wid-${path.split('_').pop()}`, title: job.title, location: 'Zagreb', additionalLocations: [],
        externalUrl: `https://acme.wd3.myworkdayjobs.com/Careers${path}`,
      };
      return { body: JSON.stringify({ jobPostingInfo }), type: 'application/json' };
    });
    try {
      let n = await night(db, c, '2026-11-01', calls);
      assert.deepEqual(n.requests, [`POST ${api}/jobs`, `GET ${api}${jobs[0].externalPath}`]);
      assert.deepEqual(n.board, { listed: 2, fetched: 1, reused: 0, skipped: 1 });
      const ids = () => (db.prepare('select external_id from postings order by external_id').all() as { external_id: string }[]).map((r) => r.external_id);
      // The fetched posting has its own id; the skipped one keeps the path the list gave.
      assert.deepEqual(ids(), ['/job/Zagreb/Account-Executive_JR2', 'wid-JR1']);

      n = await night(db, c, '2026-11-01', calls);
      assert.deepEqual(n.requests, [`POST ${api}/jobs`]);
      assert.deepEqual(n.board, { listed: 2, fetched: 0, reused: 2, skipped: 0 });
      assert.deepEqual(n.counts, { seen: 2, new: 0, edited: 0, gone: 0 });

      n = await night(db, c, '2026-11-02', calls);
      assert.deepEqual(n.requests, [`POST ${api}/jobs`]);
      assert.deepEqual(n.events, noEvents);
      assert.deepEqual(ids(), ['/job/Zagreb/Account-Executive_JR2', 'wid-JR1']);
    } finally {
      restore();
    }
  });

  test('deel: a list of URLs only is matched by id and never skipped by title', async () => {
    const c = company('acme-deel', 'deel', 'acme');
    const db = dbWith(c);
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const titles = ['Backend Engineer', 'Account Executive'];
    const page = (url: string) => `https://jobs.deel.com/acme/job-details/${url}/overview`;
    const ld = (v: unknown) => `<script type="application/ld+json">${JSON.stringify(v)}</script>`;
    const { calls, restore } = mockHost('jobs.deel.com', (url) => {
      if (url === 'https://jobs.deel.com/acme') {
        return { body: ld({ '@type': 'ItemList', itemListElement: ids.map((id) => ({ url: page(id) })) }), type: 'text/html' };
      }
      const i = ids.findIndex((id) => url.includes(id));
      const job = { '@type': 'JobPosting', title: titles[i], description: `About ${titles[i]}.`, datePosted: '2026-10-01', identifier: { value: ids[i] } };
      return { body: ld(job), type: 'text/html' };
    });
    try {
      let n = await night(db, c, '2026-11-01', calls);
      assert.deepEqual(n.requests, ['GET https://jobs.deel.com/acme', `GET ${page(ids[0])}`, `GET ${page(ids[1])}`]);
      assert.deepEqual(n.board, { listed: 2, fetched: 2, reused: 0, skipped: 0 });

      n = await night(db, c, '2026-11-02', calls);
      assert.deepEqual(n.requests, ['GET https://jobs.deel.com/acme']);
      assert.deepEqual(n.board, { listed: 2, fetched: 0, reused: 2, skipped: 0 });
      assert.deepEqual(n.events, noEvents);
      // The title the list lacks comes from the stored row.
      const rows = db.prepare('select title, body from postings order by title').all() as { title: string; body: string }[];
      assert.deepEqual(rows.map((r) => r.title), ['Account Executive', 'Backend Engineer']);
    } finally {
      restore();
    }
  });
});
