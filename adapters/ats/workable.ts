import { htmlToText } from '../../core/html.ts';
import { toIso, type AtsAdapter } from './types.ts';

// Keyless widget JSON behind apply.workable.com/{slug}. ?details=true adds the full description HTML to every
// job, so one request covers the board. The widget repeats a job once per location under the same shortcode.
// Verified live 2026-11-04 on tryzensglobal (10 rows, 8 jobs). A wrong slug is a 404 text/plain "Not Found".
//
// job -> shortcode -> external_id (rows deduped), title, city (or country) per row -> location,
//        description -> body, published_on -> posted_at; employment_type, telecommuting, department,
//        created_at -> raw.

interface Job {
  shortcode: string;
  title: string;
  employment_type?: string | null;
  telecommuting?: boolean | null;
  department?: string | null;
  published_on?: string | null;
  created_at?: string | null;
  city?: string | null;
  country?: string | null;
  description?: string | null;
}

export const workable: AtsAdapter = {
  vendor: 'workable',
  feedUrl: (slug) => `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}?details=true`,
  parse(text, contentType, slug) {
    if (!/json/i.test(contentType)) throw new Error(`workable: not a JSON feed (content-type ${contentType || 'none'})`);
    const data = JSON.parse(text) as { jobs?: Job[] };
    if (!Array.isArray(data.jobs)) throw new Error('workable: response has no jobs array');
    const jobs = new Map<string, { job: Job; locations: string[] }>();
    for (const j of data.jobs) {
      const entry = jobs.get(j.shortcode) ?? { job: j, locations: [] };
      const place = j.city?.trim() || j.country?.trim();
      if (place && !entry.locations.includes(place)) entry.locations.push(place);
      jobs.set(j.shortcode, entry);
    }
    return [...jobs.values()].map(({ job, locations }) => ({
      external_id: job.shortcode,
      title: job.title.trim(),
      location: locations.length ? locations.join(', ') : null,
      url: `https://apply.workable.com/${slug}/j/${job.shortcode}/`,
      body: job.description ? htmlToText(job.description) : '',
      posted_at: toIso(job.published_on),
      raw: {
        employment_type: job.employment_type || null,
        telecommuting: job.telecommuting ?? null,
        department: job.department || null,
        created_at: job.created_at ?? null,
      },
    }));
  },
};
