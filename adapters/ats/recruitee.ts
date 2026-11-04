import { htmlToText } from '../../core/html.ts';
import { toIso, type AtsAdapter } from './types.ts';

// Keyless JSON at {slug}.recruitee.com/api/offers/, also served on a custom-domain board's own host. Every
// published offer with its description and requirements HTML; no paging. Verified live 2026-11-04 on youwe
// (8 offers, same list as careers.youweagency.com) and youweconnectit (live, empty: {"offers":[]}).
// A dead subdomain is a 404 JSON {"error":"Not Found"}.
//
// offer -> id -> external_id, title, location (or city, country), careers_url -> url,
//          description + requirements -> body, published_at -> posted_at; employment_type_code, remote,
//          hybrid, on_site, department, tags -> raw.

interface Offer {
  id: number;
  title: string;
  careers_url: string;
  location?: string | null;
  city?: string | null;
  country?: string | null;
  remote?: boolean | null;
  hybrid?: boolean | null;
  on_site?: boolean | null;
  department?: string | null;
  tags?: string[] | null;
  employment_type_code?: string | null;
  published_at?: string | null;
  description?: string | null;
  requirements?: string | null;
}

// A slug is either a {slug}.recruitee.com subdomain or the host of a custom-domain board (careers.youweagency.com).
const host = (slug: string) => (slug.includes('.') ? slug : `${slug}.recruitee.com`);

// Recruitee dates look like "2026-10-19 12:06:39 UTC", which isn't ISO 8601; rewrite before parsing.
const date = (v: string | null | undefined) =>
  toIso(v?.replace(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) UTC$/, '$1T$2Z'));

export const recruitee: AtsAdapter = {
  vendor: 'recruitee',
  feedUrl: (slug) => `https://${host(slug)}/api/offers/`,
  parse(text, contentType) {
    if (!/json/i.test(contentType)) throw new Error(`recruitee: not a JSON feed (content-type ${contentType || 'none'})`);
    const data = JSON.parse(text) as { offers?: Offer[] };
    if (!Array.isArray(data.offers)) throw new Error('recruitee: response has no offers array');
    return data.offers.map((o) => {
      const parts = [o.description, o.requirements].filter(Boolean).map((h) => htmlToText(h!)).filter(Boolean);
      const place = o.location?.trim() || [o.city, o.country].map((p) => p?.trim()).filter(Boolean).join(', ');
      return {
        external_id: String(o.id),
        title: o.title.trim(),
        location: place || null,
        url: o.careers_url,
        body: parts.join('\n\n'),
        posted_at: date(o.published_at),
        raw: {
          employment_type_code: o.employment_type_code ?? null,
          remote: o.remote ?? null,
          hybrid: o.hybrid ?? null,
          on_site: o.on_site ?? null,
          department: o.department ?? null,
          tags: o.tags ?? [],
        },
      };
    });
  },
};
