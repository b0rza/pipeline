import type { NormalizedPosting } from '../../core/types.ts';

export interface AtsAdapter {
  vendor: string;
  feedUrl(slug: string): string;
  // Pure: no I/O, so fixtures can test it. Throws on a response that isn't this vendor's feed.
  parse(text: string, contentType: string, slug: string): NormalizedPosting[];
  // For feeds that list postings without a body: fetchPostings fetches url() for each listed posting and
  // parse() completes it from that response. Also pure.
  detail?: {
    url(posting: NormalizedPosting, slug: string): string;
    parse(text: string, contentType: string, posting: NormalizedPosting): NormalizedPosting;
  };
  // For paged feeds: the URL of the page after the one fetched from `url`, or null on the last page. Also pure.
  next?(text: string, contentType: string, url: string): string | null;
}

export function toIso(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
