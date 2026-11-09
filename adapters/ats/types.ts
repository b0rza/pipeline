import type { NormalizedPosting } from '../../core/types.ts';

// One feed request. fetchText sends it, so a POST waits its turn on the host, backs off and fails like a GET.
export interface FeedRequest {
  url: string;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
}

export type DetailField = keyof NormalizedPosting;

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
    // The fields parse() takes from the detail response. A posting already stored and still live is not fetched
    // again: these fields come from its stored row, the rest from the list (fetchBoard in index.ts). Title and
    // location come from the list whenever the list carries them, even when parse() also sets them.
    sets: readonly DetailField[];
    // What matches a listed posting to its stored row, read from the list before any detail request and kept by
    // parse(). Defaults to external_id; an adapter whose parse() replaces external_id must key on something else.
    key?(posting: NormalizedPosting): string;
  };
  // For paged feeds: the URL of the page after the one fetched from `url`, or null on the last page. Also pure.
  next?(text: string, contentType: string, url: string): string | null;
}

export function toIso(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
