// The start and end of a nightly on the run's row. Stage 1 calls startRun(); scripts/run-nightly.sh calls `finish` after
// the last stage and `fail <stage> <message>` from its exit trap when a stage fails. The stages write their own counts (core/snapshot.ts, diff.ts,
// filter.ts, bot/notify.ts); the overview page reads the newest row for its last-run line.
//   node --import tsx core/runs.ts finish
//   node --import tsx core/runs.ts fail 1-2 "Error: no such table: postings"
import type { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { openDb } from './db.ts';

// Longest error kept on the row; the page shows it whole, so a stack dump must not land there.
const ERROR_MAX = 300;

// Stage 1 starts the run's row (core/snapshot.ts main). A re-run the same day starts the same row afresh: started_at
// moves to now, and the end, the error and every count are cleared, so the page shows the re-run in progress and no
// count is left over from the first run.
export function startRun(db: DatabaseSync, runDate: string, now = new Date()): void {
  db.prepare(`
    insert into runs (run_date, started_at) values (?, ?)
    on conflict(run_date) do update set started_at = excluded.started_at, finished_at = null, error = null,
      companies_polled = null, boards_ok = null, boards_failed = null, failed_boards = null, postings_new = null,
      postings_gone = null, signals = null, messages_sent = null`).run(runDate, now.toISOString());
}

// finished_at = now (UTC ISO, like started_at). False when the run has no row: stage 1 never started it.
export function finishRun(db: DatabaseSync, runDate: string, now = new Date()): boolean {
  return Number(db.prepare('update runs set finished_at = ? where run_date = ?').run(now.toISOString(), runDate).changes) > 0;
}

// error = `stage <stage>: <message>`, finished_at = now. Writes the row when there is none yet, so a failure before
// stage 1 started the run (a broken companies file, say) still shows on the page; started_at is then now as well.
export function failRun(db: DatabaseSync, runDate: string, stage: string, message: string, now = new Date()): string {
  const oneLine = message.replace(/\s+/g, ' ').trim() || 'no error output';
  const error = `stage ${stage}: ${oneLine}`.slice(0, ERROR_MAX);
  const at = now.toISOString();
  db.prepare(`
    insert into runs (run_date, started_at, finished_at, error) values (:run_date, :at, :at, :error)
    on conflict(run_date) do update set finished_at = excluded.finished_at, error = excluded.error`)
    .run({ run_date: runDate, at, error });
  return error;
}

function main() {
  const runDate = process.env.RUN_DATE ?? new Date().toISOString().slice(0, 10);
  const [command, ...args] = process.argv.slice(2);
  if (command !== 'finish' && !(command === 'fail' && args.length >= 1)) {
    console.error('usage: runs.ts finish | runs.ts fail <stage> <message>');
    process.exitCode = 2;
    return;
  }
  const db = openDb();
  try {
    if (command === 'finish') {
      if (finishRun(db, runDate)) console.log(`run ${runDate}: finished`);
      else console.log(`run ${runDate}: WARNING: no runs row to finish (stage 1 did not start the run)`);
    } else {
      console.log(`run ${runDate}: failed at ${failRun(db, runDate, args[0], args.slice(1).join(' '))}`);
    }
  } finally {
    db.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
