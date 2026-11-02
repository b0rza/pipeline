import { fetchText } from '../../core/http.ts';
import type { Company, NormalizedPosting } from '../../core/types.ts';
import { greenhouse } from './greenhouse.ts';
import { lever } from './lever.ts';
import { personio } from './personio.ts';
import type { AtsAdapter } from './types.ts';

export const adapters: Record<string, AtsAdapter> = { greenhouse, lever, personio };

export async function fetchPostings(company: Company): Promise<NormalizedPosting[]> {
  const adapter = company.ats && adapters[company.ats.vendor];
  if (!company.ats || !adapter) throw new Error(`${company.id}: no adapter for ${company.ats?.vendor ?? 'missing ats'}`);
  const res = await fetchText(adapter.feedUrl(company.ats.slug));
  return adapter.parse(res.text, res.contentType, company.ats.slug);
}
