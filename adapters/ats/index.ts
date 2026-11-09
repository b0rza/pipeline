import { fetchText } from '../../core/http.ts';
import type { Company, NormalizedPosting } from '../../core/types.ts';
import { ashby } from './ashby.ts';
import { bamboohr } from './bamboohr.ts';
import { breezy } from './breezy.ts';
import { deel } from './deel.ts';
import { greenhouse } from './greenhouse.ts';
import { jazzhr } from './jazzhr.ts';
import { lever } from './lever.ts';
import { personio } from './personio.ts';
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
  workable, recruitee, smartrecruiters, ashby, zoho, workday, deel,
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

export async function fetchPostings(company: Company): Promise<NormalizedPosting[]> {
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
  const detail = adapter.detail;
  if (!detail) return postings;
  // One at a time: fetchText queues per host anyway, and a failed detail fails the company like a failed feed,
  // so a half-fetched board never reaches snapshot as a batch of edits.
  const complete: NormalizedPosting[] = [];
  for (const p of postings) {
    const d = await fetchText(detail.url(p, company.ats.slug));
    complete.push(detail.parse(d.text, d.contentType, p));
  }
  return complete;
}
