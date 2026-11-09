// Stage 3: route the run's live postings to apply | outreach | drop by keyword, then write one signal per company.
import type { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { openDb, sha256 } from './db.ts';
import { eligible, employerRule, HOME, remoteScope, workCountry, workMode } from './location.ts';

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
  /freelanc\w*/, /interim/, /fixed[ -]term/, /\bbefristet/,
);

// Whole words in any script, case-insensitive: \b only knows ASCII letters, so "ä" or "ł" next to a word would count
// as a boundary. Pass /…/u literals: they keep \p{L} valid.
const words = (...res: RegExp[]) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${res.map((r) => r.source).join('|')})(?![\\p{L}\\p{N}])`, 'iu');

// B2B: the owner's company invoices the client, as opposed to a temporary job on the agency's payroll. Title and body.
// The bare "b2b" is a market in most postings ("B2B commerce", "B2B-Umfeld"), so it counts only beside a contract word.
// "selbstständig" alone means "independently" in German postings; only the self-employment phrases count.
// "on invoice" alone is a topic in fintech postings ("work on invoice processing").
const B2B = words(
  /outside (of )?ir35/u, /(?<!(?:^|[^\p{L}\p{N}])no )(c2c|corp[ -]to[ -]corp)/u, /1099/u, /zzp(ers?)?/u,
  /freelance[ -]?opdracht\p{L}*/u, /underkonsult\p{L}*/u, /frilans\p{L}*/u, /(umow\p{L}*|kontrak\p{L}*|contract)( type)?:? b2b/u,
  /b2b[ -](umow\p{L}*|kontrak\p{L}*|contract|basis|agreement)/u, /self[ -]?employed/u,
  /als selbst(st)?ändige[rn]?/u, /selbst(st)?ändige[rn]? tätigkeit/u, /auf selbst(st)?ändiger basis/u, /invoice basis/u,
  /(paid|billed) on invoice/u,
);

// Payroll only: still apply (the owner reads these), marked so the card says so.
const PAYROLL = words(/w-?2[ -]only/u, /no (c2c|corp[ -]to[ -]corp)/u, /inside (of )?ir35/u, /umbrella (company|contract)/u, /payroll only/u);

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');

// The reason is the word that decided it; an apply posting that also says payroll only gets ` · payroll` after it, and
// filterRun adds the location tag after that: `title:contract · payroll · remote:US-only`.
export function classify(title: string, body: string): { route: Route; reason: string } {
  const t = title.trim();
  if (EVERGREEN.test(t)) return { route: 'drop', reason: 'evergreen' };
  if (!ENGINEERING.test(t)) return { route: 'drop', reason: 'non-engineering' };
  const b2b = t.match(B2B) ?? body.match(B2B);
  const inTitle = t.match(TITLE_CONTRACT);
  const inBody = body.match(BODY_CONTRACT);
  const reason = b2b ? `b2b:${norm(b2b[0])}` : inTitle ? `title:${norm(inTitle[0])}` : inBody ? `body:${norm(inBody[0])}` : null;
  if (!reason) return { route: 'outreach', reason: 'perm' };
  // Title too: "Java Developer (W2 only)" is common.
  return { route: 'apply', reason: PAYROLL.test(t) || PAYROLL.test(body) ? `${reason} · payroll` : reason };
}

// apply and outreach count signals (companies); dropped counts postings. A kept posting outside the owner's
// work arrangements (core/location.ts) is dropped; one inside it carries its location tag: `perm · hybrid:GB`,
// `perm · remote:US-only` when the posting restricts remote work to one country other than HR.
// An employer's engineering postings all go to apply, a permanent one with reason `employer`. employerRule() decides
// from what the posting says about where the work may be done: Croatia named gets the agency tag with HR
// (`employer · remote:HR`, `employer · hybrid:HR`, on-site outside Split drops as `onsite:HR`); a scope that covers
// Croatia is `remote:global`, `remote:europe` or `remote:emea`; nothing named is `remote:unstated`; the rest drop
// (`employer:not-remote`, `employer:US-only`, `employer:elsewhere`). eligible() does not run on the scope and unstated
// tags: its country is the board's office or the company's own country there, not where the owner would work.
export function filterRun(db: DatabaseSync, runDate: string): { apply: number; outreach: number; dropped: number } {
  const rows = db.prepare(`
    select p.id, p.company_id, p.title, p.location, p.body, p.raw, c.country, c.kind as company_kind, e.kind
    from events e join postings p on p.id = e.posting_id join companies c on c.id = e.company_id
    where e.run_date = ? and e.kind != 'posting_gone' and c.status = 'active'`).all(runDate) as unknown as {
      id: string; company_id: string; title: string | null; location: string | null; body: string | null; raw: string | null;
      country: string | null; company_kind: string; kind: string;
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
        let country = workCountry(r.location, raw, r.country ?? '', mode);
        if (c.route !== 'drop') {
          let e: { ok: boolean; reason: string };
          if (r.company_kind === 'employer') {
            if (c.route === 'outreach') c = { route: 'apply', reason: 'employer' };
            const v = employerRule(r.title ?? '', r.location, r.body ?? '', raw, mode);
            if (!v.keep) e = { ok: false, reason: v.reason };
            else if (v.home) e = eligible(mode, (country = HOME), r.location, mode === 'remote' ? HOME : null);
            else e = { ok: true, reason: v.tag };
          } else {
            const scope = mode === 'remote' ? remoteScope(r.title ?? '', r.location, r.body ?? '', country) : null;
            e = eligible(mode, country, r.location, scope);
          }
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
  // location:IN and onsite:DE count under location and onsite, employer:US-only under employer:XX-only;
  // employer:elsewhere and employer:not-remote stay as they are.
  const byReason = new Map<string, number>();
  for (const d of dropped) {
    const reason = d.reason.replace(/^(location|onsite):.*/, '$1').replace(/^employer:[A-Z]{2}-only$/, 'employer:XX-only');
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
