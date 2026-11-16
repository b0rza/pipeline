import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { upsertCompanies } from '../core/companies.ts';
import { openDb } from '../core/db.ts';
import { diffRun } from '../core/diff.ts';
import { filterRun } from '../core/filter.ts';
import { HttpError } from '../core/http.ts';
import { failRun, finishRun, startRun } from '../core/runs.ts';
import { type fetchCompany, snapshotRun } from '../core/snapshot.ts';
import type { Company, NormalizedPosting } from '../core/types.ts';

const company = (id: string, extra: Partial<Company> = {}): Company => ({
  id, name: id, domain: `${id}.test`, country: 'GB', phases: ['p1'],
  source: 'test', ats: { vendor: 'greenhouse', slug: id }, storefront: null, status: 'active', warm: false, ...extra,
});

const posting = (external_id: string, title: string): NormalizedPosting => ({
  external_id, title, location: 'London', url: `https://example.test/${external_id}`, body: '', posted_at: null, raw: {},
});

const companies = [
  company('acme'), company('beta'), company('synolia'),
  company('paused', { status: 'paused' }), company('oddvendor', { ats: { vendor: 'unknown', slug: 'x' } }),
];

// Boards by company id; a missing one fails as a 404 does.
const fetcher = (boards: Record<string, NormalizedPosting[]>): typeof fetchCompany => async (_db, c) => {
  const postings = boards[c.id];
  if (!postings) throw new HttpError(404, `https://boards.test/${c.id}`);
  return { postings, counts: { listed: postings.length, fetched: 0, reused: 0, skipped: 0 } };
};

const day1 = {
  acme: [posting('a1', 'Senior Frontend Engineer, Contract'), posting('a2', 'Software Engineer')],
  beta: [posting('b1', 'Backend Engineer')],
};

const quiet = () => {};

async function nightly(db: DatabaseSync, runDate: string, boards: Record<string, NormalizedPosting[]>) {
  startRun(db, runDate);
  await snapshotRun(db, companies, runDate, fetcher(boards), quiet);
  diffRun(db, runDate);
  return filterRun(db, runDate);
}

const row = (db: DatabaseSync, runDate: string) => ({ ...db.prepare('select * from runs where run_date = ?').get(runDate) });
const counts = (r: Record<string, unknown>) => {
  const { started_at, finished_at, ...rest } = r;
  return rest;
};

test('snapshot, diff and filter fill the run row', async () => {
  const db = openDb(':memory:');
  upsertCompanies(db, companies);
  const f = await nightly(db, '2026-11-16', day1);
  const r = row(db, '2026-11-16');
  assert.match(String(r.started_at), /^2\d{3}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.deepEqual(counts(r), {
    run_date: '2026-11-16', companies_polled: 3, postings_new: 3, signals_drafted: null, notes: null,
    boards_ok: 2, boards_failed: 1, failed_boards: JSON.stringify([{ id: 'synolia', reason: 'HTTP 404 https://boards.test/synolia' }]),
    postings_gone: 0, signals: f.apply + f.outreach, messages_sent: null, error: null,
  });
  assert.equal(r.signals, 2);
  assert.equal(r.finished_at, null);
  db.close();
});

test('a failure reason keeps its first line only', async () => {
  const db = openDb(':memory:');
  upsertCompanies(db, companies);
  const fetch: typeof fetchCompany = async () => { throw new Error('socket hang up\n    at somewhere'); };
  startRun(db, '2026-11-16');
  await snapshotRun(db, [company('acme')], '2026-11-16', fetch, quiet);
  assert.deepEqual(JSON.parse(String(row(db, '2026-11-16').failed_boards)), [{ id: 'acme', reason: 'socket hang up' }]);
  db.close();
});

test('the next day counts gone postings; finish and fail write the end', async () => {
  const db = openDb(':memory:');
  upsertCompanies(db, companies);
  await nightly(db, '2026-11-16', day1);
  const end = new Date('2026-11-16T05:01:30.000Z');
  assert.equal(finishRun(db, '2026-11-16', end), true);
  assert.equal(row(db, '2026-11-16').finished_at, '2026-11-16T05:01:30.000Z');

  await nightly(db, '2026-11-17', { acme: day1.acme, beta: [], synolia: [] });
  const r = row(db, '2026-11-17');
  assert.equal(r.postings_new, 0);
  assert.equal(r.postings_gone, 1);
  assert.equal(r.boards_ok, 3);
  assert.equal(r.boards_failed, 0);
  assert.equal(r.failed_boards, '[]');

  const failedAt = new Date('2026-11-17T05:02:00.000Z');
  assert.equal(failRun(db, '2026-11-17', '7', 'GrammyError: Call to \'sendMessage\' failed!\n  (400)', failedAt),
    "stage 7: GrammyError: Call to 'sendMessage' failed! (400)");
  const failed = row(db, '2026-11-17');
  assert.equal(failed.error, "stage 7: GrammyError: Call to 'sendMessage' failed! (400)");
  assert.equal(failed.finished_at, '2026-11-17T05:02:00.000Z');
  assert.equal(failed.boards_ok, 3, 'fail keeps the counts');
  assert.equal(finishRun(db, '2026-11-18'), false, 'no row to finish');
  db.close();
});

test('fail before stage 1 started the run writes the row itself', () => {
  const db = openDb(':memory:');
  const at = new Date('2026-11-16T05:00:00.000Z');
  failRun(db, '2026-11-16', 'setup', '', at);
  assert.deepEqual(row(db, '2026-11-16'), {
    run_date: '2026-11-16', started_at: at.toISOString(), finished_at: at.toISOString(), companies_polled: null,
    postings_new: null, signals_drafted: null, notes: null, boards_ok: null, boards_failed: null, failed_boards: null,
    postings_gone: null, signals: null, messages_sent: null, error: 'stage setup: no error output',
  });
  db.close();
});

test('a second run the same day overwrites the row, adds none, and starts it afresh', async () => {
  const db = openDb(':memory:');
  upsertCompanies(db, companies);
  await nightly(db, '2026-11-16', day1);
  const first = row(db, '2026-11-16');
  db.prepare("update runs set messages_sent = 3 where run_date = '2026-11-16'").run();
  failRun(db, '2026-11-16', '7', 'Error: boom');

  await nightly(db, '2026-11-16', day1);
  assert.equal((db.prepare('select count(*) as n from runs').get() as { n: number }).n, 1);
  const second = row(db, '2026-11-16');
  assert.deepEqual(counts(second), counts(first));
  assert.equal(second.finished_at, null, 'the re-run is in progress again');
  assert.equal(second.error, null);
  assert.equal(second.messages_sent, null);
  assert.ok(String(second.started_at) >= String(first.started_at));
  db.close();
});

test('migration 004 adds the outcome columns to a runs table of the old shape and keeps its rows', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'runs-')), 'old.sqlite');
  const old = new DatabaseSync(path);
  old.exec(`
    create table schema_migrations (name text primary key, applied_at text not null default (datetime('now')));
    insert into schema_migrations (name) values ('001-filter-route.sql'), ('002-work-location.sql'), ('003-company-kind.sql');
    create table runs (run_date text primary key, started_at text not null, finished_at text, companies_polled integer,
      postings_new integer, signals_drafted integer, notes text);
    insert into runs (run_date, started_at, companies_polled, postings_new) values ('2026-11-15', '2026-11-15T05:00:00.000Z', 163, 8);`);
  old.close();
  const db = openDb(path);
  const cols = (db.prepare("select name from pragma_table_info('runs')").all() as { name: string }[]).map((c) => c.name);
  assert.deepEqual(cols.slice(-7), ['boards_ok', 'boards_failed', 'failed_boards', 'postings_gone', 'signals', 'messages_sent', 'error']);
  assert.equal(row(db, '2026-11-15').companies_polled, 163);
  assert.ok(db.prepare("select 1 from schema_migrations where name = '004-run-outcome.sql'").get());
  db.close();
});
