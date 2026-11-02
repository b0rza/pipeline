import { htmlToText, unescapeHtml } from '../../core/html.ts';
import { toIso, type AtsAdapter } from './types.ts';

// JazzHR has no per-board feed: /apply/jobs/feed redirects to notfound.html, and the robots.txt sitemaps are
// one global feed across all customers. So the list is the /apply HTML page (every open job, no paging), and
// each job page carries a schema.org JobPosting in ld+json with the full description and datePosted.
// Verified live 2026-11-02 on concordusa (19 jobs) and anattadesigninc (2). robots.txt only disallows /cb.
// An inactive board serves "JazzHR - Inactive Career Page" (avatria) or redirects to info.jazzhr.com
// (redvanworkshop); neither has the jobs-list block, so parse throws.
//
// List item  -> posting: href /apply/{id}/{title-slug} -> external_id = id, url; link text -> title;
//              fa-map-marker -> location; fa-sitemap -> raw.department.
// JobPosting -> description -> body, datePosted -> posted_at, employmentType, jobLocationType,
//              applicantLocationRequirements, validThrough, experienceRequirements, uniqueJobCode -> raw.
//              Open-application pages have no JobPosting: body from div#job-description, posted_at null.

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

export const jazzhr: AtsAdapter = {
  vendor: 'jazzhr',
  feedUrl: (slug) => `https://${slug.toLowerCase()}.applytojob.com/apply`,
  parse(html, contentType) {
    if (!/html/i.test(contentType) || !/class=['"][^'"]*\bjobs-list\b/.test(html)) {
      throw new Error('jazzhr: no job list on the board page (inactive or missing board)');
    }
    const items = html.matchAll(/<li class="list-group-item">([\s\S]*?)<\/ul>\s*<\/li>/g);
    return [...items].map(([, item]) => {
      const link = item.match(/<a href="(https:\/\/[^"]+\/apply\/([A-Za-z0-9]+)\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/);
      if (!link) throw new Error('jazzhr: list item without a job link');
      return {
        external_id: link[2],
        title: text(link[3]) ?? link[2],
        location: text(item.match(/fa-map-marker['"]><\/i>([^<]*)</)?.[1]),
        url: link[1],
        body: '',
        posted_at: null,
        raw: { department: text(item.match(/fa-sitemap['"]><\/i>([^<]*)</)?.[1]) },
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
      if (!jp) {
        const page = html.match(/id="job-description">([\s\S]*?)<\/div>\s*<div class="resumator-mobile-apply-wrapper/);
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
