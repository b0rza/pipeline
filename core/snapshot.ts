// Stage 1: fetch each company's ATS feed, normalize, hash, upsert into postings.
import type { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { adapters, fetchPostings } from '../adapters/ats/index.ts';
import { loadCompanies, upsertCompanies } from './companies.ts';
import { openDb, sha256 } from './db.ts';
import type { Company, NormalizedPosting } from './types.ts';

const FAILURES_BEFORE_SKIP = 3;
const SKIP_MS = 24 * 60 * 60 * 1000;

export function snapshotCompany(db: DatabaseSync, company: Company, postings: NormalizedPosting[], runDate: string) {
  const counts = { seen: 0, new: 0, edited: 0, gone: 0 };
  const find = db.prepare('select body_hash from postings where id = ?');
  const insert = db.prepare(`
    insert into postings (id, company_id, external_id, url, title, location, body, body_hash, posted_at, first_seen, last_seen, raw)
    values (:id, :company_id, :external_id, :url, :title, :location, :body, :body_hash, :posted_at, :run_date, :run_date, :raw)`);
  const touch = db.prepare('update postings set last_seen = :run_date, gone_at = null where id = :id');
  const edit = db.prepare(`
    update postings set body_hash_prev = body_hash, body_hash = :body_hash, body = :body, body_changed_at = :run_date, raw = :raw
    where id = :id`);

  db.exec('begin');
  try {
    for (const p of postings) {
      const id = sha256(`${company.id}:${p.external_id}`);
      const body_hash = sha256(p.body);
      const raw = JSON.stringify(p.raw);
      const existing = find.get(id) as { body_hash: string } | undefined;
      counts.seen++;
      if (!existing) {
        insert.run({
          id, company_id: company.id, external_id: p.external_id, url: p.url, title: p.title, location: p.location,
          body: p.body, body_hash, posted_at: p.posted_at, run_date: runDate, raw,
        });
        counts.new++;
        continue;
      }
      touch.run({ id, run_date: runDate });
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

export function recordFailure(db: DatabaseSync, companyId: string, now = new Date()): number {
  const row = db.prepare(`
    update companies set consecutive_failures = consecutive_failures + 1, last_failure_at = ?
    where id = ? returning consecutive_failures`).get(now.toISOString(), companyId) as { consecutive_failures: number };
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
      try {
        postings = await fetchPostings(c);
      } catch (err) {
        const n = recordFailure(db, c.id);
        console.log(`fail ${c.id} (${c.ats.vendor}/${c.ats.slug}): ${(err as Error).message} [${n} in a row]`);
        totals.failed++;
        continue;
      }
      const counts = snapshotCompany(db, c, postings, runDate);
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
      `${totals.postings} postings seen, ${totals.new} new, ${totals.edited} edited, ${totals.gone} gone`,
    );
  } finally {
    db.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
