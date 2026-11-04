import { toIso, type AtsAdapter } from './types.ts';

// Keyless public job board API. One request lists every job with its description (HTML and plain) and, with
// ?includeCompensation=true, the pay summary. Verified live 2026-11-04 on ashby (71 jobs) and linear (31).
// A wrong slug is a 404 text/plain.
//
// job -> id -> external_id, title, location, jobUrl -> url, descriptionPlain -> body, publishedAt -> posted_at;
//        department, team, employmentType, isRemote, workplaceType, secondaryLocations (names),
//        compensation.compensationTierSummary -> raw. Unlisted jobs (isListed false) are dropped.

interface Job {
  id: string;
  title: string;
  department?: string | null;
  team?: string | null;
  employmentType?: string | null;
  location?: string | null;
  secondaryLocations?: { location?: string | null }[] | null;
  isRemote?: boolean | null;
  workplaceType?: string | null;
  isListed?: boolean;
  publishedAt?: string | null;
  jobUrl: string;
  descriptionPlain?: string | null;
  compensation?: { compensationTierSummary?: string | null } | null;
}

export const ashby: AtsAdapter = {
  vendor: 'ashby',
  feedUrl: (slug) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
  parse(text, contentType) {
    if (!/json/i.test(contentType)) throw new Error(`ashby: not a JSON feed (content-type ${contentType || 'none'})`);
    const data = JSON.parse(text) as { jobs?: Job[] };
    if (!Array.isArray(data.jobs)) throw new Error('ashby: response has no jobs array');
    return data.jobs.filter((j) => j.isListed).map((j) => ({
      external_id: j.id,
      title: j.title.trim(),
      location: j.location?.trim() || null,
      url: j.jobUrl,
      body: j.descriptionPlain?.trim() ?? '',
      posted_at: toIso(j.publishedAt),
      raw: {
        department: j.department ?? null,
        team: j.team ?? null,
        employment_type: j.employmentType ?? null,
        remote: j.isRemote ?? null,
        workplace_type: j.workplaceType ?? null,
        secondary_locations: (j.secondaryLocations ?? []).map((l) => l.location).filter(Boolean),
        compensation: j.compensation?.compensationTierSummary ?? null,
      },
    }));
  },
};
