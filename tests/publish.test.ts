import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { upsertCompanies } from '../core/companies.ts';
import { openDb } from '../core/db.ts';
import { diffRun } from '../core/diff.ts';
import { filterRun } from '../core/filter.ts';
import { publishRun } from '../core/publish.ts';
import { snapshotCompany } from '../core/snapshot.ts';
import type { Company, NormalizedPosting } from '../core/types.ts';

const company = (id: string, extra: Partial<Company> = {}): Company => ({
  id, name: id, domain: `${id}.test`, country: 'GB', phases: ['p1'],
  source: 'test', ats: { vendor: 'greenhouse', slug: id }, storefront: null, status: 'active', warm: false, ...extra,
});

const posting = (external_id: string, title: string): NormalizedPosting => ({
  external_id, title, location: 'London', url: `https://example.test/${external_id}`, body: '', posted_at: null, raw: {},
});

const seed = (db: DatabaseSync, runDate: string) => {
  const entries: [Company, NormalizedPosting[]][] = [
    [company('alpha'), [posting('a1', 'Frontend Developer'), posting('a2', 'Engineering Talent Pool')]],
    [company('zeta'), [posting('z1', 'Backend Engineer'), posting('z2', 'Senior Software Engineer, Contract')]],
  ];
  upsertCompanies(db, entries.map(([c]) => c));
  for (const [c, ps] of entries) snapshotCompany(db, c, ps, runDate);
  diffRun(db, runDate);
  filterRun(db, runDate);
};

test('publishRun writes summary.md and one file per signal, same bytes on a re-run', () => {
  const db = openDb(':memory:');
  seed(db, '2026-11-02');
  const root = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'publish-'));

  assert.deepEqual(publishRun(db, '2026-11-02', root), { signals: 2, dir: join(root, '2026-11-02') });
  const dir = join(root, '2026-11-02');
  assert.deepEqual(readdirSync(dir).sort(), ['alpha.md', 'summary.md', 'zeta.md']);

  const summary = readFileSync(join(dir, 'summary.md'), 'utf8');
  assert.ok(summary.startsWith('# Digest 2026-11-02\n\n1 apply · 1 outreach · 1 dropped postings\n'));
  assert.ok(summary.indexOf('## Apply') < summary.indexOf('### zeta'), 'zeta under Apply');
  assert.ok(summary.indexOf('## Outreach') < summary.indexOf('### alpha'), 'alpha under Outreach');
  assert.ok(summary.includes('[Senior Software Engineer, Contract](https://example.test/z2) — London [title:contract · unknown:GB]'));
  assert.ok(!summary.includes('Talent Pool'), 'dropped posting not listed');

  const alpha = readFileSync(join(dir, 'alpha.md'), 'utf8');
  assert.ok(alpha.includes('## Draft\n\nSubject: alpha: contract storefront engineering'));
  assert.ok(alpha.includes('- Frontend Developer'));
  assert.ok(!alpha.includes('\r'), 'draft uses LF in files');
  const zeta = readFileSync(join(dir, 'zeta.md'), 'utf8');
  assert.ok(!zeta.includes('## Draft'), 'apply signals carry no draft');

  publishRun(db, '2026-11-02', root);
  assert.equal(readFileSync(join(dir, 'summary.md'), 'utf8'), summary);
  assert.equal(readFileSync(join(dir, 'alpha.md'), 'utf8'), alpha);
  db.close();
});

test('publishRun leaves out a posting that left the company board', () => {
  const db = openDb(':memory:');
  seed(db, '2026-11-02');
  const c = company('alpha');
  snapshotCompany(db, c, [posting('a2', 'Engineering Talent Pool')], '2026-11-03');
  diffRun(db, '2026-11-03');
  filterRun(db, '2026-11-03');
  const root = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'publish-'));
  const dir = join(root, '2026-11-03');

  assert.deepEqual(publishRun(db, '2026-11-03', root), { signals: 1, dir });
  assert.deepEqual(readdirSync(dir).sort(), ['summary.md', 'zeta.md']);
  const summary = readFileSync(join(dir, 'summary.md'), 'utf8');
  assert.ok(summary.startsWith('# Digest 2026-11-03\n\n1 apply · 0 outreach · 0 dropped postings\n'));
  assert.ok(!summary.includes('Frontend Developer'), 'gone posting not listed');

  // zeta keeps one live posting, one gone: only the live one is in its file.
  snapshotCompany(db, company('zeta'), [posting('z2', 'Senior Software Engineer, Contract')], '2026-11-04');
  diffRun(db, '2026-11-04');
  filterRun(db, '2026-11-04');
  publishRun(db, '2026-11-04', root);
  const zeta = readFileSync(join(root, '2026-11-04', 'zeta.md'), 'utf8');
  assert.ok(zeta.includes('[Senior Software Engineer, Contract](https://example.test/z2)'));
  assert.ok(!zeta.includes('Backend Engineer'), 'gone posting not listed');
  db.close();
});

test('summary.md lists apply signals with a B2B posting first, B2B postings first, as the digest does', () => {
  const db = openDb(':memory:');
  const entries: [Company, NormalizedPosting[]][] = [
    [company('aardvark'), [posting('k1', 'Senior Software Engineer, Contract')]],
    [company('zulu'), [posting('u1', 'Backend Engineer, Contract'), { ...posting('u2', 'Software Engineer'), body: 'Corp-to-corp welcome. W2 only for the US.' }]],
  ];
  upsertCompanies(db, entries.map(([c]) => c));
  for (const [c, ps] of entries) snapshotCompany(db, c, ps, '2026-11-02');
  diffRun(db, '2026-11-02');
  filterRun(db, '2026-11-02');
  const root = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'publish-'));
  publishRun(db, '2026-11-02', root);
  const summary = readFileSync(join(root, '2026-11-02', 'summary.md'), 'utf8');
  assert.ok(summary.indexOf('### zulu') < summary.indexOf('### aardvark'), 'zulu (B2B) before aardvark');
  const zulu = readFileSync(join(root, '2026-11-02', 'zulu.md'), 'utf8');
  assert.ok(zulu.includes(
    '- [Software Engineer](https://example.test/u2) — London [b2b:corp-to-corp · payroll · unknown:GB]\n' +
    '- [Backend Engineer, Contract](https://example.test/u1) — London [title:contract · unknown:GB]\n'));
  db.close();
});
