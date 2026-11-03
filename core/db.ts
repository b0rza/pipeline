import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const schema = readFileSync(new URL('../state/schema.sql', import.meta.url), 'utf8');
const migrationsDir = new URL('../state/migrations/', import.meta.url);

// Callers must db.close() at exit so the WAL is checkpointed before the nightly commit.
export function openDb(path = process.env.PIPELINE_DB ?? 'state/pipeline.sqlite'): DatabaseSync {
  const db = new DatabaseSync(path);
  const fresh = (db.prepare('select count(*) as n from sqlite_master').get() as { n: number }).n === 0;
  db.exec(schema);
  migrate(db, fresh);
  return db;
}

// A fresh DB already has the final shape from schema.sql, so its migrations are recorded, not run.
function migrate(db: DatabaseSync, fresh: boolean) {
  const applied = new Set((db.prepare('select name from schema_migrations').all() as { name: string }[]).map((r) => r.name));
  const record = db.prepare('insert into schema_migrations (name) values (?)');
  for (const name of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(name)) continue;
    db.exec('begin');
    try {
      if (!fresh) db.exec(readFileSync(new URL(name, migrationsDir), 'utf8'));
      record.run(name);
      db.exec('commit');
    } catch (err) {
      db.exec('rollback');
      throw err;
    }
  }
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
