import { htmlToText } from '../../core/html.ts';
import { toIso, type AtsAdapter } from './types.ts';

// Keyless JSON at {slug}.pinpointhq.com/postings.json: every open posting with its full advert, no paging.
// The feed has no date; each posting page carries a schema.org JobPosting in ld+json with datePosted, so each
// posting costs one more request. Verified live 2026-11-07 on ctidigital (2 postings) and workwithus (Pinpoint's
// own board, 6). A wrong slug is a 404. robots.txt disallows only /mydata, /admin and /companies.
//
// list   data[] -> id -> external_id, title, url, location.name -> location; description and the three
//                  headed sections (key_responsibilities, skills_knowledge_expertise, benefits) -> body;
//                  employment_type_text, workplace_type, job.department.name, compensation (when visible),
//                  deadline_at -> raw.
// detail JobPosting.datePosted -> posted_at. A page without a JobPosting keeps posted_at null, since the body
//        is already complete from the feed.

interface Posting {
  id: string | number;
  title: string;
  url: string;
  description?: string | null;
  key_responsibilities?: string | null;
  key_responsibilities_header?: string | null;
  skills_knowledge_expertise?: string | null;
  skills_knowledge_expertise_header?: string | null;
  benefits?: string | null;
  benefits_header?: string | null;
  employment_type_text?: string | null;
  workplace_type?: string | null;
  compensation?: string | null;
  compensation_visible?: boolean | null;
  deadline_at?: string | null;
  job?: { department?: { name?: string | null } | null } | null;
  location?: { name?: string | null; city?: string | null } | null;
}

const SECTIONS = ['key_responsibilities', 'skills_knowledge_expertise', 'benefits'] as const;

function body(p: Posting): string {
  const parts = [p.description ? htmlToText(p.description) : ''];
  for (const s of SECTIONS) {
    const html = p[s];
    if (!html) continue;
    const header = p[`${s}_header`]?.trim();
    parts.push([header, htmlToText(html)].filter(Boolean).join('\n'));
  }
  return parts.filter(Boolean).join('\n\n');
}

export const pinpoint: AtsAdapter = {
  vendor: 'pinpoint',
  feedUrl: (slug) => `https://${slug.toLowerCase()}.pinpointhq.com/postings.json`,
  parse(text, contentType) {
    if (!/json/i.test(contentType)) throw new Error(`pinpoint: not a JSON feed (content-type ${contentType || 'none'})`);
    const data = (JSON.parse(text) as { data?: Posting[] }).data;
    if (!Array.isArray(data)) throw new Error('pinpoint: response has no data array');
    return data.map((p) => ({
      external_id: String(p.id),
      title: p.title.trim(),
      location: p.location?.name?.trim() || p.location?.city?.trim() || null,
      url: p.url,
      body: body(p),
      posted_at: null,
      raw: {
        employment_type: p.employment_type_text ?? null,
        workplace_type: p.workplace_type ?? null,
        department: p.job?.department?.name ?? null,
        compensation: p.compensation_visible ? p.compensation ?? null : null,
        deadline_at: p.deadline_at ?? null,
      },
    }));
  },
  detail: {
    url: (posting) => posting.url,
    parse(html, _contentType, posting) {
      const scripts = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
      const blocks = [...scripts].map(([, json]) => { try { return JSON.parse(json) as { '@type'?: string; datePosted?: string } | null; } catch { return null; } });
      const jp = blocks.find((b) => b?.['@type'] === 'JobPosting');
      return { ...posting, posted_at: toIso(jp?.datePosted) };
    },
  },
};
