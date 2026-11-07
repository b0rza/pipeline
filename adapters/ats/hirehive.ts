import { htmlToText } from '../../core/html.ts';
import { toIso, type AtsAdapter } from './types.ts';

// Keyless JSON at {slug}.hirehive.com/api/v1/jobs: every published job with its full description HTML.
// Verified live 2026-11-07 on studioforty9 (1 job), hirehive (HireHive's own board, 1) and focus-ireland (23).
// A wrong slug is a 404. robots.txt allows everything.
// The response has `nextPage`; it was null on every board seen, including 23 jobs on one page, and `?page=2`
// returned the first page again. So next() follows nextPage only when it is a URL, and throws on any other
// non-null value rather than guess the paging scheme and drop jobs silently.
//
// job -> id -> external_id, title, hostedUrl -> url, location + stateCode + country.name -> location,
//        description.html -> body, publishedDate (Unix seconds) -> posted_at; category, type.name,
//        experience.name, salary, createdDate -> raw.

interface Job {
  id: number | string;
  title: string;
  location?: string | null;
  stateCode?: string | null;
  country?: { name?: string | null; code?: string | null } | null;
  salary?: unknown;
  description?: { html?: string | null } | null;
  category?: string | null;
  type?: { name?: string | null } | null;
  experience?: { type?: string | null; name?: string | null } | null;
  publishedDate?: number | null;
  createdDate?: number | null;
  hostedUrl: string;
}

interface Page { jobs?: Job[]; publishedJobsCount?: number; nextPage?: unknown }

const seconds = (s: number | null | undefined) => (typeof s === 'number' ? toIso(s * 1000) : null);

function page(text: string, contentType: string): Page {
  if (!/json/i.test(contentType)) throw new Error(`hirehive: not a JSON feed (content-type ${contentType || 'none'})`);
  const p = JSON.parse(text) as Page;
  if (!Array.isArray(p.jobs)) throw new Error('hirehive: response has no jobs array');
  return p;
}

export const hirehive: AtsAdapter = {
  vendor: 'hirehive',
  feedUrl: (slug) => `https://${slug.toLowerCase()}.hirehive.com/api/v1/jobs`,
  parse(text, contentType) {
    return page(text, contentType).jobs!.map((j) => ({
      external_id: String(j.id),
      title: j.title.trim(),
      location: [j.location, j.stateCode, j.country?.name].map((s) => s?.trim()).filter(Boolean).join(', ') || null,
      url: j.hostedUrl,
      body: j.description?.html ? htmlToText(j.description.html) : '',
      posted_at: seconds(j.publishedDate),
      raw: {
        category: j.category || null,
        type: j.type?.name ?? null,
        experience: j.experience?.type === 'NA' ? null : j.experience?.name ?? null,
        salary: j.salary ?? null,
        created_at: seconds(j.createdDate),
      },
    }));
  },
  next(text, contentType, url) {
    const { nextPage } = page(text, contentType);
    if (nextPage === null || nextPage === undefined || nextPage === '') return null;
    if (typeof nextPage === 'string') return new URL(nextPage, url).href;
    throw new Error(`hirehive: unrecognised nextPage ${JSON.stringify(nextPage)} on ${url}`);
  },
};
