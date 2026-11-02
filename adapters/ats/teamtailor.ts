import { htmlToText } from '../../core/html.ts';
import { toIso, type AtsAdapter } from './types.ts';

// The keyless board feed is a JSON Feed (jsonfeed.org) with a schema.org JobPosting per item. It lists every
// open job with its full body, unlike the HTML /jobs list, which pages at 20. Verified live 2026-11-02.

interface Address { addressLocality?: string | null; addressRegion?: string | null; addressCountry?: string | null }

interface Item {
  id: string;
  title: string;
  url: string;
  date_published?: string | null;
  content_html?: string | null;
  _jobposting?: {
    identifier?: { value?: string | number } | null;
    employmentType?: string | null;
    jobLocationType?: string | null;
    jobLocation?: { address?: Address | null }[] | null;
    applicantLocationRequirements?: { name?: string } | { name?: string }[] | null;
    hiringOrganization?: { name?: string } | null;
  };
}

// A slug is either a {slug}.teamtailor.com subdomain or the host of a custom-domain board (career.novicell.co.uk).
const host = (slug: string) => (slug.includes('.') ? slug : `${slug}.teamtailor.com`);

export const teamtailor: AtsAdapter = {
  vendor: 'teamtailor',
  feedUrl: (slug) => `https://${host(slug)}/jobs.json`,
  parse(text, contentType) {
    if (!/json/i.test(contentType)) throw new Error(`teamtailor: not a JSON feed (content-type ${contentType || 'none'})`);
    const feed = JSON.parse(text) as { version?: string; items?: Item[] };
    if (!feed.version?.includes('jsonfeed.org') || !Array.isArray(feed.items)) {
      throw new Error('teamtailor: response is not a JSON Feed with items');
    }
    return feed.items.map((i) => {
      const jp = i._jobposting ?? {};
      const places = (jp.jobLocation ?? []).map((l) => l.address?.addressLocality?.trim() || null);
      const locations = [...new Set(places.filter((p): p is string => p !== null))];
      const requirements = jp.applicantLocationRequirements;
      return {
        external_id: i.id,
        title: i.title.trim(),
        location: locations.length ? locations.join(', ') : null,
        url: i.url,
        body: i.content_html ? htmlToText(i.content_html) : '',
        posted_at: toIso(i.date_published),
        raw: {
          job_id: jp.identifier?.value === undefined ? null : String(jp.identifier.value),
          employment_type: jp.employmentType ?? null,
          remote: jp.jobLocationType === 'TELECOMMUTE',
          applicant_countries: (Array.isArray(requirements) ? requirements : requirements ? [requirements] : [])
            .map((r) => r.name).filter(Boolean),
          countries: [...new Set((jp.jobLocation ?? []).map((l) => l.address?.addressCountry).filter(Boolean))],
          hiring_organization: jp.hiringOrganization?.name ?? null,
        },
      };
    });
  },
};
