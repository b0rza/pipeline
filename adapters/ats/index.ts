import { classify } from '../../core/filter.ts';
import { fetchText } from '../../core/http.ts';
import type { Company, NormalizedPosting } from '../../core/types.ts';
import { ashby } from './ashby.ts';
import { bamboohr } from './bamboohr.ts';
import { breezy } from './breezy.ts';
import { deel } from './deel.ts';
import { gohire } from './gohire.ts';
import { greenhouse } from './greenhouse.ts';
import { haileyhr } from './haileyhr.ts';
import { hirehive } from './hirehive.ts';
import { homerun } from './homerun.ts';
import { jazzhr } from './jazzhr.ts';
import { lever } from './lever.ts';
import { personio } from './personio.ts';
import { pinpoint } from './pinpoint.ts';
import { recruitee } from './recruitee.ts';
import { remoteAts } from './remote-ats.ts';
import { rippling } from './rippling.ts';
import { shopifyCareers } from './shopify-careers.ts';
import { smartrecruiters } from './smartrecruiters.ts';
import { teamtailor } from './teamtailor.ts';
import type { AtsAdapter, FeedRequest } from './types.ts';
import { workable } from './workable.ts';
import { workday } from './workday.ts';
import { zoho } from './zoho.ts';

export const adapters: Record<string, AtsAdapter> = {
  greenhouse, lever, personio, teamtailor, jazzhr, bamboohr, breezy, rippling,
  workable, recruitee, smartrecruiters, ashby, zoho, pinpoint, hirehive, gohire, homerun, haileyhr, workday, deel,
  'shopify-careers': shopifyCareers, 'remote-ats': remoteAts,
};

// The first feed request: the adapter's own (a POST) or a GET of feedUrl.
export function firstRequest(adapter: AtsAdapter, slug: string): FeedRequest {
  return adapter.feedRequest?.(slug) ?? { url: adapter.feedUrl(slug) };
}

function nextRequest(adapter: AtsAdapter, text: string, contentType: string, req: FeedRequest): FeedRequest | null {
  if (adapter.nextRequest) return adapter.nextRequest(text, contentType, req);
  const url = adapter.next?.(text, contentType, req.url);
  return url ? { url } : null;
}

// A row of the postings table for the company being fetched, as snapshot.ts reads it: raw parsed, gone for a row
// with gone_at set.
export interface StoredPosting extends NormalizedPosting {
  gone: boolean;
}

// What happened to a board's listed postings. fetched + reused + skipped = listed for an adapter with a detail page.
export interface BoardCounts {
  listed: number;
  fetched: number;   // detail requests sent
  reused: number;    // known and live: detail fields from the stored row, no request
  skipped: number;   // not known and the list title rules it out: stored without the detail, no request
}

// The filter (core/filter.ts classify) drops these on the title alone, so the posting's text is never read.
const TITLE_RULES_OUT = new Set(['evergreen', 'non-engineering']);
export const titleRulesOut = (title: string) => TITLE_RULES_OUT.has(classify(title, '').reason);

const keyOf = (detail: NonNullable<AtsAdapter['detail']>, p: NormalizedPosting) => detail.key?.(p) ?? p.external_id;

// A listed posting completed from its stored row instead of a detail request: the fields the detail sets come from
// the row, the rest from the list. Title and location come from the list whenever it carries them, so a retitle or
// a move in the list is still seen; an edit to the text alone is not (owner's choice, 2026-11-09).
export function reuse(detail: NonNullable<AtsAdapter['detail']>, listed: NormalizedPosting, stored: NormalizedPosting): NormalizedPosting {
  const p: NormalizedPosting = { ...listed, ...Object.fromEntries(detail.sets.map((f) => [f, stored[f]])) };
  if (listed.title) p.title = listed.title;
  if (listed.location) p.location = listed.location;
  return p;
}

export async function fetchPostings(company: Company, known?: StoredPosting[]): Promise<NormalizedPosting[]> {
  return (await fetchBoard(company, known)).postings;
}

// Without `known` every listed posting's detail is fetched. With it (snapshot.ts passes the company's stored rows,
// possibly none), in this order, so a re-run on the same day changes nothing:
//   1. known and live: reused from the stored row, unless its stored body is empty and its title no longer rules it
//      out (the title or the title rules changed), which is fetched;
//   2. not known, and the list's title rules it out: kept as listed (an empty body, or the list's own body);
//   3. everything else, including a gone posting that is listed again, is fetched.
// A fetched posting that matched a stored row keeps that row's external_id, so it stays the same row.
export async function fetchBoard(company: Company, known?: StoredPosting[]): Promise<{ postings: NormalizedPosting[]; counts: BoardCounts }> {
  const adapter = company.ats && adapters[company.ats.vendor];
  if (!company.ats || !adapter) throw new Error(`${company.id}: no adapter for ${company.ats?.vendor ?? 'missing ats'}`);
  // Paged feeds (adapter.next, adapter.nextRequest) are fetched page by page and concatenated; a failed page fails
  // the company.
  const postings: NormalizedPosting[] = [];
  for (let req: FeedRequest | null = firstRequest(adapter, company.ats.slug); req;) {
    const { url, ...opts } = req;
    const res = await fetchText(url, opts);
    postings.push(...adapter.parse(res.text, res.contentType, company.ats.slug));
    req = nextRequest(adapter, res.text, res.contentType, req);
  }
  const counts: BoardCounts = { listed: postings.length, fetched: 0, reused: 0, skipped: 0 };
  const detail = adapter.detail;
  if (!detail) return { postings, counts };

  // A live row wins over a gone one with the same key.
  const stored = new Map<string, StoredPosting>();
  for (const s of known ?? []) {
    const k = keyOf(detail, s);
    if (!stored.get(k) || stored.get(k)!.gone) stored.set(k, s);
  }

  // One at a time: fetchText queues per host anyway, and a failed detail fails the company like a failed feed,
  // so a half-fetched board never reaches snapshot as a batch of edits.
  const complete: NormalizedPosting[] = [];
  for (const p of postings) {
    const s = known && stored.get(keyOf(detail, p));
    if (s && !s.gone && !(s.body === '' && !titleRulesOut(p.title || s.title))) {
      complete.push(reuse(detail, p, s));
      counts.reused++;
      continue;
    }
    // Only where the list carries a title: deel's list has none.
    if (known && !s && p.title && titleRulesOut(p.title)) {
      complete.push(p);
      counts.skipped++;
      continue;
    }
    const d = await fetchText(detail.url(p, company.ats.slug));
    const full = detail.parse(d.text, d.contentType, p);
    complete.push(s ? { ...full, external_id: s.external_id } : full);
    counts.fetched++;
  }
  return { postings: complete, counts };
}
