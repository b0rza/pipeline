// Groups and bars of the desirable-employers research (universe/_research/2026-11-07-desirable-employers.yaml), in the
// order the overview page lists them.
export const EMPLOYER_GROUPS = ['payments-fintech', 'commerce-platforms', 'commerce-adjacent', 'devtools-ai', 'remote-first-europe'] as const;
export const EMPLOYER_BARS = ['reach', 'fit', 'stretch'] as const;
export const REMOTE_EUROPE = ['yes', 'partial', 'no', 'unclear', 'unknown'] as const;

// What the research found about an employer, read from universe/companies.yaml only (not stored in the database).
export interface EmployerProfile {
  group: (typeof EMPLOYER_GROUPS)[number];
  bar: (typeof EMPLOYER_BARS)[number];
  why: string;
  remote: { europe: (typeof REMOTE_EUROPE)[number]; says: string; source: string };
  engagement: 'employment' | 'contract' | 'both' | 'unknown';
}

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
  // agency: the owner contracts for it (every company until 2026-11-09). employer: he would work for it directly.
  // Absent means agency; loadCompanies() always sets it.
  kind?: 'agency' | 'employer';
  employer?: EmployerProfile | null;
  careers_url?: string | null;
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
