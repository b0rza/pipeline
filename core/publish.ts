// Stage 7, file half: write out/<run_date>/ as the record of the digest. summary.md holds both lists; one file per
// signal holds its postings and, for outreach, the Compose draft. Runs before the nightly commit, before notify.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { droppedCount, pendingSignals, type SignalRow } from '../bot/notify.ts';
import { composeBody, composeSubject } from '../bot/templates.ts';
import { openDb } from './db.ts';

const postingLine = (p: SignalRow) =>
  `- [${p.title}](${p.url}) — ${p.location ?? 'no location'}${p.route === 'apply' ? ` [${p.route_reason}]` : ''}`;

export function signalFile(rows: SignalRow[]): string {
  const { list, name, country, ats_vendor, warm, run_date } = rows[0];
  const lines = [
    `# ${name}`,
    '',
    `${warm ? 'warm · ' : ''}${country} · ${ats_vendor} · ${list.toUpperCase()} · run ${run_date}`,
    '',
    ...rows.map(postingLine),
  ];
  if (list === 'outreach') {
    const titles = [...new Set(rows.map((p) => p.title))];
    lines.push('', '## Draft', '', `Subject: ${composeSubject(name)}`, '', composeBody(name, titles).replace(/\r\n/g, '\n'));
  }
  return lines.join('\n') + '\n';
}

export function summaryFile(runDate: string, signals: SignalRow[][], dropped: number): string {
  const apply = signals.filter((s) => s[0].list === 'apply');
  const outreach = signals.filter((s) => s[0].list === 'outreach');
  const lines = [`# Digest ${runDate}`, '', `${apply.length} apply · ${outreach.length} outreach · ${dropped} dropped postings`];
  for (const [heading, group] of [['Apply', apply], ['Outreach', outreach]] as const) {
    lines.push('', `## ${heading}`);
    if (!group.length) lines.push('', 'none');
    for (const rows of group) {
      const { company_id, name, country, ats_vendor, warm } = rows[0];
      lines.push('', `### ${warm ? '🔥 ' : ''}${name} (${country}, ${ats_vendor}) — [${company_id}.md](${company_id}.md)`, '');
      lines.push(...rows.map(postingLine));
    }
  }
  return lines.join('\n') + '\n';
}

// Writes summary.md plus <company_id>.md per signal. Same content on a re-run, so the nightly commit stays idempotent.
export function publishRun(db: DatabaseSync, runDate: string, outRoot = 'out'): { signals: number; dir: string } {
  const signals = [...pendingSignals(db, runDate).values()];
  const dir = join(outRoot, runDate);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'summary.md'), summaryFile(runDate, signals, droppedCount(db, runDate)));
  for (const rows of signals) writeFileSync(join(dir, `${rows[0].company_id}.md`), signalFile(rows));
  return { signals: signals.length, dir };
}

function main() {
  const runDate = process.env.RUN_DATE ?? new Date().toISOString().slice(0, 10);
  const db = openDb();
  try {
    const { signals, dir } = publishRun(db, runDate);
    console.log(`publish ${runDate}: ${signals} signals written to ${dir}/`);
  } finally {
    db.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
