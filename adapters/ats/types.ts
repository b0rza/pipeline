import type { NormalizedPosting } from '../../core/types.ts';

// One feed request. fetchText sends it, so a POST waits its turn on the host, backs off and fails like a GET.
export interface FeedRequest {
  url: string;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
}

export interface AtsAdapter {
  vendor: string;
  feedUrl(slug: string): string;
  // For feeds read with something other than a plain GET of feedUrl (Workday: a POST with a JSON body). Pure.
  feedRequest?(slug: string): FeedRequest;
  // For feeds paged inside the request body: the request after `req`, or null on the last page. Pure. Used instead
  // of next() when set.
  nextRequest?(text: string, contentType: string, req: FeedRequest): FeedRequest | null;
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
