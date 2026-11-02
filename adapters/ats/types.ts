import type { NormalizedPosting } from '../../core/types.ts';

export interface AtsAdapter {
  vendor: string;
  feedUrl(slug: string): string;
  // Pure: no I/O, so fixtures can test it. Throws on a response that isn't this vendor's feed.
  parse(text: string, contentType: string, slug: string): NormalizedPosting[];
}

export function toIso(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
