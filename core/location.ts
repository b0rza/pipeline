// Stage 3 location rule, from DECISIONS.md "Work arrangements the owner will take (2026-11-04)": remote in
// EU/UK/US/CH/NO is eligible, hybrid there is kept for the owner to judge, on-site only in Split. Pure: no db, no network.

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

const SPLIT = /(?<![\p{L}])split(?![\p{L}])/iu;

export function eligible(mode: WorkMode, country: string | null, location: string | null): { ok: boolean; reason: string } {
  const tag = (m: string) => (country ? `${m}:${country}` : m);
  if (country && !ELIGIBLE.has(country)) return { ok: false, reason: `location:${country}` };
  if (mode === 'onsite') return SPLIT.test(location ?? '') ? { ok: true, reason: 'onsite:split' } : { ok: false, reason: tag('onsite') };
  return { ok: true, reason: tag(mode) };
}
