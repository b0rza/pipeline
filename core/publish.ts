// Stage 7, file half: write out/<run_date>/ as the record of the digest. summary.md holds both agency lists and the
// employers; one file per signal holds its postings and, for outreach, the Compose draft. Runs before the nightly
// commit, before notify.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { droppedCount, employerEntries, kindTag, pendingSignals, type SignalRow } from '../bot/notify.ts';
import { composeBody, composeSubject } from '../bot/templates.ts';
import { openDb } from './db.ts';

const postingLine = (p: SignalRow) =>
  `- [${p.title}](${p.url}) — ${p.location ?? 'no location'} [${p.route_reason}]`;

export function signalFile(rows: SignalRow[]): string {
  const { list, name, country, ats_vendor, warm, run_date, kind } = rows[0];
  const lines = [
    `# ${name}`,
    '',
    `${warm ? 'warm · ' : ''}${country} · ${ats_vendor} · ${list.toUpperCase()}${kindTag(kind)} · run ${run_date}`,
    '',
    ...rows.map(postingLine),
  ];
  if (list === 'outreach') {
    const titles = [...new Set(rows.map((p) => p.title))];
    lines.push('', '## Draft', '', `Subject: ${composeSubject(name)}`, '', composeBody(name, titles).replace(/\r\n/g, '\n'));
  }
  return lines.join('\n') + '\n';
}

// Agency signals under Apply and Outreach, employer signals under Employers in the order of the Telegram overview
// (employerEntries in bot/notify.ts), each with its full posting list: the overview message is short, the record complete.
// The count line matches the digest header.
export function summaryFile(runDate: string, signals: SignalRow[][], dropped: number): string {
  const agencies = signals.filter((s) => s[0].kind !== 'employer');
  const employers = employerEntries(signals.filter((s) => s[0].kind === 'employer'));
  const apply = agencies.filter((s) => s[0].list === 'apply');
  const outreach = agencies.filter((s) => s[0].list === 'outreach');
  const lines = [
    `# Digest ${runDate}`, '',
    `${apply.length} apply · ${outreach.length} outreach · ${employers.length} employers · ${dropped} dropped postings`,
  ];
  const heading = (rows: SignalRow[], after: string) => {
    const { company_id, name, country, ats_vendor, warm } = rows[0];
    lines.push('', `### ${warm ? '🔥 ' : ''}${name} (${country}, ${ats_vendor})${after} — [${company_id}.md](${company_id}.md)`, '');
    lines.push(...rows.map(postingLine));
  };
  for (const [title, group] of [['Apply', apply], ['Outreach', outreach]] as const) {
    lines.push('', `## ${title}`);
    if (!group.length) lines.push('', 'none');
    for (const rows of group) heading(rows, '');
  }
  // The scope and contract words of the overview line; Croatia as its code, since the out/ files carry no flags.
  lines.push('', '## Employers');
  if (!employers.length) lines.push('', 'none');
  for (const e of employers) heading(e.rows, ` · ${e.scope}${e.contract ? ` · ${e.contract}` : ''}`);
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
