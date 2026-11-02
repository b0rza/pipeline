import assert from 'node:assert/strict';
import { test } from 'node:test';
import { upsertCompanies } from '../core/companies.ts';
import { openDb } from '../core/db.ts';
import { diffRun } from '../core/diff.ts';
import { snapshotCompany } from '../core/snapshot.ts';
import type { Company, NormalizedPosting } from '../core/types.ts';

const company: Company = {
  id: 'acme', name: 'Acme Digital', domain: 'acme.test', country: 'GB', phases: ['p1'],
  source: 'test', ats: { vendor: 'greenhouse', slug: 'acme' }, storefront: null, status: 'active',
};

const posting = (external_id: string, title: string, body: string): NormalizedPosting => ({
  external_id, title, location: 'London', url: `https://example.test/${external_id}`,
  body, body_html: null, posted_at: null, raw: {},
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
