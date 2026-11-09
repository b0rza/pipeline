import { toIso, type AtsAdapter } from './types.ts';

// Remote's own ATS ("Remote ATS", apply.remote.com), the board behind remote.com/openings. The single-page app reads
// two keyless JSON endpoints, found in its api bundle: GET /api/public/jobs lists every open job without the advert,
// GET /api/public/jobs/{public_id} has the advert as rich-text documents, so each job costs one more request.
// apply.remote.com serves no robots.txt (the path returns the app shell); remote.com's robots.txt does not cover it.
// Verified live 2026-11-09 on apply.remote.com (61 jobs, all workplace remote; locations are regions like
// "EMEA, NORAM"). Single company: slug is the host.
//
// list   jobs[] (status open) -> public_id -> external_id, title, location, /jobs/{public_id} -> url, opened_at ->
//        posted_at; workplace -> workplace_type, employment_type, department, pay.range_text, tags -> raw.
// detail job.advert_sections[].doc (heading, paragraph, bulleted, numbered blocks of text runs) -> body.

interface Job {
  public_id: string;
  status?: string | null;
  title: string;
  location?: string | null;
  opened_at?: string | null;
  workplace?: string | null;
  employment_type?: string | null;
  department?: string | null;
  tags?: string[] | null;
  pay?: { range_text?: string | null } | null;
  advert_sections?: { heading?: string | null; doc?: Node | null }[] | null;
}

interface Node { type?: string; text?: string; content?: Node[] }

function json<T>(text: string, contentType: string, what: string): T {
  if (!/json/i.test(contentType)) throw new Error(`remote-ats: ${what} is not JSON (content-type ${contentType || 'none'})`);
  return JSON.parse(text) as T;
}

const inline = (n: Node): string => n.text ?? (n.content ?? []).map(inline).join('');

// One line per block; list items get "- ", headings a blank line before them.
export function docToText(doc: Node): string {
  return (doc.content ?? []).map((b) => {
    const t = inline(b).replace(/\s+/g, ' ').trim();
    if (!t) return '';
    if (b.type === 'bulleted' || b.type === 'numbered') return `- ${t}`;
    return b.type === 'heading' ? `\n${t}` : t;
  }).filter(Boolean).join('\n').trim();
}

export const remoteAts: AtsAdapter = {
  vendor: 'remote-ats',
  feedUrl: (slug) => `https://${slug}/api/public/jobs`,
  parse(text, contentType, slug) {
    const { jobs } = json<{ jobs?: Job[] }>(text, contentType, 'list');
    if (!Array.isArray(jobs)) throw new Error('remote-ats: list has no jobs array');
    return jobs.filter((j) => (j.status ?? 'open') === 'open').map((j) => ({
      external_id: j.public_id,
      title: j.title.trim(),
      location: j.location?.trim() || null,
      url: `https://${slug}/jobs/${j.public_id}`,
      body: '',
      posted_at: toIso(j.opened_at),
      raw: {
        workplace_type: j.workplace ?? null,
        employment_type: j.employment_type ?? null,
        department: j.department ?? null,
        pay: j.pay?.range_text ?? null,
        tags: j.tags ?? [],
      },
    }));
  },
  detail: {
    sets: ['body'],
    url: (posting, slug) => `https://${slug}/api/public/jobs/${posting.external_id}`,
    parse(text, contentType, posting) {
      const { job } = json<{ job?: Job }>(text, contentType, 'detail');
      if (job?.public_id !== posting.external_id) throw new Error(`remote-ats: detail for ${posting.external_id} has id ${job?.public_id}`);
      const body = (job.advert_sections ?? []).map((s) => (s.doc ? docToText(s.doc) : '')).filter(Boolean).join('\n\n');
      return { ...posting, body };
    },
  },
};
