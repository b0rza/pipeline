import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';
import { loadCompanies, upsertCompanies } from '../core/companies.ts';
import { openDb } from '../core/db.ts';

const dir = () => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'companies-'));

const write = (yaml: string) => {
  const path = join(dir(), 'companies.yaml');
  writeFileSync(path, yaml);
  return path;
};

const base = `
- id: acme
  name: Acme
  domain: acme.test
  country: GB
  phases: [p1]
  source: test
  ats: { vendor: greenhouse, slug: acme }
`;

const profile = `
  employer:
    group: devtools-ai
    bar: fit
    why: "Builds things"
    remote: { europe: yes, says: "Remote in Europe", source: "https://acme.test/remote" }
    engagement: employment
`;

test('universe/companies.yaml loads, ids are unique, and the 2026-11-07 employers are on it with their profile', () => {
  const companies = loadCompanies('universe/companies.yaml');
  assert.equal(new Set(companies.map((c) => c.id)).size, companies.length);
  for (const c of companies) {
    assert.equal(c.kind === 'employer', c.employer !== null, c.id);
  }
  const research = parse(readFileSync('universe/_research/2026-11-07-desirable-employers.yaml', 'utf8')) as
    { id: string; group: string; ats: { vendor: string; slug?: string } }[];
  const byId = new Map(companies.map((c) => [c.id, c]));
  for (const r of research) {
    const c = byId.get(r.id);
    assert.equal(c?.kind, 'employer', r.id);
    assert.equal(c.employer?.group, r.group, r.id);
    assert.ok(c.careers_url, r.id);
  }
  // Polled although it costs one request per posting (about 7 minutes a run).
  assert.deepEqual(byId.get('wise')?.ats, { vendor: 'smartrecruiters', slug: 'Wise' });
});

test('kind defaults to agency, and the employer profile goes with kind employer only', () => {
  const [agency] = loadCompanies(write(base));
  assert.equal(agency.kind, 'agency');
  assert.equal(agency.employer, null);

  const [employer] = loadCompanies(write(`${base}  kind: employer\n  careers_url: https://acme.test/jobs${profile}`));
  assert.equal(employer.kind, 'employer');
  assert.equal(employer.careers_url, 'https://acme.test/jobs');
  assert.deepEqual(employer.employer, {
    group: 'devtools-ai', bar: 'fit', why: 'Builds things', engagement: 'employment',
    remote: { europe: 'yes', says: 'Remote in Europe', source: 'https://acme.test/remote' },
  });

  assert.throws(() => loadCompanies(write(`${base}  kind: employer\n`)), /an employer: profile goes with kind: employer/);
  assert.throws(() => loadCompanies(write(`${base}${profile}`)), /an employer: profile goes with kind: employer/);
  assert.throws(() => loadCompanies(write(`${base}  kind: employer${profile.replace('devtools-ai', 'crypto')}`)));
  assert.throws(() => loadCompanies(write(`${base}  kind: vendor\n`)));
});

test('upsertCompanies writes kind; migration 003 gives existing companies kind agency', () => {
  const path = join(dir(), 'pipeline.sqlite');
  const db = openDb(path);
  const [acme] = loadCompanies(write(base));
  const [emp] = loadCompanies(write(`${base.replace(/acme/g, 'emp')}  kind: employer${profile}`));
  upsertCompanies(db, [acme, emp]);
  const kinds = () => db.prepare('select id, kind from companies order by id').all().map((r) => [r.id, r.kind]);
  assert.deepEqual(kinds(), [['acme', 'agency'], ['emp', 'employer']]);
  // A company type without kind (the test fixtures) is an agency.
  upsertCompanies(db, [{ ...emp, kind: undefined }]);
  assert.deepEqual(kinds(), [['acme', 'agency'], ['emp', 'agency']]);
  db.close();

  // A database from before 003: the column is missing and the migration is not recorded.
  const old = openDb(path);
  old.exec("alter table companies drop column kind; delete from schema_migrations where name = '003-company-kind.sql'");
  old.close();
  const migrated = openDb(path);
  assert.deepEqual(migrated.prepare('select id, kind from companies order by id').all().map((r) => [r.id, r.kind]),
    [['acme', 'agency'], ['emp', 'agency']]);
  assert.ok(migrated.prepare("select 1 from schema_migrations where name = '003-company-kind.sql'").get());
  migrated.close();
});
