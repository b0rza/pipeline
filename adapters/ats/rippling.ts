import { htmlToText } from '../../core/html.ts';
import { toIso, type AtsAdapter } from './types.ts';

// Keyless JSON API behind ats.rippling.com/{slug}/jobs. The list has one row per (job, work location) and no
// body; /jobs/{uuid} has the description (company and role HTML), createdOn, all work locations and pay
// ranges, so each job costs one more request. The HTML board pages at 20 and the API doesn't.
// Verified live 2026-11-02 on verndale-llc (6 jobs, 12 rows), domaine-careers and aries-solutions.
//
// list   [] -> uuid -> external_id (rows deduped), name -> title, workLocation.label -> location, url,
//               department.label -> raw.
// detail -> description.role + description.company -> body, createdOn -> posted_at, workLocations -> location;
//               department, employmentType.id, payRangeDetails -> raw.

const api = 'https://api.rippling.com/platform/api/ats/v1/board';

interface ListRow {
  uuid: string;
  name: string;
  url: string;
  department?: { label?: string | null } | null;
  workLocation?: { label?: string | null } | null;
}

interface Job {
  uuid: string;
  description?: { company?: string | null; role?: string | null } | null;
  workLocations?: string[] | null;
  department?: { name?: string | null; base_department?: string | null } | null;
  employmentType?: { id?: string | null } | null;
  createdOn?: string | null;
  payRangeDetails?: unknown[] | null;
}

function json<T>(text: string, contentType: string, what: string): T {
  if (!/json/i.test(contentType)) throw new Error(`rippling: ${what} is not JSON (content-type ${contentType || 'none'})`);
  return JSON.parse(text) as T;
}

export const rippling: AtsAdapter = {
  vendor: 'rippling',
  feedUrl: (slug) => `${api}/${encodeURIComponent(slug)}/jobs`,
  parse(text, contentType) {
    const rows = json<ListRow[]>(text, contentType, 'list');
    if (!Array.isArray(rows)) throw new Error('rippling: list is not an array');
    const jobs = new Map<string, { row: ListRow; locations: string[] }>();
    for (const r of rows) {
      const job = jobs.get(r.uuid) ?? { row: r, locations: [] };
      const label = r.workLocation?.label?.trim();
      if (label && !job.locations.includes(label)) job.locations.push(label);
      jobs.set(r.uuid, job);
    }
    return [...jobs.values()].map(({ row, locations }) => ({
      external_id: row.uuid,
      title: row.name.trim(),
      location: locations.length ? locations.join(', ') : null,
      url: row.url,
      body: '',
      posted_at: null,
      raw: { department: row.department?.label ?? null },
    }));
  },
  detail: {
    sets: ['location', 'body', 'posted_at', 'raw'],
    url: (posting, slug) => `${api}/${encodeURIComponent(slug)}/jobs/${posting.external_id}`,
    parse(text, contentType, posting) {
      const job = json<Job>(text, contentType, 'detail');
      if (job.uuid !== posting.external_id) throw new Error(`rippling: detail for ${posting.external_id} has uuid ${job.uuid}`);
      const html = [job.description?.role, job.description?.company].filter(Boolean).join('\n');
      const locations = (job.workLocations ?? []).map((l) => l.trim()).filter(Boolean);
      return {
        ...posting,
        location: locations.length ? locations.join(', ') : posting.location,
        body: htmlToText(html),
        posted_at: toIso(job.createdOn),
        raw: {
          ...(posting.raw as object),
          department: job.department?.name ?? (posting.raw as { department: string | null }).department,
          base_department: job.department?.base_department ?? null,
          employment_type: job.employmentType?.id ?? null,
          pay_ranges: job.payRangeDetails ?? [],
        },
      };
    },
  },
};
