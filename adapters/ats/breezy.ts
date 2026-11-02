import { htmlToText } from '../../core/html.ts';
import { toIso, type AtsAdapter } from './types.ts';

// Keyless JSON list at {slug}.breezy.hr/json. Plain /json has no body; ?verbose=true adds `description` (HTML)
// to every position, so one request covers the board. Verified live 2026-11-02 on thirdandgrove (3 jobs),
// object-edge-inc (empty board, []) and breezy (3). robots.txt only disallows asset paths.
//
// position -> id -> external_id, name -> title, locations[].name (or location.name) -> location, url,
//             description -> body, published_date -> posted_at; friendly_id, type, department, salary,
//             is_remote, country ids -> raw.

interface Location { name?: string | null; is_remote?: boolean; country?: { id?: string } | null }

interface Position {
  id: string;
  friendly_id?: string;
  name: string;
  url: string;
  published_date?: string | null;
  type?: { name?: string } | null;
  location?: Location | null;
  locations?: Location[] | null;
  department?: string | null;
  salary?: string | null;
  description?: string | null;
}

export const breezy: AtsAdapter = {
  vendor: 'breezy',
  feedUrl: (slug) => `https://${slug}.breezy.hr/json?verbose=true`,
  parse(text, contentType) {
    if (!/json/i.test(contentType)) throw new Error(`breezy: not a JSON feed (content-type ${contentType || 'none'})`);
    const data = JSON.parse(text) as Position[];
    if (!Array.isArray(data)) throw new Error('breezy: response is not a positions array');
    return data.map((p) => {
      const locations = p.locations?.length ? p.locations : p.location ? [p.location] : [];
      const names = [...new Set(locations.map((l) => l.name?.trim()).filter(Boolean))];
      return {
        external_id: p.id,
        title: p.name.trim(),
        location: names.length ? names.join(', ') : null,
        url: p.url,
        body: p.description ? htmlToText(p.description) : '',
        posted_at: toIso(p.published_date),
        raw: {
          friendly_id: p.friendly_id ?? null,
          type: p.type?.name ?? null,
          department: p.department || null,
          salary: p.salary || null,
          remote: locations.some((l) => l.is_remote),
          countries: [...new Set(locations.map((l) => l.country?.id).filter(Boolean))],
        },
      };
    });
  },
};
