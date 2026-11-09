import { htmlToText } from '../../core/html.ts';
import { toIso, type AtsAdapter, type FeedRequest } from './types.ts';

// Keyless JSON API behind every public Workday career site ({tenant}.{wdN}.myworkdayjobs.com/{site}). The list is a
// POST to /wday/cxs/{tenant}/{site}/jobs with {limit, offset}; a limit above 20 is a 400, so a board costs one
// request per 20 postings. Only the first page carries `total`, later pages say 0. The list has no body and only a
// relative "Posted 4 Days Ago"; GET /wday/cxs/{tenant}/{site}{externalPath} has the description, start date,
// every location, the country and the remote type, so each posting costs one more request.
// robots.txt on both tenants allows /{site}/, disallows /refreshFacet/ and says nothing about /wday/cxs/.
// Verified live 2026-11-09 on infobip.wd3/InfobipCareers (141 postings, 8 pages) and bigcommerce.wd12/Commerce (19).
//
// slug   {tenant}.{wdN}/{site}, e.g. infobip.wd3/InfobipCareers: the host's first two labels, then the site name
//        from the career site URL. Tenants on myworkdaysite.com are not covered.
// list   jobPostings[] -> externalPath -> external_id (until the detail), title, locationsText -> location
//        ("3 Locations" -> null), url built from the path.
// detail jobPostingInfo -> id -> external_id (the posting's own id: a requisition posted twice shares jobReqId),
//        externalUrl -> url, jobDescription -> body, startDate -> posted_at, location + additionalLocations ->
//        location; jobReqId, externalPath, remoteType (as workplace_type remote/hybrid/onsite and on_site),
//        jobRequisitionLocation.country.alpha2Code -> country, timeType, hiringOrganization.name -> raw.

const PAGE = 20;

interface Slug { host: string; tenant: string; site: string }

function slugParts(slug: string): Slug {
  const m = /^([a-z0-9-]+)\.(wd\d+)\/([A-Za-z0-9_-]+)$/i.exec(slug);
  if (!m) throw new Error(`workday: slug must be {tenant}.{wdN}/{site}, got ${slug}`);
  return { host: `${m[1]}.${m[2]}.myworkdayjobs.com`, tenant: m[1], site: m[3] };
}

const api = ({ host, tenant, site }: Slug) => `https://${host}/wday/cxs/${tenant}/${site}`;

interface Page {
  total?: number;
  jobPostings?: { title: string; externalPath: string; locationsText?: string | null }[];
}

interface Detail {
  jobPostingInfo?: {
    id: string;
    title: string;
    jobDescription?: string | null;
    location?: string | null;
    additionalLocations?: string[] | null;
    startDate?: string | null;
    timeType?: string | null;
    jobReqId?: string | null;
    remoteType?: string | null;
    externalUrl?: string | null;
    jobRequisitionLocation?: { country?: { alpha2Code?: string | null } | null } | null;
  };
  hiringOrganization?: { name?: string | null } | null;
}

function json<T>(text: string, contentType: string, what: string): T {
  if (!/json/i.test(contentType)) throw new Error(`workday: ${what} is not JSON (content-type ${contentType || 'none'})`);
  return JSON.parse(text) as T;
}

const body = (offset: number) => JSON.stringify({ appliedFacets: {}, limit: PAGE, offset, searchText: '' });

function request(slug: string, offset: number): FeedRequest {
  return {
    url: `${api(slugParts(slug))}/jobs`,
    method: 'POST',
    body: body(offset),
    headers: { 'content-type': 'application/json', accept: 'application/json' },
  };
}

function workplace(remoteType: string | null | undefined): string | null {
  if (!remoteType) return null;
  if (/remote/i.test(remoteType)) return 'remote';
  if (/hybrid/i.test(remoteType)) return 'hybrid';
  if (/on.?site|office/i.test(remoteType)) return 'onsite';
  return null;
}

export const workday: AtsAdapter = {
  vendor: 'workday',
  feedUrl: (slug) => `${api(slugParts(slug))}/jobs`,
  feedRequest: (slug) => request(slug, 0),
  parse(text, contentType, slug) {
    const page = json<Page>(text, contentType, 'list');
    if (!Array.isArray(page.jobPostings)) throw new Error('workday: list has no jobPostings array');
    const { host, site } = slugParts(slug);
    const seen = new Set<string>();
    return page.jobPostings.filter((j) => !seen.has(j.externalPath) && seen.add(j.externalPath)).map((j) => ({
      external_id: j.externalPath,
      title: j.title.trim(),
      location: j.locationsText && !/^\d+ Locations?$/i.test(j.locationsText) ? j.locationsText.trim() : null,
      url: `https://${host}/${site}${j.externalPath}`,
      body: '',
      posted_at: null,
      raw: { external_path: j.externalPath },
    }));
  },
  nextRequest(text, contentType, req) {
    const page = json<Page>(text, contentType, 'list');
    const { offset = 0, limit = PAGE } = JSON.parse(req.body ?? '{}') as { offset?: number; limit?: number };
    const got = page.jobPostings?.length ?? 0;
    const total = page.total ?? 0;
    if (got < limit || (total > 0 && offset + limit >= total)) return null;
    return { ...req, body: JSON.stringify({ ...JSON.parse(req.body!), offset: offset + limit }) };
  },
  detail: {
    url: (posting, slug) => `${api(slugParts(slug))}${(posting.raw as { external_path: string }).external_path}`,
    parse(text, contentType, posting) {
      const d = json<Detail>(text, contentType, 'detail');
      const job = d.jobPostingInfo;
      const path = (posting.raw as { external_path: string }).external_path;
      if (!job?.id) throw new Error(`workday: detail for ${path} has no jobPostingInfo`);
      if (job.externalUrl && !job.externalUrl.endsWith(path)) throw new Error(`workday: detail for ${path} is ${job.externalUrl}`);
      const locations = [job.location, ...(job.additionalLocations ?? [])].map((l) => l?.trim()).filter(Boolean);
      const mode = workplace(job.remoteType);
      // Some tenants double-escape the leading line feeds ("&amp;#xa;"), which would survive one unescape.
      const html = (job.jobDescription ?? '').replace(/&amp;#x?[0-9a-f]+;/gi, ' ');
      return {
        ...posting,
        external_id: job.id,
        title: job.title.trim(),
        url: job.externalUrl || posting.url,
        location: locations.length ? locations.join(', ') : posting.location,
        body: htmlToText(html),
        posted_at: toIso(job.startDate),
        raw: {
          external_path: path,
          req_id: job.jobReqId ?? null,
          remote_type: job.remoteType ?? null,
          workplace_type: mode,
          on_site: mode === 'onsite' ? true : null,
          country: job.jobRequisitionLocation?.country?.alpha2Code ?? null,
          time_type: job.timeType ?? null,
          hiring_organization: d.hiringOrganization?.name ?? null,
        },
      };
    },
  },
};
