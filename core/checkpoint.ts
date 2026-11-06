// Stage 7, before the nightly commit: copy every WAL frame into state/pipeline.sqlite so the git copy is current.
// Closing our own connections is not enough while the bot or the UI keeps a connection open: SQLite only
// checkpoints on close when the closing connection is the last one, so the newest rows stay in the -wal file,
// which is gitignored.
import type { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { openDb } from './db.ts';

export type CheckpointResult = { busy: number; log: number; checkpointed: number };

// How long SQLite's busy handler keeps retrying while a writer holds the lock or a reader sits on an old snapshot.
export const BUSY_TIMEOUT_MS = 5000;

// TRUNCATE copies every frame and empties the -wal file. Idle connections (no open read transaction) do not block it.
// busy = 1 means a reader or writer was still active when the timeout ran out; the frames copied up to then are kept.
export function checkpoint(db: DatabaseSync, busyTimeoutMs = BUSY_TIMEOUT_MS): CheckpointResult {
  db.exec(`pragma busy_timeout = ${Math.max(0, Math.trunc(busyTimeoutMs))}`);
  const { busy, log, checkpointed } = db.prepare('pragma wal_checkpoint(TRUNCATE)').get() as CheckpointResult;
  return { busy, log, checkpointed };
}

// The main file holds every committed row when nothing was busy, or when all logged frames were copied anyway
// (a reader on the newest snapshot only stops the -wal file from being reset, not the copy).
export const mainFileComplete = (r: CheckpointResult) => r.busy === 0 || r.checkpointed === r.log;

function main() {
  const db = openDb();
  try {
    const r = checkpoint(db);
    if (r.busy === 0) console.log('checkpoint: WAL copied into the main file and truncated');
    else if (mainFileComplete(r)) console.log(`checkpoint: all ${r.log} WAL pages copied; WAL not truncated (a reader is active)`);
    // Exit 0 on purpose: run-nightly.sh uses set -e, and a failure here would skip the commit and the digest.
    // Nothing is lost on disk; the next night's checkpoint brings the git copy up to date.
    else console.error(`checkpoint: WARNING only ${r.checkpointed} of ${r.log} WAL pages copied after ${BUSY_TIMEOUT_MS} ms; the committed state/pipeline.sqlite will lack the newest rows`);
  } finally {
    db.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
