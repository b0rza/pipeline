import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { parse } from 'yaml';
import { z } from 'zod';
import type { Company } from './types.ts';

export const vendors = [
  'greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'personio', 'recruitee', 'teamtailor',
  'bamboohr', 'jazzhr', 'rippling', 'breezy', 'gohire', 'zoho', 'pinpoint', 'hirehive', 'homerun', 'haileyhr',
  'custom', 'unknown',
] as const;

const entry = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  domain: z.string().min(1),
  country: z.string().min(2),
  phases: z.array(z.enum(['p1', 'p2'])).min(1),
  source: z.string().min(1),
  ats: z.object({ vendor: z.enum(vendors), slug: z.string().min(1).optional() }).nullish(),
  storefront: z.string().nullish(),
  careers_url: z.string().nullish(),
  status: z.enum(['active', 'paused', 'watch']).default('active'),
  warm: z.boolean().default(false),
});

export function loadCompanies(path = process.env.COMPANIES_FILE ?? 'universe/companies.yaml'): Company[] {
  const entries = z.array(entry).parse(parse(readFileSync(path, 'utf8')) ?? []);
  return entries.map((e) => ({
    id: e.id,
    name: e.name,
    domain: e.domain,
    country: e.country,
    phases: e.phases,
    source: e.source,
    ats: e.ats?.slug ? { vendor: e.ats.vendor, slug: e.ats.slug } : null,
    storefront: e.storefront ?? null,
    status: e.status,
    warm: e.warm,
  }));
}

export function upsertCompanies(db: DatabaseSync, companies: Company[]): void {
  const stmt = db.prepare(`
    insert into companies (id, name, domain, country, phases, ats_vendor, ats_slug, storefront_url, source, status, warm)
    values (:id, :name, :domain, :country, :phases, :ats_vendor, :ats_slug, :storefront_url, :source, :status, :warm)
    on conflict(id) do update set
      name = excluded.name, domain = excluded.domain, country = excluded.country, phases = excluded.phases,
      ats_vendor = excluded.ats_vendor, ats_slug = excluded.ats_slug, storefront_url = excluded.storefront_url,
      source = excluded.source, status = excluded.status, warm = excluded.warm`);
  for (const c of companies) {
    stmt.run({
      id: c.id,
      name: c.name,
      domain: c.domain,
      country: c.country,
      phases: JSON.stringify(c.phases),
      ats_vendor: c.ats?.vendor ?? null,
      ats_slug: c.ats?.slug ?? null,
      storefront_url: c.storefront,
      source: c.source,
      status: c.status,
      warm: c.warm ? 1 : 0,
    });
  }
}
