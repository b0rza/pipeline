import { XMLParser } from 'fast-xml-parser';
import { htmlToText, unescapeHtml } from '../../core/html.ts';
import { toIso, type AtsAdapter } from './types.ts';

// Keyless Atom feed at feed.homerun.co/{slug}, advertised by every Homerun board as its rel="alternate"
// application/atom+xml link, on {slug}.homerun.co and on custom-domain boards alike (careers.labdigital.nl links
// feed.homerun.co/labd). The slug is the feed name, which is not always the board subdomain. Every open job with
// its full description HTML; no paging. Verified live 2026-11-07 on six boards (labd 6, dotcontrol 4, try 2,
// mandogroup 1, flatline-agency 9, kubix-media 6): each feed listed the same jobs as the job list embedded in its
// board page. The board page itself renders that list client-side, so the feed is the only clean source.
// A wrong slug redirects to 404.homerun.co, which fetchText reports as a failure.
//
// entry -> id (job_...) -> external_id, title, link[rel=alternate] -> url, description -> body (content and
//          summary are a generated one-liner, used only when description is empty), location names -> location,
//          updated ("2026-05-01 14:29:50", UTC) -> posted_at; department, type (Full-time, Full-time / Part-time),
//          salary_indication (null for "N/A" or no figure) -> raw.
// posted_at: the entry's <updated> matched the job page's JobPosting datePosted on the two pages checked
// (flatline-agency shopify-consultant, labd senior-frontend-engineer-4). Whether Homerun bumps it on an edit is
// unverified.

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: false,  // unescapeHtml below handles numeric entities too (&#039;), which the parser leaves
  parseTagValue: false,
  isArray: (name) => name === 'entry' || name === 'link' || name === 'name',
});

type Node = string | { '#text'?: string } | undefined;
interface Named { name?: Node[] }
interface Entry {
  id?: Node;
  title?: Node;
  link?: { '@_rel'?: string; '@_href'?: string }[];
  description?: Node;
  content?: Node;
  summary?: Node;
  department?: Named;
  location?: Named;
  type?: Named;
  salary_indication?: Node;
  updated?: Node;
}

const raw = (n: Node) => (typeof n === 'string' ? n : n?.['#text'] ?? '');
const text = (n: Node) => unescapeHtml(raw(n)).trim();
const names = (v: Named | undefined) => (v?.name ?? []).map(text).filter(Boolean);

// Entry dates are "YYYY-MM-DD HH:MM:SS" in UTC (the feed-level <updated> carries +00:00 for the same instant).
const date = (v: string) => toIso(v.replace(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)$/, '$1T$2Z'));

export const homerun: AtsAdapter = {
  vendor: 'homerun',
  feedUrl: (slug) => `https://feed.homerun.co/${encodeURIComponent(slug)}`,
  parse(body, contentType) {
    if (!/xml/i.test(contentType)) throw new Error(`homerun: not an Atom feed (content-type ${contentType || 'none'})`);
    const feed = (xml.parse(body) as { feed?: { entry?: Entry[] } | '' }).feed;
    if (feed === undefined) throw new Error('homerun: response has no <feed>');
    const entries = feed === '' ? [] : feed.entry ?? [];
    return entries.map((e) => {
      const id = text(e.id);
      const url = (e.link ?? []).find((l) => (l['@_rel'] ?? 'alternate') === 'alternate')?.['@_href'];
      if (!id || !url) throw new Error('homerun: entry without id or link');
      const html = [e.description, e.content, e.summary].map(raw).find((h) => h.trim()) ?? '';
      const salary = text(e.salary_indication);
      const location = names(e.location);
      return {
        external_id: id,
        title: text(e.title) || id,
        location: location.length ? location.join(', ') : null,
        url,
        body: htmlToText(html),
        posted_at: date(text(e.updated)),
        raw: {
          department: names(e.department).join(', ') || null,
          type: names(e.type).join(', ') || null,
          salary: /\d/.test(salary) ? salary : null,
        },
      };
    });
  },
};
