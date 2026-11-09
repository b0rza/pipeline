import { htmlToText } from '../../core/html.ts';
import { toIso, type AtsAdapter } from './types.ts';

// Keyless Posting API. The list pages at most 100 per request (a larger limit is capped server-side) and has no
// body; /postings/{id} has the job ad sections and the public postingUrl, so each posting costs one more request.
// Verified live 2026-11-04 on smartrecruiters (2 postings) and BoschGroup (4993, paged). An unknown company is
// a 200 with totalFound 0, the same as a live company with no jobs.
//
// list   content[] -> id -> external_id, name -> title, location.fullLocation -> location, releasedDate ->
//                     posted_at; department, typeOfEmployment, location.remote, location.country,
//                     language -> raw. The recruiter (`creator`) is never kept.
// detail -> postingUrl -> url, jobAd.sections (company, job, qualifications, additional) -> body.

const api = 'https://api.smartrecruiters.com/v1/companies';

interface Page {
  offset?: number;
  limit?: number;
  totalFound?: number;
  content?: Item[];
}

interface Item {
  id: string;
  name: string;
  releasedDate?: string | null;
  location?: { city?: string | null; country?: string | null; remote?: boolean | null; fullLocation?: string | null } | null;
  department?: { label?: string | null } | null;
  typeOfEmployment?: { label?: string | null } | null;
  language?: { code?: string | null } | null;
}

type Section = { title?: string | null; text?: string | null } | null | undefined;

interface Detail {
  id: string;
  postingUrl?: string | null;
  jobAd?: { sections?: Record<'companyDescription' | 'jobDescription' | 'qualifications' | 'additionalInformation', Section> } | null;
}

function json<T>(text: string, contentType: string, what: string): T {
  if (!/json/i.test(contentType)) throw new Error(`smartrecruiters: ${what} is not JSON (content-type ${contentType || 'none'})`);
  return JSON.parse(text) as T;
}

export const smartrecruiters: AtsAdapter = {
  vendor: 'smartrecruiters',
  feedUrl: (slug) => `${api}/${encodeURIComponent(slug)}/postings?limit=100&offset=0`,
  parse(text, contentType, slug) {
    const page = json<Page>(text, contentType, 'list');
    if (!Array.isArray(page.content)) throw new Error('smartrecruiters: list has no content array');
    return page.content.map((i) => ({
      external_id: i.id,
      title: i.name.trim(),
      location: i.location?.fullLocation?.trim() || i.location?.city?.trim() || null,
      url: `https://jobs.smartrecruiters.com/${slug}/${i.id}`,
      body: '',
      posted_at: toIso(i.releasedDate),
      raw: {
        department: i.department?.label ?? null,
        employment_type: i.typeOfEmployment?.label ?? null,
        remote: i.location?.remote ?? null,
        country: i.location?.country ?? null,
        language: i.language?.code ?? null,
      },
    }));
  },
  next(text, contentType, url) {
    const { offset = 0, limit = 0, totalFound = 0 } = json<Page>(text, contentType, 'list');
    if (limit <= 0 || offset + limit >= totalFound) return null;
    const u = new URL(url);
    u.searchParams.set('offset', String(offset + limit));
    return u.href;
  },
  detail: {
    sets: ['url', 'body'],
    url: (posting, slug) => `${api}/${encodeURIComponent(slug)}/postings/${posting.external_id}`,
    parse(text, contentType, posting) {
      const job = json<Detail>(text, contentType, 'detail');
      if (job.id !== posting.external_id) throw new Error(`smartrecruiters: detail for ${posting.external_id} has id ${job.id}`);
      const s = job.jobAd?.sections;
      const parts = [s?.companyDescription, s?.jobDescription, s?.qualifications, s?.additionalInformation]
        .map((x) => (x?.text ? htmlToText(x.text) : '')).filter(Boolean);
      return { ...posting, url: job.postingUrl || posting.url, body: parts.join('\n\n') };
    },
  },
};
