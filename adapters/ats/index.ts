import { fetchText } from '../../core/http.ts';
import type { Company, NormalizedPosting } from '../../core/types.ts';
import { bamboohr } from './bamboohr.ts';
import { breezy } from './breezy.ts';
import { greenhouse } from './greenhouse.ts';
import { jazzhr } from './jazzhr.ts';
import { lever } from './lever.ts';
import { personio } from './personio.ts';
import { rippling } from './rippling.ts';
import { teamtailor } from './teamtailor.ts';
import type { AtsAdapter } from './types.ts';

export const adapters: Record<string, AtsAdapter> = {
  greenhouse, lever, personio, teamtailor, jazzhr, bamboohr, breezy, rippling,
};

export async function fetchPostings(company: Company): Promise<NormalizedPosting[]> {
  const adapter = company.ats && adapters[company.ats.vendor];
  if (!company.ats || !adapter) throw new Error(`${company.id}: no adapter for ${company.ats?.vendor ?? 'missing ats'}`);
  const res = await fetchText(adapter.feedUrl(company.ats.slug));
  const postings = adapter.parse(res.text, res.contentType, company.ats.slug);
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
