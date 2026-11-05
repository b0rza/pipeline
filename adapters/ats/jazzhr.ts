import { htmlToText, unescapeHtml } from '../../core/html.ts';
import { toIso, type AtsAdapter } from './types.ts';

// JazzHR has no per-board feed: /apply/jobs/feed redirects to notfound.html, and the robots.txt sitemaps are
// one global feed across all customers. So the list is the /apply HTML page (every open job, no paging), and
// each job page carries a schema.org JobPosting in ld+json with the full description and datePosted.
// Verified live 2026-11-02 on concordusa (19 jobs) and anattadesigninc (2). robots.txt only disallows /cb.
// An inactive board serves "JazzHR - Inactive Career Page" (avatria) or redirects to info.jazzhr.com
// (redvanworkshop); neither has a job list block, so parse throws.
// Some boards still use the older "resumator" template (div.resumator-home-joblist, div.resumator-job items);
// verified live 2026-11-05 on plumtreegroup (9 jobs). Its job pages mostly carry the same JobPosting ld+json.
//
// List item  -> posting: href /apply/{id}/{title-slug} -> external_id = id, url; link text -> title;
//              fa-map-marker (resumator: "Location:" span) -> location; fa-sitemap ("Department:") -> raw.department.
// JobPosting -> description -> body, datePosted -> posted_at, employmentType, jobLocationType,
//              applicantLocationRequirements, validThrough, experienceRequirements, uniqueJobCode -> raw.
//              Open-application pages have no JobPosting: body from div#job-description, posted_at null.
//              Resumator job pages without JobPosting: body from div#resumator-job-description, posted_at null.

interface JobPosting {
  '@type'?: string;
  description?: string | null;
  datePosted?: string | null;
  validThrough?: string | null;
  employmentType?: string | null;
  experienceRequirements?: string | null;
  uniqueJobCode?: string | null;
  jobLocationType?: string | null;
  applicantLocationRequirements?: { name?: string } | { name?: string }[] | null;
}

const text = (html: string | undefined) => (html === undefined ? null : unescapeHtml(html).trim() || null);

// Current template first, so a page that is on it parses exactly as before.
const TEMPLATES = [
  {
    list: /class=['"][^'"]*\bjobs-list\b/,
    item: /<li class="list-group-item">([\s\S]*?)<\/ul>\s*<\/li>/g,
    location: /fa-map-marker['"]><\/i>([^<]*)</,
    department: /fa-sitemap['"]><\/i>([^<]*)</,
  },
  {
    list: /class=['"][^'"]*\bresumator-home-joblist\b/,
    item: /<div id="resumator-job-[^"]*" class="resumator-job\b[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g,
    location: /Location:<\/span>([^<]*)/,
    department: /Department:<\/span>([^<]*)/,
  },
];

export const jazzhr: AtsAdapter = {
  vendor: 'jazzhr',
  feedUrl: (slug) => `https://${slug.toLowerCase()}.applytojob.com/apply`,
  parse(html, contentType) {
    const t = /html/i.test(contentType) ? TEMPLATES.find((tpl) => tpl.list.test(html)) : undefined;
    if (!t) throw new Error('jazzhr: no job list on the board page (inactive or missing board)');
    return [...html.matchAll(t.item)].map(([, item]) => {
      const link = item.match(/<a href="(https:\/\/[^"]+\/apply\/([A-Za-z0-9]+)\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/);
      if (!link) throw new Error('jazzhr: list item without a job link');
      return {
        external_id: link[2],
        title: text(link[3]) ?? link[2],
        location: text(item.match(t.location)?.[1]),
        url: link[1],
        body: '',
        posted_at: null,
        raw: { department: text(item.match(t.department)?.[1]) },
      };
    });
  },
  detail: {
    url: (posting) => posting.url,
    parse(html, _contentType, posting) {
      const scripts = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
      // A malformed block elsewhere on the page shouldn't fail the posting, so skip what doesn't parse.
      const blocks = [...scripts].map(([, json]) => { try { return JSON.parse(json) as JobPosting; } catch { return null; } });
      const jp = blocks.find((j) => j?.['@type'] === 'JobPosting');
      // Open-application pages (Candidate Pool, Talent Network) have no JobPosting; their text is only in the page.
      // So do some resumator-template job pages (plumtreegroup Iec1yyOgvP), in div#resumator-job-description.
      if (!jp) {
        const page = html.match(/id="job-description">([\s\S]*?)<\/div>\s*<div class="resumator-mobile-apply-wrapper/)
          ?? html.match(/id="resumator-job-description"[^>]*>([\s\S]*?)<\/div>\s*<div id="resumator-job-button-email"/);
        if (!page) throw new Error(`jazzhr: no JobPosting ld+json or description on ${posting.url}`);
        return { ...posting, body: htmlToText(page[1]) };
      }
      const requirements = jp.applicantLocationRequirements;
      return {
        ...posting,
        body: jp.description ? htmlToText(jp.description) : '',
        posted_at: toIso(jp.datePosted),
        raw: {
          ...(posting.raw as object),
          employment_type: jp.employmentType ?? null,
          remote: jp.jobLocationType === 'TELECOMMUTE',
          applicant_countries: (Array.isArray(requirements) ? requirements : requirements ? [requirements] : [])
            .map((r) => r.name).filter(Boolean),
          experience: jp.experienceRequirements ?? null,
          valid_through: jp.validThrough ?? null,
          job_code: jp.uniqueJobCode ?? null,
        },
      };
    },
  },
};
