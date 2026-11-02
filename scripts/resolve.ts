// Careers-URL resolver: fills ats {vendor, slug} for seed entries whose vendor is unknown or missing.
// Usage: npm run resolve -- <file.yaml> [--verify]
import { readFileSync, writeFileSync } from 'node:fs';
import { isMap, isScalar, isSeq, parseDocument, type YAMLMap } from 'yaml';
import { adapters } from '../adapters/ats/index.ts';
import { fetchText, HttpError } from '../core/http.ts';

const PATHS = ['/careers', '/jobs', '/join', '/karriere', '/karijere', '/vacatures', '/lediga-jobb', '/career', '/jobs/'];
// Path segments and subdomains that are vendor infrastructure, not a company slug.
const NOT_SLUGS = new Set(['embed', 'api', 'www', 'app', 'assets', 'cdn', 'static', 'j', 'jobs', 'v1', 'support', 'docs']);

interface Found { vendor: string; slug: string; evidence: string }

const hostRules: [RegExp, string, 'path' | 'sub'][] = [
  [/^(job-)?boards\.greenhouse\.io$/, 'greenhouse', 'path'],
  [/^jobs\.lever\.co$/, 'lever', 'path'],
  [/^jobs\.ashbyhq\.com$/, 'ashby', 'path'],
  [/^apply\.workable\.com$/, 'workable', 'path'],
  [/^jobs\.smartrecruiters\.com$/, 'smartrecruiters', 'path'],
  [/^[\w-]+\.jobs\.personio\.(de|com)$/, 'personio', 'sub'],
  [/^[\w-]+\.recruitee\.com$/, 'recruitee', 'sub'],
  [/^[\w-]+\.teamtailor\.com$/, 'teamtailor', 'sub'],
];

const htmlRules: [RegExp, string][] = [
  [/boards\.greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([\w-]+)/, 'greenhouse'],
  [/(?:job-)?boards\.greenhouse\.io\/([\w-]+)/, 'greenhouse'],
  [/jobs\.lever\.co\/([\w-]+)/, 'lever'],
  [/([\w-]+)\.jobs\.personio\.(?:de|com)/, 'personio'],
  [/([\w-]+)\.recruitee\.com/, 'recruitee'],
  [/apply\.workable\.com\/([\w-]+)/, 'workable'],
  [/jobs\.ashbyhq\.com\/([\w-]+)/, 'ashby'],
  [/([\w-]+)\.teamtailor\.com/, 'teamtailor'],
];

function detect(finalUrl: string, html: string): Omit<Found, 'evidence'> | null {
  const u = new URL(finalUrl);
  for (const [re, vendor, from] of hostRules) {
    if (!re.test(u.hostname)) continue;
    const slug = from === 'sub' ? u.hostname.split('.')[0] : u.pathname.split('/')[1];
    if (slug && !NOT_SLUGS.has(slug)) return { vendor, slug };
  }
  for (const [re, vendor] of htmlRules) {
    for (const m of html.matchAll(new RegExp(re, 'gi'))) {
      if (!NOT_SLUGS.has(m[1].toLowerCase())) return { vendor, slug: m[1] };
    }
  }
  return null;
}

async function resolve(domain: string, careersUrl: string | undefined): Promise<Found | null> {
  const urls = careersUrl ? [careersUrl] : PATHS.map((p) => `https://${domain}${p}`);
  for (const url of urls) {
    try {
      const res = await fetchText(url);
      const found = detect(res.url, res.text);
      if (found) return { ...found, evidence: res.url };
    } catch (err) {
      // unreachable host: the remaining paths on it will fail the same way
      if (err instanceof HttpError && err.status === 0) return null;
    }
  }
  return null;
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: npm run resolve -- <file.yaml> [--verify]');
  process.exit(2);
}

const source = readFileSync(file, 'utf8');
const doc = parseDocument(source);
if (!isSeq(doc.contents)) throw new Error(`${file}: expected a list of companies`);
const entries = doc.contents.items.filter(isMap) as YAMLMap[];
// Edits are spliced into the source text so everything except the ats values stays byte-identical.
const edits: { start: number; end: number; text: string }[] = [];

for (const e of entries) {
  const id = String(e.get('id'));
  const ats = e.get('ats');
  const vendor = isMap(ats) ? String(ats.get('vendor') ?? '') : '';
  const slug = isMap(ats) ? String(ats.get('slug') ?? '') : '';
  if (vendor && vendor !== 'unknown') {
    console.log(`${id.padEnd(28)}  ${vendor.padEnd(15)}  ${slug}  (from file)`);
    continue;
  }
  const careersUrl = e.get('careers_url');
  const found = await resolve(String(e.get('domain')), typeof careersUrl === 'string' ? careersUrl : undefined);
  if (!found) {
    console.log(`${id.padEnd(28)}  unknown`);
    continue;
  }
  const text = `{ vendor: ${found.vendor}, slug: ${found.slug} }`;
  const pair = e.items.find((p) => isScalar(p.key) && p.key.value === 'ats');
  const range = (pair?.value as { range?: [number, number, number] } | null)?.range;
  if (range) {
    edits.push({ start: range[0], end: range[1], text });
  } else {
    const indent = e.range![0] - (source.lastIndexOf('\n', e.range![0] - 1) + 1);
    edits.push({ start: e.range![1], end: e.range![1], text: `\n${' '.repeat(indent)}ats: ${text}` });
  }
  e.set('ats', doc.createNode({ vendor: found.vendor, slug: found.slug }));
  console.log(`${id.padEnd(28)}  ${found.vendor.padEnd(15)}  ${found.slug}  (${found.evidence})`);
}

let resolved = source;
for (const { start, end, text } of edits.sort((a, b) => b.start - a.start)) {
  resolved = resolved.slice(0, start) + text + resolved.slice(end);
}
const out = file.replace(/\.ya?ml$/, '') + '.resolved.yaml';
writeFileSync(out, resolved);
console.log(`wrote ${out}`);

if (args.includes('--verify')) {
  for (const e of entries) {
    const ats = e.get('ats');
    if (!isMap(ats)) continue;
    const vendor = String(ats.get('vendor'));
    const slug = String(ats.get('slug'));
    const adapter = adapters[vendor];
    if (!adapter) continue;
    const label = `${String(e.get('id')).padEnd(28)}  ${vendor}/${slug}`;
    try {
      const res = await fetchText(adapter.feedUrl(slug));
      console.log(`${label}  ${adapter.parse(res.text, res.contentType, slug).length} postings`);
    } catch (err) {
      console.log(`${label}  error: ${(err as Error).message}`);
    }
  }
}
