import { htmlToText } from '../../core/html.ts';
import { loaderData } from './turbo-stream.ts';
import { toIso, type AtsAdapter } from './types.ts';

// Shopify's own careers site. Jobs live in Ashby, but on no public Ashby board (posting-api names shopify, Shopify,
// shopify-careers, shopifycareers, shopify.com all 404 on 2026-11-09), so the source is the React Router loader data
// inlined in the server-rendered pages (adapters/ats/turbo-stream.ts). /careers carries every open role (114 of
// "114 roles" on 2026-11-09) with title, locations and a one-line teaser; /careers/{slug}_{id} carries the Ashby job
// posting with its full description, so each role costs one more request. robots.txt disallows `*.data$` (the
// loader JSON route), /careers/search?* and /careers/portal/*; the two HTML pages used here are allowed.
// Verified live 2026-11-09 on www.shopify.com (114 roles, 46 in Engineering & Data). Single company: slug is the host.
//
// list   loaderData["($locale)/careers"].roles[] -> id -> external_id, title, locations -> location, href -> url;
//        discipline -> raw.
// detail loaderData["($locale)/careers/$posting"].jobPosting -> descriptionHtml -> body, publishedDate -> posted_at;
//        isRemote -> remote, workplaceType -> workplace_type, employmentType, departmentName, teamName,
//        compensation.compensationTierSummary -> raw.

interface Role {
  id: string;
  title: string;
  location?: string | null;
  locations?: string[] | null;
  discipline?: string | null;
  href: string;
}

interface Posting {
  id: string;
  title?: string | null;
  descriptionHtml?: string | null;
  descriptionPlain?: string | null;
  publishedDate?: string | null;
  isRemote?: boolean | null;
  workplaceType?: string | null;
  employmentType?: string | null;
  departmentName?: string | null;
  teamName?: string | null;
  compensation?: { compensationTierSummary?: string | null } | null;
}

function html(text: string, contentType: string, what: string): string {
  if (!/html/i.test(contentType)) throw new Error(`shopify-careers: ${what} is not HTML (content-type ${contentType || 'none'})`);
  return text;
}

export const shopifyCareers: AtsAdapter = {
  vendor: 'shopify-careers',
  feedUrl: (slug) => `https://${slug}/careers`,
  parse(text, contentType, slug) {
    const roles = loaderData(html(text, contentType, 'list'), '($locale)/careers').roles as Role[] | undefined;
    if (!Array.isArray(roles)) throw new Error('shopify-careers: careers loader data has no roles array');
    return roles.map((r) => {
      const locations = (r.locations ?? [r.location]).map((l) => l?.trim()).filter(Boolean);
      return {
        external_id: r.id,
        title: r.title.trim(),
        location: locations.length ? locations.join(', ') : null,
        url: new URL(r.href, `https://${slug}`).href,
        body: '',
        posted_at: null,
        raw: { discipline: r.discipline ?? null },
      };
    });
  },
  detail: {
    sets: ['body', 'posted_at', 'raw'],
    url: (posting) => posting.url,
    parse(text, contentType, posting) {
      const data = loaderData(html(text, contentType, 'detail'), '($locale)/careers/$posting');
      const job = data.jobPosting as Posting | undefined;
      if (job?.id !== posting.external_id) throw new Error(`shopify-careers: detail for ${posting.external_id} has id ${job?.id}`);
      return {
        ...posting,
        body: job.descriptionHtml ? htmlToText(job.descriptionHtml) : (job.descriptionPlain ?? '').trim(),
        posted_at: toIso(job.publishedDate),
        raw: {
          ...(posting.raw as object),
          remote: job.isRemote ?? null,
          workplace_type: job.workplaceType ?? null,
          employment_type: job.employmentType ?? null,
          department: job.departmentName ?? null,
          team: job.teamName ?? null,
          compensation: job.compensation?.compensationTierSummary ?? null,
        },
      };
    },
  },
};
