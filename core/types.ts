export interface Company {
  id: string;
  name: string;
  domain: string;
  country: string;
  phases: string[];
  source: string;
  ats: { vendor: string; slug: string } | null;
  storefront: string | null;
  status: 'active' | 'paused' | 'watch';
  warm: boolean;
}

export interface NormalizedPosting {
  external_id: string;
  title: string;
  location: string | null;
  url: string;
  body: string;              // plain text
  posted_at: string | null;  // ISO 8601
  raw: unknown;              // vendor-specific extras (employmentType, seniority, commitment, ...)
}
