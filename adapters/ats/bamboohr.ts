import { htmlToText } from '../../core/html.ts';
import { toIso, type AtsAdapter } from './types.ts';

// Keyless JSON behind the {slug}.bamboohr.com/careers page. /careers/list has every open job without a body;
// /careers/{id}/detail has the description and datePosted, so each posting costs one more request.
// Verified live 2026-11-02 on cql and sherocommerce (1 job each). robots.txt only disallows /jobs/embed*.
//
// list   result[] -> id -> external_id, jobOpeningName -> title, atsLocation (city, state, country), falling
//                     back to location (city, state) -> location; departmentLabel, employmentStatusLabel,
//                     locationType, isRemote (-> remote) -> raw.
// detail result.jobOpening -> description -> body, datePosted -> posted_at, jobOpeningShareUrl -> url;
//                     minimumExperience, compensation, location.addressCountry -> raw.

interface ListItem {
  id: string;
  jobOpeningName: string;
  departmentLabel?: string | null;
  employmentStatusLabel?: string | null;
  location?: { city?: string | null; state?: string | null } | null;
  atsLocation?: { city?: string | null; state?: string | null; province?: string | null; country?: string | null } | null;
  isRemote?: boolean | null;
  locationType?: string | null;
}

interface JobOpening {
  jobOpeningShareUrl?: string | null;
  description?: string | null;
  datePosted?: string | null;
  minimumExperience?: string | null;
  compensation?: string | null;
  location?: { addressCountry?: string | null } | null;
  atsLocation?: { country?: string | null } | null;
}

const place = (parts: (string | null | undefined)[]) => parts.map((p) => p?.trim()).filter(Boolean).join(', ') || null;

function json<T>(text: string, contentType: string, what: string): T {
  // A dead slug lands on bamboohr.com's HTML site, so check before trusting the parse.
  if (!/json/i.test(contentType)) throw new Error(`bamboohr: ${what} is not JSON (content-type ${contentType || 'none'})`);
  return JSON.parse(text) as T;
}

export const bamboohr: AtsAdapter = {
  vendor: 'bamboohr',
  feedUrl: (slug) => `https://${slug}.bamboohr.com/careers/list`,
  parse(text, contentType, slug) {
    const data = json<{ result?: ListItem[] }>(text, contentType, 'list');
    if (!Array.isArray(data.result)) throw new Error('bamboohr: list has no result array');
    return data.result.map((j) => {
      const a = j.atsLocation ?? {};
      return {
        external_id: String(j.id),
        title: j.jobOpeningName.trim(),
        location: place([a.city, a.state ?? a.province, a.country]) ?? place([j.location?.city, j.location?.state]),
        url: `https://${slug}.bamboohr.com/careers/${j.id}`,
        body: '',
        posted_at: null,
        raw: {
          department: j.departmentLabel ?? null,
          employment_status: j.employmentStatusLabel ?? null,
          location_type: j.locationType ?? null,
          remote: j.isRemote ?? null,
        },
      };
    });
  },
  detail: {
    sets: ['url', 'body', 'posted_at', 'raw'],
    url: (posting, slug) => `https://${slug}.bamboohr.com/careers/${posting.external_id}/detail`,
    parse(text, contentType, posting) {
      const job = json<{ result?: { jobOpening?: JobOpening } }>(text, contentType, 'detail').result?.jobOpening;
      if (!job) throw new Error(`bamboohr: detail for ${posting.external_id} has no jobOpening`);
      return {
        ...posting,
        url: job.jobOpeningShareUrl ?? posting.url,
        body: job.description ? htmlToText(job.description) : '',
        posted_at: toIso(job.datePosted),
        raw: {
          ...(posting.raw as object),
          minimum_experience: job.minimumExperience ?? null,
          compensation: job.compensation ?? null,
          country: job.location?.addressCountry ?? job.atsLocation?.country ?? null,
        },
      };
    },
  },
};
