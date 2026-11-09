import { htmlToText } from '../../core/html.ts';
import { toIso, type AtsAdapter } from './types.ts';

// Deel's hosted job boards (jobs.deel.com/{org}). robots.txt disallows /api/ and /*/job-details/*/application, so
// the source is the schema.org data in the server-rendered pages: the board page has an ItemList ld+json with every
// posting's URL (83 for klarna, no paging), and each /{org}/job-details/{id}/overview page has a JobPosting ld+json
// with title, description (plain text, no line breaks), datePosted, employmentType and locality. Each posting costs
// one more request. The work arrangement (REMOTE, HYBRID, ON_SITE) and the location's country code are only in the
// page's Next.js flight data; they are read from it only when the page names exactly one job's worth of them.
// Verified live 2026-11-09 on klarna (83 postings: 67 ON_SITE, 15 HYBRID, 1 REMOTE). jobs.deel.com/job-boards/{org}
// redirects to /{org}.
//
// slug   the org path, e.g. klarna.
// list   ItemList.itemListElement[].url -> url, its job-details id -> external_id. No title until the detail.
// detail JobPosting -> title, description -> body, datePosted -> posted_at, jobLocation addresses -> location,
//        employmentType, identifier.value check; flight data workArrangementEnum -> workplace_type (remote, hybrid,
//        onsite) and on_site, jobLocations country codes -> countries; jobLocationType TELECOMMUTE -> remote.

interface JobPosting {
  '@type'?: string;
  title?: string;
  description?: string;
  datePosted?: string;
  employmentType?: string | string[];
  jobLocationType?: string;
  identifier?: { value?: string };
  url?: string;
  jobLocation?: Place | Place[];
}

interface Place {
  address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string | { name?: string } };
}

function ldJson(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of text.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    const v = JSON.parse(m[1]) as unknown;
    for (const item of Array.isArray(v) ? v : [v]) if (item && typeof item === 'object') out.push(item as Record<string, unknown>);
  }
  return out;
}

const ID = /\/job-details\/([0-9a-f-]{36})(?:\/|$)/i;

function html(text: string, contentType: string, what: string): string {
  if (!/html/i.test(contentType)) throw new Error(`deel: ${what} is not HTML (content-type ${contentType || 'none'})`);
  return text;
}

// Values of an escaped "key":"value" pair in the flight data (inside a JS string, so quotes are \").
const flight = (text: string, re: RegExp) => [...text.matchAll(re)].map((m) => m[1]);

const MODES: Record<string, string> = { REMOTE: 'remote', HYBRID: 'hybrid', ON_SITE: 'onsite' };

function place(p: Place): string | null {
  const a = p.address;
  const country = typeof a?.addressCountry === 'string' ? a.addressCountry : a?.addressCountry?.name;
  const parts = [a?.addressLocality, a?.addressRegion, country].map((s) => s?.trim()).filter(Boolean);
  return parts.length ? [...new Set(parts)].join(', ') : null;
}

export const deel: AtsAdapter = {
  vendor: 'deel',
  feedUrl: (slug) => `https://jobs.deel.com/${encodeURIComponent(slug)}`,
  parse(text, contentType) {
    const list = ldJson(html(text, contentType, 'board')).find((x) => x['@type'] === 'ItemList');
    if (!list) throw new Error('deel: board page has no ItemList');
    const items = (list.itemListElement ?? []) as { url?: string }[];
    return items.flatMap((i) => {
      const id = i.url ? ID.exec(new URL(i.url).pathname)?.[1] : undefined;
      return id ? [{ external_id: id, title: '', location: null, url: i.url!, body: '', posted_at: null, raw: {} }] : [];
    });
  },
  detail: {
    // The list has only the URL, so everything but the id comes from the job page (or, once stored, from the row).
    sets: ['title', 'url', 'location', 'body', 'posted_at', 'raw'],
    url: (posting) => posting.url,
    parse(text, contentType, posting) {
      const page = html(text, contentType, 'job page');
      const job = ldJson(page).find((x) => x['@type'] === 'JobPosting') as JobPosting | undefined;
      if (!job) throw new Error(`deel: job page for ${posting.external_id} has no JobPosting`);
      if (job.identifier?.value !== posting.external_id) {
        throw new Error(`deel: job page for ${posting.external_id} has id ${job.identifier?.value}`);
      }
      const places = (Array.isArray(job.jobLocation) ? job.jobLocation : job.jobLocation ? [job.jobLocation] : [])
        .map(place).filter((p): p is string => !!p);
      const modes = flight(page, /workArrangementEnum\\":\\"([A-Z_]+)\\"/g);
      const mode = modes.length === 1 ? (MODES[modes[0]] ?? null) : null;
      const oneJob = flight(page, /(jobLocations)\\":\[/g).length === 1;
      const countries = oneJob ? [...new Set(flight(page, /\\"country\\":\{\\"code\\":\\"([A-Z]{2})\\"/g))] : [];
      const types = Array.isArray(job.employmentType) ? job.employmentType : job.employmentType ? [job.employmentType] : [];
      return {
        ...posting,
        title: (job.title ?? '').trim(),
        url: job.url || posting.url,
        location: places.length ? places.join(', ') : null,
        body: htmlToText(job.description ?? ''),
        posted_at: toIso(job.datePosted),
        raw: {
          employment_type: types.length ? types.join(', ') : null,
          workplace_type: mode,
          on_site: mode === 'onsite' ? true : null,
          remote: job.jobLocationType === 'TELECOMMUTE' ? true : null,
          countries,
        },
      };
    },
  },
};
