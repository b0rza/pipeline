// Stage 3: route the run's live postings to apply | outreach | drop by keyword, then write one signal per company.
import type { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { openDb, sha256 } from './db.ts';
import { eligible, remoteScope, workCountry, workMode } from './location.ts';

export type Route = 'apply' | 'outreach' | 'drop';

const any = (...res: RegExp[]) => new RegExp(res.map((r) => r.source).join('|'), 'iu');

// Title only. Standing "apply any time" postings that never mean an open role.
const EVERGREEN = any(
  /talent pool/, /candidate pool/, /talent network/, /talent community/, /^future talent\b/, /initiativbewerbung/,
  /unsolicited application/, /general (job )?application/, /open application/, /spontaneous application/,
  /always looking/, /register here/, /open positions?$/, /pipeline$/, /^freelancer\s*[-–:]\s*[\p{L} ]+$/u,
);

// Title only, coarse on purpose: "Solutions Architect" passes, "UX Designer" does not.
const ENGINEERING = any(
  /engineer/, /developer/, /architect/, /tech(nical)?[ -]?lead/, /devops/, /\bsre\b/, /full[ -]?stack/,
  /front[ -]?end/, /back[ -]?end/, /software/, /programmer/, /\bsdet\b/, /\bcto\b/,
  /entwickler/, /kehittäjä/, /utvecklare/, /ontwikkelaar/, /programmeur/,
);

const TITLE_CONTRACT = any(/contract(or)?s?\b/, /freelanc\w*/, /interim/, /fixed[ -]term/, /temporary/, /\bbefristet/);

// Phrases, not the bare word: permanent postings say "vast contract", "employment contract", "contract testing".
const BODY_CONTRACT = any(
  /contract basis/, /contract (role|position|engagement|duration|opportunity)/, /contract[ -]based/,
  /(initial|long[ -]term|temporary|short[ -]term) contract/, /\d+[ -]?(month|week)s? contract/, /day rate/,
  /freelanc\w*/, /interim/, /fixed[ -]term/, /\bbefristet/, /\bb2b (contract|basis|agreement)/, /\bc2c\b/, /\b1099\b/,
);

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');

export function classify(title: string, body: string): { route: Route; reason: string } {
  const t = title.trim();
  if (EVERGREEN.test(t)) return { route: 'drop', reason: 'evergreen' };
  if (!ENGINEERING.test(t)) return { route: 'drop', reason: 'non-engineering' };
  const inTitle = t.match(TITLE_CONTRACT);
  if (inTitle) return { route: 'apply', reason: `title:${norm(inTitle[0])}` };
  const inBody = body.match(BODY_CONTRACT);
  if (inBody) return { route: 'apply', reason: `body:${norm(inBody[0])}` };
  return { route: 'outreach', reason: 'perm' };
}

// apply and outreach count signals (companies); dropped counts postings. A kept posting outside the owner's
// work arrangements (core/location.ts) is dropped; one inside it carries its location tag: `perm · hybrid:GB`,
// `perm · remote:US-only` when the posting restricts remote work to one country other than HR.
export function filterRun(db: DatabaseSync, runDate: string): { apply: number; outreach: number; dropped: number } {
  const rows = db.prepare(`
    select p.id, p.company_id, p.title, p.location, p.body, p.raw, c.country, e.kind
    from events e join postings p on p.id = e.posting_id join companies c on c.id = e.company_id
    where e.run_date = ? and e.kind != 'posting_gone' and c.status = 'active'`).all(runDate) as unknown as {
      id: string; company_id: string; title: string | null; location: string | null; body: string | null; raw: string | null;
      country: string | null; kind: string;
    }[];

  // A posting can carry two events in one run (edited and reposted); classify it once.
  const routes = new Map<string, Route>();
  const signals = new Map<string, { apply: boolean; kinds: Set<string>; ids: Set<string> }>();
  const setRoute = db.prepare('update postings set route = ?, route_reason = ?, work_mode = ?, work_country = ? where id = ?');
  const upsert = db.prepare(`
    insert into signals (id, company_id, run_date, list, kinds, ref_ids) values (:id, :company_id, :run_date, :list, :kinds, :ref_ids)
    on conflict(id) do update set list = excluded.list, kinds = excluded.kinds, ref_ids = excluded.ref_ids, updated_at = datetime('now')
    where list != excluded.list or kinds != excluded.kinds or ref_ids != excluded.ref_ids`);

  db.exec('begin');
  try {
    for (const r of rows) {
      let route = routes.get(r.id);
      if (!route) {
        let c = classify(r.title ?? '', r.body ?? '');
        const raw: unknown = r.raw ? JSON.parse(r.raw) : null;
        const mode = workMode(r.title ?? '', r.location, r.body ?? '', raw);
        const country = workCountry(r.location, raw, r.country ?? '', mode);
        if (c.route !== 'drop') {
          const scope = mode === 'remote' ? remoteScope(r.title ?? '', r.location, r.body ?? '', country) : null;
          const e = eligible(mode, country, r.location, scope);
          c = e.ok ? { ...c, reason: `${c.reason} · ${e.reason}` } : { route: 'drop', reason: e.reason };
        }
        setRoute.run(c.route, c.reason, mode, country, r.id);
        routes.set(r.id, (route = c.route));
      }
      if (route === 'drop') continue;
      const s = signals.get(r.company_id) ?? { apply: false, kinds: new Set(), ids: new Set() };
      s.apply ||= route === 'apply';
      s.kinds.add(r.kind);
      s.ids.add(r.id);
      signals.set(r.company_id, s);
    }

    // Upsert keeps the owner's status, skip_reason and snooze_until across re-runs.
    for (const [company_id, s] of signals) {
      upsert.run({
        id: sha256(company_id + runDate), company_id, run_date: runDate, list: s.apply ? 'apply' : 'outreach',
        kinds: JSON.stringify([...s.kinds].sort()), ref_ids: JSON.stringify([...s.ids].sort()),
      });
    }
    // A re-run after a rule change converges: untouched signals whose company kept nothing go.
    db.prepare(`
      delete from signals where run_date = ? and status = 'new' and company_id not in (select value from json_each(?))`)
      .run(runDate, JSON.stringify([...signals.keys()]));
    db.exec('commit');
  } catch (err) {
    db.exec('rollback');
    throw err;
  }

  const apply = [...signals.values()].filter((s) => s.apply).length;
  const dropped = [...routes.values()].filter((r) => r === 'drop').length;
  return { apply, outreach: signals.size - apply, dropped };
}

export function report(db: DatabaseSync, runDate: string): string {
  const rows = db.prepare(`
    select s.list, c.id as company_id, c.name, c.country, c.ats_vendor, p.title, p.location, p.url, p.route_reason
    from signals s join companies c on c.id = s.company_id, json_each(s.ref_ids) j join postings p on p.id = j.value
    where s.run_date = ?
    order by s.list, c.name, p.title`).all(runDate) as unknown as {
      list: 'apply' | 'outreach'; company_id: string; name: string; country: string; ats_vendor: string;
      title: string; location: string | null; url: string; route_reason: string;
    }[];
  const dropped = db.prepare(`
    select p.route_reason as reason, count(distinct p.id) as n
    from events e join postings p on p.id = e.posting_id join companies c on c.id = e.company_id
    where e.run_date = ? and e.kind != 'posting_gone' and c.status = 'active' and p.route = 'drop'
    group by p.route_reason order by p.route_reason`).all(runDate) as unknown as { reason: string; n: number }[];

  const companies = (n: number) => `${n} ${n === 1 ? 'company' : 'companies'}`;
  const lines: string[] = [];
  const signals: Record<string, number> = {};
  for (const list of ['apply', 'outreach'] as const) {
    const byCompany = new Map<string, typeof rows>();
    for (const r of rows) if (r.list === list) byCompany.set(r.company_id, [...(byCompany.get(r.company_id) ?? []), r]);
    const postings = [...byCompany.values()].reduce((n, ps) => n + ps.length, 0);
    signals[list] = byCompany.size;
    lines.push(`${list.toUpperCase()} (${companies(byCompany.size)}, ${postings} ${postings === 1 ? 'posting' : 'postings'})`);
    for (const ps of byCompany.values()) {
      const { name, country, ats_vendor } = ps[0];
      lines.push(`${name} (${country}, ${ats_vendor})`);
      for (const p of ps) {
        lines.push(`  - ${p.title} — ${p.location ?? 'no location'} ${p.url} [${p.route_reason}]`);
      }
    }
  }
  const nDropped = dropped.reduce((n, d) => n + d.n, 0);
  // location:IN and onsite:DE count under location and onsite.
  const byReason = new Map<string, number>();
  for (const d of dropped) {
    const reason = d.reason.replace(/^(location|onsite):.*/, '$1');
    byReason.set(reason, (byReason.get(reason) ?? 0) + d.n);
  }
  lines.push(`dropped: ${[...byReason].map(([reason, n]) => `${n} ${reason}`).join(', ') || 'none'}`);
  lines.push(
    `filter ${runDate}: ${signals.apply} apply, ${signals.outreach} outreach, ${nDropped} dropped ` +
    `across ${companies(signals.apply + signals.outreach)}`,
  );
  return lines.join('\n');
}

function main() {
  const runDate = process.env.RUN_DATE ?? new Date().toISOString().slice(0, 10);
  const db = openDb();
  try {
    filterRun(db, runDate);
    console.log(report(db, runDate));
  } finally {
    db.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
