// Stage 3 location rule, from DECISIONS.md "Work arrangements the owner will take (2026-11-04)": remote in
// EU/UK/US/CH/NO is eligible, hybrid there is kept for the owner to judge, on-site only in Split. Remote restricted to
// one country other than HR is kept and tagged `remote:XX-only` ("Remote within one country is kept and tagged
// (2026-11-05)"). Pure: no db, no network.

export type WorkMode = 'remote' | 'hybrid' | 'onsite' | 'unknown';

// EU27, then GB, CH, NO (not EU, assumed in scope), US.
export const ELIGIBLE = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'CH', 'NO', 'US',
]);

// Names, native names, demonyms and aliases, matched case-insensitively as whole words.
const COUNTRIES: Record<string, string[]> = {
  AT: ['Austria', 'Österreich', 'Austrian'], BE: ['Belgium', 'België', 'Belgique', 'Belgian'], BG: ['Bulgaria', 'Bulgarian'],
  HR: ['Croatia', 'Hrvatska', 'Croatian'], CY: ['Cyprus', 'Cypriot'], CZ: ['Czechia', 'Czech Republic', 'Czech'],
  DK: ['Denmark', 'Danmark', 'Danish'], EE: ['Estonia', 'Estonian'], FI: ['Finland', 'Suomi', 'Finnish'],
  FR: ['France', 'French'], DE: ['Germany', 'Deutschland', 'German'], GR: ['Greece', 'Greek'],
  HU: ['Hungary', 'Magyarország', 'Hungarian'], IE: ['Ireland', 'Irish'], IT: ['Italy', 'Italia', 'Italian'],
  LV: ['Latvia', 'Latvian'], LT: ['Lithuania', 'Lithuanian'], LU: ['Luxembourg'], MT: ['Malta', 'Maltese'],
  NL: ['Netherlands', 'The Netherlands', 'Nederland', 'Holland', 'Dutch'], PL: ['Poland', 'Polska', 'Polish'],
  PT: ['Portugal', 'Portuguese'], RO: ['Romania', 'Romanian'], SK: ['Slovakia', 'Slovak'], SI: ['Slovenia', 'Slovenian'],
  ES: ['Spain', 'España', 'Spanish'], SE: ['Sweden', 'Sverige', 'Swedish'],
  GB: ['United Kingdom', 'Great Britain', 'Britain', 'British', 'England', 'Scotland', 'Wales', 'Northern Ireland', 'U.K.'],
  US: ['United States', 'United States of America', 'U.S.', 'U.S.A.'],
  CH: ['Switzerland', 'Schweiz', 'Suisse', 'Svizzera', 'Swiss'], NO: ['Norway', 'Norge', 'Norwegian'],
  IN: ['India', 'Indian'], PH: ['Philippines', 'Filipino'], MX: ['Mexico', 'México', 'Mexican'],
  ZA: ['South Africa', 'South African'], PK: ['Pakistan', 'Pakistani'], UA: ['Ukraine', 'Ukrainian'],
  RS: ['Serbia', 'Serbian'], BA: ['Bosnia and Herzegovina', 'Bosnia'], TR: ['Turkey', 'Türkiye', 'Turkish'],
  EG: ['Egypt', 'Egyptian'], BR: ['Brazil', 'Brasil', 'Brazilian'], AR: ['Argentina', 'Argentinian'],
  CO: ['Colombia', 'Colombian'], VN: ['Vietnam', 'Viet Nam', 'Vietnamese'], ID: ['Indonesia', 'Indonesian'],
  AE: ['United Arab Emirates', 'UAE'], AL: ['Albania', 'Albanian'], CA: ['Canada', 'Canadian'],
  AU: ['Australia', 'Australian'], EC: ['Ecuador'],
};

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia',
  'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
  'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania',
  'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia',
];
const US_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
];

// Cities seen in postings.location plus the obvious ones for the target countries. A country name in the same
// text wins over a city ("Lincoln, England" is GB by "England"), so ambiguous cities are left out.
const CITIES: Record<string, string[]> = {
  GB: [
    'London', 'Leeds', 'Manchester', 'Southampton', 'Birmingham', 'Nottingham', 'Bristol', 'Cambridge', 'Coventry',
    'Croydon', 'Derby', 'Doncaster', 'Leicester', 'Liverpool', 'Milton Keynes', 'Newcastle upon Tyne', 'Northampton',
    'Oxford', 'Reading', 'Sheffield', 'Watford', 'York', 'Shrewsbury', 'Edinburgh', 'Glasgow', 'Cardiff', 'Belfast',
  ],
  DE: [
    'Berlin', 'Cologne', 'Köln', 'Munich', 'München', 'Hamburg', 'Dortmund', 'Düsseldorf', 'Frankfurt', 'Unterföhring',
    'Stuttgart', 'Gescher', 'Leipzig',
  ],
  ES: ['Barcelona', 'Madrid', 'Valencia'], NL: ['Amsterdam', 'Utrecht', 'Rotterdam', 'Groningen', 'Eindhoven', 'Den Haag', 'The Hague'],
  SE: ['Stockholm', 'Göteborg', 'Gothenburg', 'Malmö', 'Lund', 'Linköping', 'Johanneshov', 'Uppsala'],
  DK: ['Copenhagen', 'København', 'Nordhavn', 'Ballerup', 'Aarhus', 'Aalborg', 'Odense'],
  NO: ['Oslo', 'Bergen', 'Trondheim', 'Tønsberg', 'Kristiansand', 'Stavanger'],
  FI: ['Helsinki', 'Tampere', 'Turku', 'Espoo', 'Oulu', 'Kuopio', 'Jyväskylä', 'Lappeenranta', 'Seinäjoki', 'Hervanta', 'Vantaa'],
  PL: ['Wrocław', 'Wroclaw', 'Kraków', 'Krakow', 'Warsaw', 'Warszawa', 'Poznań', 'Poznan', 'Gdańsk', 'Gdansk'],
  HR: ['Zagreb', 'Split', 'Rijeka', 'Osijek'], AT: ['Vienna', 'Wien', 'Bregenz', 'Graz', 'Linz'],
  BE: ['Antwerpen', 'Antwerp', 'Brussels', 'Ghent', 'Gent'], PT: ['Lisbon', 'Lisboa', 'Porto'], BG: ['Sofia'],
  CH: ['Zürich', 'Zurich', 'Geneva', 'Basel', 'Bern'], IE: ['Dublin', 'Cork'], FR: ['Paris', 'Lyon'], CZ: ['Prague'],
  US: [
    'Chicago', 'New York', 'Minneapolis', 'Kansas City', 'Boston', 'San Francisco', 'Seattle', 'Austin', 'Los Angeles',
    'Dallas', 'Denver', 'Atlanta', 'Mountain View', 'San Diego', 'Westerville', 'Parkville',
  ],
  IN: [
    'Ahmedabad', 'Pune', 'Bangalore', 'Bengaluru', 'Chennai', 'Hyderabad', 'Thiruvananthapuram', 'Mumbai', 'Delhi',
    'Noida', 'Gurgaon', 'Kochi',
  ],
  MX: ['Mexico City', 'Guadalajara'], ZA: ['Cape Town', 'Johannesburg'], PH: ['Davao', 'Manila', 'Cebu'], AL: ['Tirana'],
  CA: ['Montreal', 'Toronto', 'Vancouver'], AU: ['Melbourne', 'Sydney'], EC: ['Quito'],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Longest alternative first, so "New Mexico" beats "Mexico" and "Northern Ireland" beats "Ireland" at one position.
function table(entries: [string, string][], flags: string): { re: RegExp; codes: Map<string, string> } {
  const codes = new Map(entries.map(([name, code]) => [name.toLowerCase(), code]));
  const alts = [...codes.keys()].sort((a, b) => b.length - a.length).map(escape);
  return { re: new RegExp(`(?<![\\p{L}])(${alts.join('|')})(?![\\p{L}])`, flags), codes };
}

const countryTable = table([
  ...Object.entries(COUNTRIES).flatMap(([code, names]) => names.map((n): [string, string] => [n, code])),
  ...US_STATES.map((n): [string, string] => [n, 'US']),
], 'giu');
const cityTable = table(Object.entries(CITIES).flatMap(([code, names]) => names.map((n): [string, string] => [n, code])), 'giu');
// Case-sensitive: "US", "UK", "USA" and a state code after a comma ("Parkville, MO").
const SHORT = /(?<![\p{L}])(USA|US|UK)(?![\p{L}])|,\s*([A-Z]{2})(?![\p{L}])/gu;
const STATE_CODES = new Set(US_STATE_CODES);

// [index, code] of every match in text.
function matches(text: string, t: { re: RegExp; codes: Map<string, string> }): [number, string][] {
  return [...text.matchAll(t.re)].map((m) => [m.index, t.codes.get(m[1].toLowerCase())!]);
}

function shortMatches(text: string): [number, string][] {
  const out: [number, string][] = [];
  for (const m of text.matchAll(SHORT)) {
    const code = m[1] ?? m[2];
    if (code === 'UK') out.push([m.index, 'GB']);
    else if (code === 'US' || code === 'USA' || STATE_CODES.has(code)) out.push([m.index, 'US']);
  }
  return out;
}

const first = (ms: [number, string][]) => ms.sort((a, b) => a[0] - b[0])[0]?.[1] ?? null;

// A whole value that names one country: "United States", "Albania", "GB", "gb".
function countryOf(value: string): string | null {
  const v = value.trim();
  const named = first([...matches(v, countryTable), ...shortMatches(v)]);
  if (named) return named;
  return /^[a-z]{2}$/i.test(v) ? v.toUpperCase() : null;
}

const asRecord = (raw: unknown): Record<string, unknown> =>
  typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};

const any = (...res: RegExp[]) => new RegExp(res.map((r) => r.source).join('|'), 'iu');
const TEXT_REMOTE = any(/remote/, /anywhere/, /work from home/, /home[ -]?office/, /distributed(?! system)/, /telecommut/);
const TEXT_HYBRID = /hybrid/iu;
const BODY_REMOTE = any(/fully remote/, /100% remote/, /remote[ -]first/, /work remotely/);
// Not "hybrid cloud", "hybride cloudomgevingen", "hybrid search": seen in bodies on 2026-11-04.
const BODY_HYBRID = any(
  /hybrid(?!e?[ -]?(cloud|search))/, /\d+ days? (per|a) week (in|at) (the )?office/, /days? on[- ]?site/, /in[- ]office \d+ days/,
);
const BODY_ONSITE = any(/on-site only/, /onsite only/, /in the office full[- ]time/);

export function workMode(title: string, location: string | null, body: string, raw: unknown): WorkMode {
  const r = asRecord(raw);
  const workplace = typeof r.workplace_type === 'string' ? r.workplace_type.toLowerCase() : null;
  if (r.remote === true || r.is_remote === true || r.telecommuting === true || workplace === 'remote') return 'remote';
  if (r.hybrid === true || workplace === 'hybrid') return 'hybrid';
  if (r.on_site === true) return 'onsite';
  const text = `${title}\n${location ?? ''}`;
  if (TEXT_REMOTE.test(text)) return 'remote';
  if (TEXT_HYBRID.test(text)) return 'hybrid';
  if (BODY_REMOTE.test(body)) return 'remote';
  if (BODY_HYBRID.test(body)) return 'hybrid';
  if (BODY_ONSITE.test(body)) return 'onsite';
  return 'unknown';
}

// ISO 3166-1 alpha-2 or null. Raw country fields, then country names in the location, then cities, then the
// company's seed country for a remote posting that names none ("Remote", "Remote (Global)"). Pass the posting's
// mode when it is known; without it, only raw flags and the location text decide whether it is remote.
export function workCountry(
  location: string | null, raw: unknown, companyCountry: string, mode: WorkMode = workMode('', location, '', raw),
): string | null {
  const r = asRecord(raw);
  const fields = [...(Array.isArray(r.countries) ? r.countries : []), r.country, r.country_code];
  for (const f of fields) {
    const code = typeof f === 'string' ? countryOf(f) : null;
    if (code) return code;
  }
  const text = location ?? '';
  const named = first([...matches(text, countryTable), ...shortMatches(text)]) ?? first(matches(text, cityTable));
  if (named) return named;
  return mode === 'remote' && companyCountry ? companyCountry.toUpperCase() : null;
}

// The owner's home country: remote restricted to it is plain `remote:HR`, not `remote:HR-only`.
export const HOME = 'HR';

type Span = { start: number; end: number; code: string };

// Every country, US state and US/UK/USA/state-code mention in text, with its extent.
function spans(text: string): Span[] {
  const out: Span[] = [];
  for (const m of text.matchAll(countryTable.re)) {
    out.push({ start: m.index, end: m.index + m[0].length, code: countryTable.codes.get(m[1].toLowerCase())! });
  }
  for (const m of text.matchAll(SHORT)) {
    const code = m[1] ?? m[2];
    const iso = code === 'UK' ? 'GB' : code === 'US' || code === 'USA' || STATE_CODES.has(code) ? 'US' : null;
    if (iso) out.push({ start: m.index, end: m.index + m[0].length, code: iso });
  }
  return out.sort((a, b) => a.start - b.start);
}

const citySpans = (text: string): Span[] =>
  [...text.matchAll(cityTable.re)].map((m) => ({ start: m.index, end: m.index + m[0].length, code: cityTable.codes.get(m[1].toLowerCase())! }));

const reSpans = (text: string, re: RegExp): Span[] =>
  [...text.matchAll(new RegExp(re.source, 'giu'))].map((m) => ({ start: m.index, end: m.index + m[0].length, code: '' }));

// Scopes that include Croatia. "anywhere" alone is wide; "anywhere in the US" is not.
const WIDE = /(?<![\p{L}])(?:world ?wide|global(?:ly)?|international(?:ly)?|EMEA|EEA|EU|Europe|European Union|European|anywhere(?!\s+(?:in|within)\b))(?![\p{L}])/iu;
const REMOTE_WORD = /(?<![\p{L}])remote(?![\p{L}])/iu;
// Between "remote" and the country: punctuation, "in", "within", "from", "the". "Remote (United States)",
// "Remote - US", "Remote, Germany", "United States (Remote)", "Remote within the UK".
const GAP = /^[\s()[\],/|\-–—:;]*(?:(?:in|within|from)\s+)?(?:the\s+)?$/iu;
// A tied country stands as its own segment ("US-based" and "US-only" allowed), so "Remote German-speaking
// Engineer" is not Germany.
const SEGMENT_AFTER = /^\s*(?:$|only\b|-(?:based|only)\b|-(?![\p{L}])|[()[\],/|–—:;.])/iu;
const SEGMENT_BEFORE = /(?:^|[()[\],/|\-–—:;])\s*$/u;

// Countries (or wide scopes) written next to the word "remote" in a title or location.
function tied(text: string, targets: Span[]): Span[] {
  const remotes = reSpans(text, REMOTE_WORD);
  return targets.filter((t) => remotes.some((r) =>
    (r.end <= t.start && GAP.test(text.slice(r.end, t.start)) && SEGMENT_AFTER.test(text.slice(t.end))) ||
    (t.end <= r.start && GAP.test(text.slice(t.end, r.start)) && SEGMENT_BEFORE.test(text.slice(0, t.start)))));
}

// wide: a scope that includes Croatia, final. several: more than one country, which leaves the body to decide.
type Stated = { kind: 'wide' } | { kind: 'several' } | { kind: 'country'; code: string } | null;

const distinct = (ss: Span[]) => [...new Set(ss.map((s) => s.code))];

// Title: only a country or wide scope tied to "remote" counts ("Senior Engineer (Remote, US)").
function titleScope(title: string): Stated {
  if (tied(title, reSpans(title, WIDE)).length) return { kind: 'wide' };
  const codes = distinct(tied(title, spans(title)));
  if (codes.length > 1) return { kind: 'several' };
  return codes.length ? { kind: 'country', code: codes[0] } : null;
}

// Location: a wide word anywhere is a stated scope that includes Croatia. More than one country (cities included,
// "Remote (United States), Canada") is no single-country scope. One country counts when it is tied to "remote" or
// is all the location says ("United States").
function locationScope(location: string): Stated {
  if (WIDE.test(location)) return { kind: 'wide' };
  const named = spans(location);
  const all = distinct([...named, ...citySpans(location)]);
  if (all.length > 1) return { kind: 'several' };
  if (!named.length) return null;
  let rest = location;
  for (const s of [...named].reverse()) rest = rest.slice(0, s.start) + rest.slice(s.end);
  const onlyCountry = /^[\s()[\],/|\-–—:;.&]*(?:(?:remote|only|or|and|based)[\s()[\],/|\-–—:;.&]*)*$/iu.test(rest);
  return tied(location, named).length || onlyCountry ? { kind: 'country', code: named[0].code } : null;
}

// Body phrases that restrict where the person works, each followed by the country it names. Derived from live
// postings on 2026-11-05: "remote work anywhere in the United States", "can be located from anywhere in the United
// States", "can be based from any location in the United States", "must be based in the United States", "All
// applicants must live and work in the United States", "Must be legally authorized to work in the United States",
// "Must be authorized to work legally in the US", "Legal right to work in the US", "Right to Work in the UK",
// "open to remote work in the US", "Location: Remote (US-based)", "this position is based in Sweden".
// Not here on purpose, all seen on 2026-11-05: "Our entire team resides in / is U.S.-based" and "100% US-based remote
// team" (the team, not the hire), "clients are mostly US-based organizations", "preference for candidates based in
// Canada", "Preferably located in the Philippines", "401k Plan (USA only)" (benefits), "within the UK" without a
// work word before it ("the leading agency within the UK").
const BEFORE_COUNTRY = [
  /\banywhere (?:in|within|across|throughout) /,
  /\bany location (?:in|within) /,
  /\b(?:remote|remotely|work|working|based|located|live|living|reside|residing|candidates|applicants) within /,
  /\bremote(?:ly)?(?: work| working| role| position| opportunity)? (?:in|from) /,
  /\bremote ?[(\-–—:,|] ?/,
  /\bmust (?:currently )?(?:be )?(?:based|located|resident|residing|living|reside|live)(?: and work)? (?:in|within) /,
  /\b(?:need|needs|required|have) to (?:be )?(?:based|located|resident|living|reside|live)(?: and work)? (?:in|within) /,
  /\b(?:position|role|job) is (?:based|located) in /,
  /\b(?:authori[sz]ed|eligible|entitled|permitted|right) to work(?: legally| lawfully| permanently)? (?:in|within|for) /,
  /\bauthori[sz]ation to work (?:in|within|for) /,
  /\b(?:open|limited|restricted) (?:only )?to (?:candidates|applicants|residents|people)(?: based| located| living| residing)? (?:in|of|from) /,
];
// "based in X only".
const BASED_ONLY = /\bbased in /;
// After the country: "X-based candidates", "X-based applicants only", "(US-based only)".
const BASED_AFTER = /^-based (?:candidates|applicants|individuals|professionals|residents|talent|only)\b/i;
// The country is not the scope when a word like these follows it: "remote within US time zones", "in the US market".
const NOT_A_PLACE = /^[\s-]*(?:speaking|language|time ?zones?|hours|business hours|market|clients|customers|companies|organi[sz]ations)\b/i;
// Restrictions that name no country: they restrict to the posting's work_country.
const COUNTRYLESS = [
  /\bwork(?:ing)? (?:authori[sz]ation|permit|visa) (?:is )?required/,
  /\bno (?:visa |immigration )?sponsorship/,
  /\bnot eligible for (?:visa |immigration )?sponsorship/,
  /\bwithout (?:the need for )?(?:any )?(?:current or future |company |employer |visa |immigration )*sponsorship/,
  /\b(?:unable to|not able to|can ?not|can't|do not|does not|don't|doesn't|will not|won't)(?: currently)?(?: offer| provide)?(?: visa| immigration)? sponsor(?:ship)?\b/,
  /\bvisa sponsorship (?:is )?not (?:available|offered|provided)/,
];
// Restricting words followed by a scope that includes Croatia: "remote anywhere in Europe", "eligible to work in the EU".
const WIDE_AFTER = /^(?:the )?(?:EU|EEA|Europe|European Union|EMEA|world)\b|^(?:anywhere|worldwide|globally)\b/i;
const BODY_WIDE = /\b(?:work|working) from anywhere\b(?! (?:in|within)\b)|\bremote(?:ly)? (?:from )?(?:anywhere|worldwide|globally)\b(?! (?:in|within)\b)/i;
const LIST_SEP = /^\s*(?:,|\/|&|\bor\b|\band\b)\s*(?:the )?/i;

type BodyHit = { kind: 'wide' } | { kind: 'country'; codes: string[] };

// Countries in a list starting at pos, and where the list ends: "the US or Canada" is [US, CA].
function listAt(text: string, pos: number, all: Span[]): { codes: string[]; end: number } {
  const at = (p: number) => all.find((s) => s.start === p);
  let p = pos + (/^the /i.exec(text.slice(pos))?.[0].length ?? 0);
  const codes: string[] = [];
  let end = pos;
  for (let s = at(p); s; s = at(p)) {
    if (NOT_A_PLACE.test(text.slice(s.end))) break;
    codes.push(s.code);
    end = s.end;
    const sep = LIST_SEP.exec(text.slice(s.end));
    if (!sep) break;
    p = s.end + sep[0].length;
  }
  return { codes, end };
}

function bodyHits(body: string): BodyHit[] {
  const all = spans(body);
  const hits: BodyHit[] = [];
  for (const re of BEFORE_COUNTRY) {
    for (const m of body.matchAll(new RegExp(re.source, 'giu'))) {
      const pos = m.index + m[0].length;
      if (WIDE_AFTER.test(body.slice(pos))) { hits.push({ kind: 'wide' }); continue; }
      const { codes } = listAt(body, pos, all);
      if (codes.length) hits.push({ kind: 'country', codes });
    }
  }
  for (const m of body.matchAll(new RegExp(BASED_ONLY.source, 'giu'))) {
    const { codes, end } = listAt(body, m.index + m[0].length, all);
    if (codes.length && /^\s*only\b/i.test(body.slice(end))) hits.push({ kind: 'country', codes });
  }
  for (const s of all) if (BASED_AFTER.test(body.slice(s.end))) hits.push({ kind: 'country', codes: [s.code] });
  if (BODY_WIDE.test(body)) hits.push({ kind: 'wide' });
  return hits;
}

// The one country a remote posting restricts remote work to, or null when it states none, states several, or states
// a scope that includes Croatia (worldwide, EU, Europe, EMEA). Title and location first: a wide scope there wins over
// the body, one country there is the answer. When they name several countries or disagree, the body decides: "United
// States, Canada" with "All applicants must live and work in the United States" is US. Then body phrases naming a
// country, then phrases naming none ("no visa sponsorship"), which restrict to `country`, the posting's
// work_country. Only meaningful for mode `remote`.
export function remoteScope(title: string, location: string | null, body: string, country: string | null): string | null {
  const t = titleScope(title);
  const l = locationScope(location ?? '');
  if (t?.kind === 'wide' || l?.kind === 'wide') return null;
  const codes = [...new Set([t, l].flatMap((s) => (s?.kind === 'country' ? [s.code] : [])))];
  if (codes.length === 1 && t?.kind !== 'several' && l?.kind !== 'several') return codes[0];

  const text = body.replace(/\s+/g, ' ');
  const hits = bodyHits(text);
  const named = hits.flatMap((h) => (h.kind === 'country' ? [h.codes] : []));
  if (named.length) {
    const codes = [...new Set(named.flat())];
    return codes.length === 1 ? codes[0] : null;
  }
  if (hits.some((h) => h.kind === 'wide')) return null;
  return country && COUNTRYLESS.some((re) => new RegExp(re.source, 'iu').test(text)) ? country : null;
}

const SPLIT = /(?<![\p{L}])split(?![\p{L}])/iu;

// scope is remoteScope() for a remote posting: HR stays `remote:HR`, outside ELIGIBLE drops as `location:XX`, any
// other country is `remote:XX-only`.
export function eligible(
  mode: WorkMode, country: string | null, location: string | null, scope: string | null = null,
): { ok: boolean; reason: string } {
  const tag = (m: string) => (country ? `${m}:${country}` : m);
  if (country && !ELIGIBLE.has(country)) return { ok: false, reason: `location:${country}` };
  if (mode === 'onsite') return SPLIT.test(location ?? '') ? { ok: true, reason: 'onsite:split' } : { ok: false, reason: tag('onsite') };
  if (mode === 'remote' && scope) {
    if (!ELIGIBLE.has(scope)) return { ok: false, reason: `location:${scope}` };
    return { ok: true, reason: scope === HOME ? `remote:${HOME}` : `remote:${scope}-only` };
  }
  return { ok: true, reason: tag(mode) };
}

// An employer (companies.kind = 'employer') is held to a stricter rule than an agency, so one with hundreds of office
// roles abroad cannot fill a card: a posting is kept only when it is remote with no single-country scope other than HR
// (scope is remoteScope(): null for worldwide, Europe, EMEA, several countries or none stated), or when it is in HR
// whatever the mode. Checked before eligible(), which still applies to what this keeps (a remote posting read as
// India drops as `location:IN`, on-site in Zagreb as `onsite:HR`).
export function employerEligible(
  mode: WorkMode, country: string | null, scope: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (country === HOME) return { ok: true };
  if (mode !== 'remote') return { ok: false, reason: 'employer:not-remote' };
  if (scope && scope !== HOME) return { ok: false, reason: `employer:${scope}-only` };
  return { ok: true };
}
