// Stage 2: derive the run's per-posting events from postings and write them to events.
import type { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { openDb, sha256 } from './db.ts';

const REPOST_WINDOW_DAYS = 14;

type Kind = 'posting_new' | 'posting_edited' | 'posting_reposted' | 'posting_gone';
interface Row { id: string; company_id: string; title: string | null }

const normTitle = (t: string | null) => (t ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

function daysBefore(runDate: string, days: number): string {
  const d = new Date(`${runDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function diffRun(db: DatabaseSync, runDate: string): Record<Kind, number> {
  const events: { row: Row; kind: Kind }[] = [];
  const rows = (where: string) =>
    db.prepare(`select id, company_id, title from postings where ${where}`).all({ run_date: runDate }) as unknown as Row[];

  for (const row of rows('body_changed_at = :run_date and first_seen < :run_date')) events.push({ row, kind: 'posting_edited' });
  for (const row of rows('gone_at = :run_date')) events.push({ row, kind: 'posting_gone' });
  // A known id that came back after going gone (snapshot bumped repost_count).
  for (const row of rows('reposted_at = :run_date and first_seen < :run_date')) events.push({ row, kind: 'posting_reposted' });

  // Repost: the same title at the same company went gone within the window before this run.
  const candidates = db.prepare(`
    select id, title, repost_count from postings
    where company_id = :company_id and id != :id and gone_at is not null and gone_at between :since and :run_date
    order by gone_at desc`);
  const setReposts = db.prepare('update postings set repost_count = ? where id = ?');
  const since = daysBefore(runDate, REPOST_WINDOW_DAYS);

  db.exec('begin');
  try {
    // Recompute the day from scratch so a same-day re-run drops events that no longer hold.
    db.prepare('delete from events where run_date = ?').run(runDate);
    for (const row of rows('first_seen = :run_date')) {
      const title = normTitle(row.title);
      const prev = (candidates.all({ company_id: row.company_id, id: row.id, since, run_date: runDate }) as unknown as (Row & { repost_count: number })[])
        .find((c) => title !== '' && normTitle(c.title) === title);
      if (prev) setReposts.run(prev.repost_count + 1, row.id);
      events.push({ row, kind: prev ? 'posting_reposted' : 'posting_new' });
    }

    const insert = db.prepare(`
      insert or ignore into events (id, run_date, company_id, posting_id, kind) values (?, ?, ?, ?, ?)`);
    for (const { row, kind } of events) insert.run(sha256(row.id + runDate + kind), runDate, row.company_id, row.id, kind);

    const firstSeen = events.filter((e) => e.kind === 'posting_new' || e.kind === 'posting_reposted').length;
    db.prepare(`
      insert into runs (run_date, started_at, postings_new) values (?, ?, ?)
      on conflict(run_date) do update set postings_new = excluded.postings_new`).run(runDate, new Date().toISOString(), firstSeen);
    db.exec('commit');
  } catch (err) {
    db.exec('rollback');
    throw err;
  }

  const counts: Record<Kind, number> = { posting_new: 0, posting_edited: 0, posting_reposted: 0, posting_gone: 0 };
  for (const e of events) counts[e.kind]++;
  return counts;
}

export function report(db: DatabaseSync, runDate: string): string {
  const rows = db.prepare(`
    select c.id as company_id, c.name, c.country, c.ats_vendor, e.kind, p.title, p.location, p.url, p.repost_count
    from events e join companies c on c.id = e.company_id left join postings p on p.id = e.posting_id
    where e.run_date = ?
    order by c.name, e.kind, p.title`).all(runDate) as unknown as {
      company_id: string; name: string; country: string; ats_vendor: string; kind: Kind;
      title: string; location: string | null; url: string; repost_count: number;
    }[];

  const byCompany = new Map<string, typeof rows>();
  for (const r of rows) byCompany.set(r.company_id, [...(byCompany.get(r.company_id) ?? []), r]);

  const totals: Record<Kind, number> = { posting_new: 0, posting_edited: 0, posting_reposted: 0, posting_gone: 0 };
  const lines: string[] = [];
  for (const events of byCompany.values()) {
    const n: Record<Kind, number> = { posting_new: 0, posting_edited: 0, posting_reposted: 0, posting_gone: 0 };
    for (const e of events) { n[e.kind]++; totals[e.kind]++; }
    const { name, country, ats_vendor } = events[0];
    lines.push(`${name} (${country}, ${ats_vendor}): ${n.posting_new} new, ${n.posting_edited} edited, ${n.posting_reposted} reposted, ${n.posting_gone} gone`);
    for (const e of events) {
      if (e.kind !== 'posting_new' && e.kind !== 'posting_reposted') continue;
      const repost = e.kind === 'posting_reposted' ? ` (repost #${e.repost_count})` : '';
      lines.push(`  - ${e.title} — ${e.location ?? 'no location'} ${e.url}${repost}`);
    }
  }
  lines.push(
    `diff ${runDate}: ${totals.posting_new} new, ${totals.posting_edited} edited, ${totals.posting_reposted} reposted, ` +
    `${totals.posting_gone} gone across ${byCompany.size} ${byCompany.size === 1 ? 'company' : 'companies'}`,
  );
  return lines.join('\n');
}

function main() {
  const runDate = process.env.RUN_DATE ?? new Date().toISOString().slice(0, 10);
  const db = openDb();
  try {
    diffRun(db, runDate);
    console.log(report(db, runDate));
  } finally {
    db.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
