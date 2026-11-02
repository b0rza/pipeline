import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const schema = readFileSync(new URL('../state/schema.sql', import.meta.url), 'utf8');

// Callers must db.close() at exit so the WAL is checkpointed before the nightly commit.
export function openDb(path = process.env.PIPELINE_DB ?? 'state/pipeline.sqlite'): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(schema);
  return db;
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
