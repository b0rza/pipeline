import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { checkpoint, mainFileComplete } from '../core/checkpoint.ts';
import { upsertCompanies } from '../core/companies.ts';
import { openDb } from '../core/db.ts';
import type { Company } from '../core/types.ts';

const company = (id: string): Company => ({
  id, name: id, domain: `${id}.test`, country: 'GB', phases: ['p1'],
  source: 'test', ats: { vendor: 'greenhouse', slug: id }, storefront: null, status: 'active', warm: false,
});

// What git would commit: the main file alone, without the gitignored -wal and -shm files next to it.
const companiesInMainFileCopy = (path: string, copyPath: string): number => {
  copyFileSync(path, copyPath);
  const copy = new DatabaseSync(copyPath, { readOnly: true });
  try {
    return (copy.prepare('select count(*) as n from companies').get() as { n: number }).n;
  } finally {
    copy.close();
  }
};

test('checkpoint puts rows into the main file while another connection stays open', () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'checkpoint-'));
  const path = join(dir, 'pipeline.sqlite');
  openDb(path).close(); // schema created and checkpointed while nothing else is open

  const bot = openDb(path); // stands in for bot/server.ts: open all day, idle between queries
  try {
    const nightly = openDb(path);
    upsertCompanies(nightly, [company('alpha'), company('beta')]);
    nightly.close(); // not the last connection, so this does not checkpoint

    assert.ok(statSync(`${path}-wal`).size > 0, 'the new rows sit in the -wal file');
    assert.equal(companiesInMainFileCopy(path, join(dir, 'before.sqlite')), 0, 'the main file alone lacks the new rows');

    const ck = openDb(path);
    const result = checkpoint(ck);
    ck.close();

    assert.deepEqual(result, { busy: 0, log: 0, checkpointed: 0 }); // TRUNCATE succeeded and emptied the WAL
    assert.equal(statSync(`${path}-wal`).size, 0);
    assert.equal(companiesInMainFileCopy(path, join(dir, 'after.sqlite')), 2, 'the main file alone now has the rows');
  } finally {
    bot.close();
  }
});

test('checkpoint reports busy and an incomplete copy when a reader holds an older snapshot', () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'checkpoint-'));
  const path = join(dir, 'pipeline.sqlite');
  openDb(path).close();

  const reader = openDb(path);
  const writer = openDb(path);
  const ck = openDb(path);
  try {
    upsertCompanies(writer, [company('alpha')]);
    reader.exec('begin');
    reader.prepare('select count(*) from companies').get(); // snapshot taken here
    upsertCompanies(writer, [company('beta')]); // frames the reader's snapshot must not see

    const result = checkpoint(ck, 0);
    assert.equal(result.busy, 1);
    assert.ok(result.checkpointed < result.log);
    assert.equal(mainFileComplete(result), false);

    reader.exec('commit');
    const retry = checkpoint(ck, 0);
    assert.equal(retry.busy, 0);
    assert.equal(mainFileComplete(retry), true);
  } finally {
    ck.close();
    writer.close();
    reader.close();
  }
});
