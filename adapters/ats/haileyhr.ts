import { htmlToText } from '../../core/html.ts';
import type { AtsAdapter } from './types.ts';

// Hailey HR has no public feed (none found on its boards or by search, 2026-11-07); sitemap.xml and robots.txt
// are 404. The board is a Next.js app at {slug}.careers.haileyhr.app (a custom domain such as jobb.toxic.se
// redirects there), and its server-rendered page carries the data as React Server Components "flight" payload in
// self.__next_f.push([1,"..."]) scripts. The board page's payload holds a jobAds array (every open ad, no paging:
// its length matched the "Lediga tjänster (N)" heading on all three boards checked); each job page's payload holds
// the description as markdown in a text row. Verified live 2026-11-07 on toxic (1 ad), askas (1, an open
// application) and motillo (5). A wrong subdomain is a 404.
//
// jobAd    -> jobAdId -> external_id, title, link (/sv-SE/job/{company}/{recruitment}/{jobAd}) -> url,
//             locationName -> location; departmentName, subtitle, recruitment id -> raw.
// job page -> the markdown row behind the description component's {"value":"$10"} -> body.
// No date anywhere on the board or the job page, so posted_at is null.

interface JobAd {
  jobAdId: string;
  title: string;
  subtitle?: string | null;
  link: string;
  locationName?: string | null;
  departmentName?: string | null;
}

// The flight stream, as the concatenation of every push([1, "..."]) string on the page.
function flight(html: string): string {
  const chunks = html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g);
  return [...chunks].map(([, s]) => JSON.parse(s) as string).join('');
}

// The JSON array that starts at `from` (a "["), cut out by bracket depth outside strings.
function arrayAt(s: string, from: number): string {
  let depth = 0;
  for (let i = from, inString = false; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '[' || c === '{') depth++;
    else if ((c === ']' || c === '}') && --depth === 0) return s.slice(from, i + 1);
  }
  throw new Error('haileyhr: unterminated jobAds array');
}

// Flight values: "$undefined" is undefined, "$$..." is a literal string starting with "$".
const value = (v: string | null | undefined) =>
  v === null || v === undefined || v === '$undefined' ? null : v.startsWith('$$') ? v.slice(1).trim() || null : v.trim() || null;

// A text row is "{id}:T{hex byte length},{text}"; its length is in UTF-8 bytes, so it is cut from the bytes.
function textRow(stream: string, id: string): string | null {
  const bytes = Buffer.from(stream, 'utf8');
  const head = new RegExp(`(?:^|\\n)${id}:T([0-9a-f]+),`).exec(bytes.toString('latin1'));
  if (!head) return null;
  const start = head.index + head[0].length;
  return bytes.subarray(start, start + parseInt(head[1], 16)).toString('utf8');
}

function markdownToText(md: string): string {
  const text = md
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1')      // backslash escapes (the editor writes \*\*Lön:\*\*)
    .replace(/\*\*|__/g, '')                             // bold
    .replace(/^#{1,6}[ \t]+/gm, '')                      // headings
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')                // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');            // links keep their text
  return htmlToText(text);                               // stray inline HTML, entities, blank-line runs
}

const host = (slug: string) => `${slug.toLowerCase()}.careers.haileyhr.app`;

export const haileyhr: AtsAdapter = {
  vendor: 'haileyhr',
  feedUrl: (slug) => `https://${host(slug)}/`,
  parse(html, contentType, slug) {
    if (!/html/i.test(contentType)) throw new Error(`haileyhr: not a board page (content-type ${contentType || 'none'})`);
    const stream = flight(html);
    const at = stream.indexOf('"jobAds":[');
    if (at < 0) throw new Error('haileyhr: no jobAds on the board page');
    const ads = JSON.parse(arrayAt(stream, at + '"jobAds":'.length)) as JobAd[];
    return ads.map((a) => {
      if (!a.jobAdId || !a.link) throw new Error('haileyhr: job ad without id or link');
      return {
        external_id: a.jobAdId,
        title: value(a.title) ?? a.jobAdId,
        location: value(a.locationName),
        url: new URL(a.link, `https://${host(slug)}/`).href,
        body: '',
        posted_at: null,
        raw: {
          department: value(a.departmentName),
          subtitle: value(a.subtitle),
          recruitment_id: a.link.split('/').at(-2) ?? null,
        },
      };
    });
  },
  detail: {
    sets: ['body'],
    url: (posting) => posting.url,
    parse(html, _contentType, posting) {
      const stream = flight(html);
      // The description is the one component on the job page rendered from {"value": markdown}.
      const ref = stream.match(/\["\$","\$L[0-9a-f]+",null,\{"value":("(?:[^"\\]|\\.)*")\}\]/);
      if (!ref) throw new Error(`haileyhr: no description on ${posting.url}`);
      const v = JSON.parse(ref[1]) as string;
      const md = /^\$[0-9a-f]+$/.test(v) ? textRow(stream, v.slice(1)) : value(v);
      if (md === null) throw new Error(`haileyhr: description row ${v} missing on ${posting.url}`);
      return { ...posting, body: markdownToText(md) };
    },
  },
};
