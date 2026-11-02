import { htmlToText } from '../../core/html.ts';
import { toIso, type AtsAdapter } from './types.ts';

interface Posting {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  description?: string;
  additional?: string;
  lists?: { text: string; content: string }[];
  categories?: { location?: string; commitment?: string; department?: string; team?: string; allLocations?: string[] };
  workplaceType?: string;
  country?: string;
}

export const lever: AtsAdapter = {
  vendor: 'lever',
  feedUrl: (slug) => `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
  parse(text) {
    const data = JSON.parse(text) as Posting[];
    if (!Array.isArray(data)) throw new Error('lever: response is not a postings array');
    return data.map((p) => {
      const html = [
        p.description ?? '',
        ...(p.lists ?? []).map((l) => `<h3>${l.text}</h3>${l.content}`),
        p.additional ?? '',
      ].join('\n');
      const c = p.categories ?? {};
      return {
        external_id: p.id,
        title: p.text.trim(),
        location: c.location?.trim() || null,
        url: p.hostedUrl,
        body: htmlToText(html),
        posted_at: toIso(p.createdAt),
        raw: {
          commitment: c.commitment ?? null,
          department: c.department ?? null,
          team: c.team ?? null,
          all_locations: c.allLocations ?? [],
          workplace_type: p.workplaceType ?? null,
          country: p.country ?? null,
        },
      };
    });
  },
};
