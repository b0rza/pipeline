import assert from 'node:assert/strict';
import { test } from 'node:test';
import { upsertCompanies } from '../core/companies.ts';
import { openDb } from '../core/db.ts';
import { diffRun, report } from '../core/diff.ts';
import { recordFailure, snapshotCompany } from '../core/snapshot.ts';
import type { Company, NormalizedPosting } from '../core/types.ts';

const company: Company = {
  id: 'acme', name: 'Acme Digital', domain: 'acme.test', country: 'GB', phases: ['p1'],
  source: 'test', ats: { vendor: 'greenhouse', slug: 'acme' }, storefront: null, status: 'active',
};

const posting = (external_id: string, title: string, body: string): NormalizedPosting => ({
  external_id, title, location: 'London', url: `https://example.test/${external_id}`,
  body, posted_at: null, raw: {},
});

const A = posting('1', 'Senior Frontend Engineer', 'Nuxt and Vue.');
const A2 = posting('1', 'Senior Frontend Engineer', 'Nuxt and Vue. Contract, 6 months.');
const B = posting('2', 'Backend Developer', 'Node.');
const C = posting('3', 'Vue Developer', 'Vue.');
const D = posting('4', 'Backend-Developer', 'Node, again.');

test('snapshot + diff across days', () => {
  const db = openDb(':memory:');
  upsertCompanies(db, [company]);
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  const events = (runDate: string) =>
    db.prepare(`select p.external_id, e.kind from events e join postings p on p.id = e.posting_id
                where e.run_date = ? order by p.external_id`).all(runDate).map((r) => `${r.external_id}:${r.kind}`);

  // day 1: two new postings
  snapshotCompany(db, company, [A, B], '2026-11-01');
  assert.deepEqual(diffRun(db, '2026-11-01'), { posting_new: 2, posting_edited: 0, posting_reposted: 0, posting_gone: 0 });
  assert.deepEqual(events('2026-11-01'), ['1:posting_new', '2:posting_new']);

  // day 2: A edited, B gone, C new
  assert.deepEqual(snapshotCompany(db, company, [A2, C], '2026-11-02'), { seen: 2, new: 1, edited: 1, gone: 1 });
  diffRun(db, '2026-11-02');
  const day2 = ['1:posting_edited', '2:posting_gone', '3:posting_new'];
  assert.deepEqual(events('2026-11-02'), day2);
  const a = db.prepare("select body_hash, body_hash_prev, body_changed_at from postings where external_id = '1'").get()!;
  assert.ok(a.body_hash_prev && a.body_hash_prev !== a.body_hash);
  assert.equal(a.body_changed_at, '2026-11-02');

  // day 2 again: nothing changes
  const before = [count('select count(*) as n from postings'), count('select count(*) as n from events')];
  assert.deepEqual(snapshotCompany(db, company, [A2, C], '2026-11-02'), { seen: 2, new: 0, edited: 0, gone: 0 });
  diffRun(db, '2026-11-02');
  assert.deepEqual([count('select count(*) as n from postings'), count('select count(*) as n from events')], before);
  assert.deepEqual(events('2026-11-02'), day2);

  // day 5: B's title reappears under a new id within 14 days of B going
  snapshotCompany(db, company, [A2, C, D], '2026-11-05');
  assert.deepEqual(diffRun(db, '2026-11-05'), { posting_new: 0, posting_edited: 0, posting_reposted: 1, posting_gone: 0 });
  assert.deepEqual(events('2026-11-05'), ['4:posting_reposted']);
  assert.equal(count("select repost_count as n from postings where external_id = '4'"), 1);
  assert.equal(count("select postings_new as n from runs where run_date = '2026-11-05'"), 1);
  assert.equal(count('select count(*) as n from postings'), 4);

  db.close();
});

test('day 2 fetch with an empty feed marks everything gone once', () => {
  const db = openDb(':memory:');
  upsertCompanies(db, [company]);
  snapshotCompany(db, company, [A, B], '2026-11-01');
  assert.equal(snapshotCompany(db, company, [], '2026-11-02').gone, 2);
  assert.equal(snapshotCompany(db, company, [], '2026-11-03').gone, 0);
  db.close();
});

function fresh() {
  const db = openDb(':memory:');
  upsertCompanies(db, [company]);
  const events = (runDate: string) =>
    db.prepare(`select p.external_id, e.kind from events e join postings p on p.id = e.posting_id
                where e.run_date = ? order by p.external_id`).all(runDate).map((r) => `${r.external_id}:${r.kind}`);
  const row = (external_id: string) =>
    db.prepare('select repost_count, gone_at from postings where external_id = ?').get(external_id)!;
  return { db, events, row };
}

test('a gone id that comes back is a repost, counted once per return', () => {
  const { db, events, row } = fresh();
  snapshotCompany(db, company, [A, B], '2026-11-01');
  diffRun(db, '2026-11-01');
  snapshotCompany(db, company, [A], '2026-11-02');
  diffRun(db, '2026-11-02');

  const reposted = { posting_new: 0, posting_edited: 0, posting_reposted: 1, posting_gone: 0 };
  assert.deepEqual(snapshotCompany(db, company, [A, B], '2026-11-04'), { seen: 2, new: 0, edited: 0, gone: 0 });
  assert.deepEqual(diffRun(db, '2026-11-04'), reposted);
  assert.deepEqual(events('2026-11-04'), ['2:posting_reposted']);
  assert.equal(row('2').repost_count, 1);
  assert.equal(row('2').gone_at, null);
  assert.match(report(db, '2026-11-04'), /Backend Developer .*\(repost #1\)/);

  // same day again: no extra repost, no extra events
  snapshotCompany(db, company, [A, B], '2026-11-04');
  assert.deepEqual(diffRun(db, '2026-11-04'), reposted);
  assert.deepEqual(events('2026-11-04'), ['2:posting_reposted']);
  assert.equal(row('2').repost_count, 1);

  // second time round
  snapshotCompany(db, company, [A], '2026-11-05');
  diffRun(db, '2026-11-05');
  snapshotCompany(db, company, [A, B], '2026-11-06');
  assert.deepEqual(diffRun(db, '2026-11-06'), reposted);
  assert.equal(row('2').repost_count, 2);
  assert.match(report(db, '2026-11-06'), /\(repost #2\)/);
  db.close();
});

test('a title change with the same body is an edit and updates the title', () => {
  const { db, events } = fresh();
  snapshotCompany(db, company, [A], '2026-11-01');
  diffRun(db, '2026-11-01');
  const renamed = { ...A, title: 'Staff Frontend Engineer', location: 'Remote', url: 'https://example.test/1-staff' };
  assert.equal(snapshotCompany(db, company, [renamed], '2026-11-02').edited, 1);
  diffRun(db, '2026-11-02');
  assert.deepEqual(events('2026-11-02'), ['1:posting_edited']);
  const stored = db.prepare("select title, location, url from postings where external_id = '1'").get()!;
  assert.deepEqual({ ...stored }, { title: 'Staff Frontend Engineer', location: 'Remote', url: 'https://example.test/1-staff' });
  db.close();
});

test('a posting gone and back within one run date leaves no gone event', () => {
  const { db, events, row } = fresh();
  snapshotCompany(db, company, [A, B], '2026-11-01');
  diffRun(db, '2026-11-01');
  snapshotCompany(db, company, [A], '2026-11-02');
  diffRun(db, '2026-11-02');
  assert.deepEqual(events('2026-11-02'), ['2:posting_gone']);

  snapshotCompany(db, company, [A, B], '2026-11-02');
  assert.deepEqual(diffRun(db, '2026-11-02'), { posting_new: 0, posting_edited: 0, posting_reposted: 0, posting_gone: 0 });
  assert.deepEqual(events('2026-11-02'), []);
  assert.equal(row('2').gone_at, null);
  assert.equal(row('2').repost_count, 0);
  db.close();
});

test('recordFailure counts at most one failure per run date', () => {
  const state = (db: ReturnType<typeof openDb>) =>
    db.prepare("select consecutive_failures, skip_until from companies where id = 'acme'").get()!;

  const days = fresh().db;
  for (const d of ['2026-11-01', '2026-11-02', '2026-11-03']) recordFailure(days, 'acme', d);
  assert.equal(state(days).consecutive_failures, 3);
  assert.ok(state(days).skip_until, 'skip_until set after three run dates');
  days.close();

  const sameDay = fresh().db;
  for (let i = 0; i < 3; i++) recordFailure(sameDay, 'acme', '2026-11-01');
  assert.equal(state(sameDay).consecutive_failures, 1);
  assert.equal(state(sameDay).skip_until, null);
  sameDay.close();
});
