import { htmlToText } from '../../core/html.ts';
import type { AtsAdapter } from './types.ts';

// The slug is the board's widget hash, not its jobs.gohire.io path: the board page loads
// widget.gohire.io/widget/{hash}, and the keyless list is api2.gohire.io/widget-jobs/{hash}. The hash is
// case-sensitive (helm-digital-pd37nmt8 is hash Pd37nmt8). The list is JSON served as text/html and has no
// description, so each job page is fetched for its body (div.jp-text; no ld+json on the page).
// Verified live 2026-11-07 on Epic Design Labs (mfqEeOYP, 2 jobs, board on jobs.epicdesignlabs.com); Helm Digital
// (Pd37nmt8) and GoHire's own board (n7zuw0Ah) answer the same way with an empty jobs array. A wrong hash is `{}`.
// robots.txt on the board hosts allows everything.
//
// list   jobs[] -> id -> external_id, title, location, link (made https) -> url,
//                  date ("17 March, 2025") -> posted_at; salary, type -> raw.
// detail div.jp-text -> body.

interface Job {
  id: number | string;
  title: string;
  location?: string | null;
  salary?: string | null;
  type?: string | null;
  date?: string | null;
  link: string;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
  'november', 'december'];

// "17 March, 2025" as a UTC date, so the result doesn't depend on the machine's time zone.
function postedAt(s: string | null | undefined): string | null {
  const m = s?.trim().match(/^(\d{1,2}) ([A-Za-z]+),? (\d{4})$/);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  return m && month >= 0 ? new Date(Date.UTC(Number(m[3]), month, Number(m[1]))).toISOString() : null;
}

export const gohire: AtsAdapter = {
  vendor: 'gohire',
  feedUrl: (slug) => `https://api2.gohire.io/widget-jobs/${encodeURIComponent(slug)}`,
  parse(text) {
    let data: { jobs?: Job[] };
    try { data = JSON.parse(text) as { jobs?: Job[] }; } catch { throw new Error('gohire: widget feed is not JSON'); }
    if (!Array.isArray(data.jobs)) throw new Error('gohire: widget feed has no jobs array (wrong or removed widget hash)');
    return data.jobs.map((j) => ({
      external_id: String(j.id),
      title: j.title.trim(),
      location: j.location?.trim() || null,
      url: j.link.replace(/^http:\/\//, 'https://'),
      body: '',
      posted_at: postedAt(j.date),
      raw: { salary: j.salary?.trim() || null, type: j.type?.trim() || null },
    }));
  },
  detail: {
    sets: ['body'],
    url: (posting) => posting.url,
    parse(html, _contentType, posting) {
      const m = html.match(/<div class="jp-text">([\s\S]*?)<div class="jp-btm">/);
      if (!m) throw new Error(`gohire: no job description on ${posting.url}`);
      return { ...posting, body: htmlToText(m[1]) };
    },
  },
};
