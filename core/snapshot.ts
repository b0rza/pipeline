// Stage 1: fetch each company's ATS feed, normalize, hash, upsert into postings.
import type { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { adapters, type BoardCounts, fetchBoard, type StoredPosting } from '../adapters/ats/index.ts';
import { loadCompanies, upsertCompanies } from './companies.ts';
import { openDb, sha256 } from './db.ts';
import type { Company, NormalizedPosting } from './types.ts';

const FAILURES_BEFORE_SKIP = 3;
const SKIP_MS = 24 * 60 * 60 * 1000;

// Every stored posting of the company, live and gone, for fetchBoard to match listed postings against (adapters
// with a detail page only).
export function storedPostings(db: DatabaseSync, companyId: string): StoredPosting[] {
  const rows = db.prepare(`
    select external_id, url, title, location, body, posted_at, raw, gone_at from postings where company_id = ?`)
    .all(companyId) as unknown as {
      external_id: string; url: string | null; title: string | null; location: string | null; body: string | null;
      posted_at: string | null; raw: string | null; gone_at: string | null;
    }[];
  return rows.map((r) => ({
    external_id: r.external_id, url: r.url ?? '', title: r.title ?? '', location: r.location, body: r.body ?? '',
    posted_at: r.posted_at, raw: r.raw ? JSON.parse(r.raw) : null, gone: r.gone_at !== null,
  }));
}

// The company's board, with what is already stored reused (adapters/ats/index.ts fetchBoard). Reads the database,
// writes nothing; throws when a request fails.
export async function fetchCompany(db: DatabaseSync, company: Company) {
  const adapter = company.ats && adapters[company.ats.vendor];
  return fetchBoard(company, adapter?.detail ? storedPostings(db, company.id) : undefined);
}

export function snapshotCompany(db: DatabaseSync, company: Company, postings: NormalizedPosting[], runDate: string) {
  const counts = { seen: 0, new: 0, edited: 0, gone: 0 };
  const find = db.prepare('select body_hash, gone_at from postings where id = ?');
  const insert = db.prepare(`
    insert into postings (id, company_id, external_id, url, title, location, body, body_hash, posted_at, first_seen, last_seen, raw)
    values (:id, :company_id, :external_id, :url, :title, :location, :body, :body_hash, :posted_at, :run_date, :run_date, :raw)`);
  const touch = db.prepare(`
    update postings set last_seen = :run_date, title = :title, location = :location, url = :url, gone_at = null
    where id = :id`);
  const reopen = db.prepare('update postings set repost_count = repost_count + 1, reposted_at = :run_date where id = :id');
  const edit = db.prepare(`
    update postings set body_hash_prev = body_hash, body_hash = :body_hash, body = :body, body_changed_at = :run_date, raw = :raw
    where id = :id`);

  db.exec('begin');
  try {
    for (const p of postings) {
      const id = sha256(`${company.id}:${p.external_id}`);
      // Title is hashed with the body so a retitled posting surfaces as an edit.
      const body_hash = sha256(`${p.title}\n${p.body}`);
      const raw = JSON.stringify(p.raw);
      const existing = find.get(id) as { body_hash: string; gone_at: string | null } | undefined;
      counts.seen++;
      if (!existing) {
        insert.run({
          id, company_id: company.id, external_id: p.external_id, url: p.url, title: p.title, location: p.location,
          body: p.body, body_hash, posted_at: p.posted_at, run_date: runDate, raw,
        });
        counts.new++;
        continue;
      }
      // A gone id coming back is a repost. Gone earlier today means a same-day re-run, so just undo it.
      if (existing.gone_at && existing.gone_at < runDate) reopen.run({ id, run_date: runDate });
      touch.run({ id, run_date: runDate, title: p.title, location: p.location, url: p.url });
      if (existing.body_hash !== body_hash) {
        edit.run({ id, body_hash, body: p.body, run_date: runDate, raw });
        counts.edited++;
      }
    }
    counts.gone = Number(db.prepare(`
      update postings set gone_at = :run_date
      where company_id = :company_id and last_seen < :run_date and gone_at is null`)
      .run({ company_id: company.id, run_date: runDate }).changes);
    db.prepare('update companies set consecutive_failures = 0, skip_until = null where id = ?').run(company.id);
    db.exec('commit');
  } catch (err) {
    db.exec('rollback');
    throw err;
  }
  return counts;
}

// Counts at most one failure per run date, so same-day re-runs can't trip the 24h skip.
export function recordFailure(db: DatabaseSync, companyId: string, runDate: string, now = new Date()): number {
  const row = db.prepare(`
    update companies set
      consecutive_failures = consecutive_failures + (case when last_failed_run = :run_date then 0 else 1 end),
      last_failed_run = :run_date
    where id = :id returning consecutive_failures`).get({ run_date: runDate, id: companyId }) as { consecutive_failures: number };
  if (row.consecutive_failures >= FAILURES_BEFORE_SKIP) {
    db.prepare('update companies set skip_until = ? where id = ?').run(new Date(now.getTime() + SKIP_MS).toISOString(), companyId);
  }
  return row.consecutive_failures;
}

async function main() {
  const runDate = process.env.RUN_DATE ?? new Date().toISOString().slice(0, 10);
  const companies = loadCompanies();
  const db = openDb();
  try {
    upsertCompanies(db, companies);
    db.prepare(`
      insert into runs (run_date, started_at) values (?, ?)
      on conflict(run_date) do nothing`).run(runDate, new Date().toISOString());

    const unsupported = new Map<string, number>();
    const totals = { polled: 0, ok: 0, failed: 0, skipped: 0, postings: 0, new: 0, edited: 0, gone: 0 };
    const details = { fetched: 0, reused: 0, skipped: 0 };
    const state = db.prepare('select skip_until from companies where id = ?');

    for (const c of companies) {
      if (c.status === 'paused' || !c.ats) { totals.skipped++; continue; }
      if (!adapters[c.ats.vendor]) {
        unsupported.set(c.ats.vendor, (unsupported.get(c.ats.vendor) ?? 0) + 1);
        totals.skipped++;
        continue;
      }
      const { skip_until } = state.get(c.id) as { skip_until: string | null };
      if (skip_until && skip_until > new Date().toISOString()) {
        console.log(`skip ${c.id}: failing feed, retry after ${skip_until}`);
        totals.skipped++;
        continue;
      }
      totals.polled++;
      let postings: NormalizedPosting[];
      let board: BoardCounts;
      try {
        ({ postings, counts: board } = await fetchCompany(db, c));
      } catch (err) {
        const n = recordFailure(db, c.id, runDate);
        console.log(`fail ${c.id} (${c.ats.vendor}/${c.ats.slug}): ${(err as Error).message} [${n} in a row]`);
        totals.failed++;
        continue;
      }
      const counts = snapshotCompany(db, c, postings, runDate);
      // Boards with a detail page only: the one request per posting is what makes a board slow.
      if (adapters[c.ats.vendor].detail) {
        console.log(
          `board ${c.id} (${c.ats.vendor}/${c.ats.slug}): ${board.listed} listed, ${board.fetched} details fetched, ` +
          `${board.reused} reused, ${board.skipped} skipped by title; ${counts.new} new, ${counts.edited} edited, ${counts.gone} gone`,
        );
        details.fetched += board.fetched;
        details.reused += board.reused;
        details.skipped += board.skipped;
      }
      totals.ok++;
      totals.postings += counts.seen;
      totals.new += counts.new;
      totals.edited += counts.edited;
      totals.gone += counts.gone;
    }

    for (const [vendor, n] of unsupported) console.log(`unsupported vendor: ${vendor} (${n} ${n === 1 ? 'company' : 'companies'})`);
    db.prepare('update runs set companies_polled = ? where run_date = ?').run(totals.polled, runDate);
    console.log(
      `snapshot ${runDate}: polled ${totals.polled} (ok ${totals.ok}, failed ${totals.failed}), skipped ${totals.skipped}; ` +
      `${totals.postings} postings seen, ${totals.new} new, ${totals.edited} edited, ${totals.gone} gone; ` +
      `details ${details.fetched} fetched, ${details.reused} reused, ${details.skipped} skipped by title`,
    );
  } finally {
    db.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
