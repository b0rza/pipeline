import { fetchText } from '../../core/http.ts';
import type { Company, NormalizedPosting } from '../../core/types.ts';
import { ashby } from './ashby.ts';
import { bamboohr } from './bamboohr.ts';
import { breezy } from './breezy.ts';
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
import { rippling } from './rippling.ts';
import { smartrecruiters } from './smartrecruiters.ts';
import { teamtailor } from './teamtailor.ts';
import type { AtsAdapter } from './types.ts';
import { workable } from './workable.ts';
import { zoho } from './zoho.ts';

export const adapters: Record<string, AtsAdapter> = {
  greenhouse, lever, personio, teamtailor, jazzhr, bamboohr, breezy, rippling,
  workable, recruitee, smartrecruiters, ashby, zoho, pinpoint, hirehive, gohire, homerun, haileyhr,
};

export async function fetchPostings(company: Company): Promise<NormalizedPosting[]> {
  const adapter = company.ats && adapters[company.ats.vendor];
  if (!company.ats || !adapter) throw new Error(`${company.id}: no adapter for ${company.ats?.vendor ?? 'missing ats'}`);
  // Paged feeds (adapter.next) are fetched page by page and concatenated; a failed page fails the company.
  const postings: NormalizedPosting[] = [];
  for (let url: string | null = adapter.feedUrl(company.ats.slug); url;) {
    const res = await fetchText(url);
    postings.push(...adapter.parse(res.text, res.contentType, company.ats.slug));
    url = adapter.next?.(res.text, res.contentType, url) ?? null;
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
