import { htmlToText, unescapeHtml } from '../../core/html.ts';
import { toIso, type AtsAdapter } from './types.ts';

interface Job {
  id: number;
  title: string;
  location?: { name?: string } | null;
  absolute_url: string;
  content?: string | null;
  first_published?: string | null;
  updated_at?: string | null;
  requisition_id?: string | null;
  departments?: { name: string }[];
  offices?: { name: string }[];
  metadata?: { name: string; value: unknown }[] | null;
}

export const greenhouse: AtsAdapter = {
  vendor: 'greenhouse',
  feedUrl: (slug) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
  parse(text) {
    const data = JSON.parse(text) as { jobs?: Job[] };
    if (!Array.isArray(data.jobs)) throw new Error('greenhouse: response has no jobs array');
    return data.jobs.map((j) => {
      // content arrives entity-escaped (&lt;h3&gt;), so unescape to HTML first
      const html = j.content ? unescapeHtml(j.content) : null;
      return {
        external_id: String(j.id),
        title: j.title.trim(),
        location: j.location?.name?.trim() || null,
        url: j.absolute_url,
        body: html ? htmlToText(html) : '',
        posted_at: toIso(j.first_published) ?? toIso(j.updated_at),
        raw: {
          requisition_id: j.requisition_id ?? null,
          departments: j.departments?.map((d) => d.name) ?? [],
          offices: j.offices?.map((o) => o.name) ?? [],
          metadata: Object.fromEntries((j.metadata ?? []).map((m) => [m.name, m.value])),
          updated_at: j.updated_at ?? null,
        },
      };
    });
  },
};
