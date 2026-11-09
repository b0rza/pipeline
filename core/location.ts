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
  // The rest of ISO 3166-1, names and common variants only (no demonyms), so a posting in Japan reads as JP and not as
  // the company's country. Left out on purpose: "Georgia" (the US state wins, see US_STATES; the country is "Republic
  // of Georgia") and "Jersey" (New Jersey).
  AD: ['Andorra'], AF: ['Afghanistan'], AG: ['Antigua and Barbuda', 'Antigua'], AI: ['Anguilla'], AM: ['Armenia'],
  AO: ['Angola'], AQ: ['Antarctica'], AS: ['American Samoa'], AW: ['Aruba'], AX: ['Åland Islands', 'Aland Islands'],
  AZ: ['Azerbaijan'], BB: ['Barbados'], BD: ['Bangladesh'], BF: ['Burkina Faso'], BH: ['Bahrain'], BI: ['Burundi'],
  BJ: ['Benin'], BL: ['Saint Barthélemy'], BM: ['Bermuda'], BN: ['Brunei', 'Brunei Darussalam'],
  BO: ['Bolivia'], BQ: ['Bonaire', 'Caribbean Netherlands'], BS: ['Bahamas', 'The Bahamas'], BT: ['Bhutan'],
  BV: ['Bouvet Island'], BW: ['Botswana'], BY: ['Belarus'], BZ: ['Belize'], CC: ['Cocos Islands', 'Cocos (Keeling) Islands'],
  CD: ['Democratic Republic of the Congo', 'DR Congo', 'DRC', 'Congo-Kinshasa'], CF: ['Central African Republic'],
  CG: ['Republic of the Congo', 'Congo-Brazzaville', 'Congo'], CI: ["Côte d'Ivoire", "Cote d'Ivoire", 'Ivory Coast'],
  CK: ['Cook Islands'], CL: ['Chile'], CM: ['Cameroon'], CN: ['China', "People's Republic of China", 'PRC'],
  CR: ['Costa Rica'], CU: ['Cuba'], CV: ['Cabo Verde', 'Cape Verde'], CW: ['Curaçao', 'Curacao'], CX: ['Christmas Island'],
  DJ: ['Djibouti'], DM: ['Dominica'], DO: ['Dominican Republic'], DZ: ['Algeria'], EH: ['Western Sahara'],
  ER: ['Eritrea'], ET: ['Ethiopia'], FJ: ['Fiji'], FK: ['Falkland Islands'], FM: ['Micronesia'], FO: ['Faroe Islands'],
  GA: ['Gabon'], GD: ['Grenada'], GE: ['Republic of Georgia'], GF: ['French Guiana'], GG: ['Guernsey'], GH: ['Ghana'],
  GI: ['Gibraltar'], GL: ['Greenland'], GM: ['Gambia', 'The Gambia'], GN: ['Guinea'], GP: ['Guadeloupe'],
  GQ: ['Equatorial Guinea'], GS: ['South Georgia and the South Sandwich Islands'], GT: ['Guatemala'], GU: ['Guam'],
  GW: ['Guinea-Bissau'], GY: ['Guyana'], HK: ['Hong Kong'], HM: ['Heard Island and McDonald Islands'], HN: ['Honduras'],
  HT: ['Haiti'], IL: ['Israel'], IM: ['Isle of Man'], IO: ['British Indian Ocean Territory'], IQ: ['Iraq'], IR: ['Iran'],
  IS: ['Iceland'], JM: ['Jamaica'], JO: ['Jordan'], JP: ['Japan'], KE: ['Kenya'], KG: ['Kyrgyzstan'], KH: ['Cambodia'],
  KI: ['Kiribati'], KM: ['Comoros'], KN: ['Saint Kitts and Nevis'], KP: ['North Korea'],
  KR: ['South Korea', 'Republic of Korea', 'Korea'], KW: ['Kuwait'], KY: ['Cayman Islands'], KZ: ['Kazakhstan'],
  LA: ['Laos', 'Lao PDR'], LB: ['Lebanon'], LC: ['Saint Lucia'], LI: ['Liechtenstein'], LK: ['Sri Lanka'], LR: ['Liberia'],
  LS: ['Lesotho'], LY: ['Libya'], MA: ['Morocco'], MC: ['Monaco'], MD: ['Moldova'], ME: ['Montenegro'],
  MF: ['Saint Martin'], MG: ['Madagascar'], MH: ['Marshall Islands'], MK: ['North Macedonia', 'Macedonia'], ML: ['Mali'],
  MM: ['Myanmar', 'Burma'], MN: ['Mongolia'], MO: ['Macau', 'Macao'], MP: ['Northern Mariana Islands'], MQ: ['Martinique'],
  MR: ['Mauritania'], MS: ['Montserrat'], MU: ['Mauritius'], MV: ['Maldives'], MW: ['Malawi'], MY: ['Malaysia'],
  MZ: ['Mozambique'], NA: ['Namibia'], NC: ['New Caledonia'], NE: ['Niger'], NF: ['Norfolk Island'], NG: ['Nigeria'],
  NI: ['Nicaragua'], NP: ['Nepal'], NR: ['Nauru'], NU: ['Niue'], NZ: ['New Zealand', 'Aotearoa'], OM: ['Oman'],
  PA: ['Panama'], PE: ['Peru'], PF: ['French Polynesia'], PG: ['Papua New Guinea'], PM: ['Saint Pierre and Miquelon'],
  PN: ['Pitcairn Islands'], PR: ['Puerto Rico'], PS: ['Palestine'], PW: ['Palau'], PY: ['Paraguay'], QA: ['Qatar'],
  RE: ['Réunion', 'Reunion'], RU: ['Russia', 'Russian Federation'], RW: ['Rwanda'], SA: ['Saudi Arabia', 'KSA'],
  SB: ['Solomon Islands'], SC: ['Seychelles'], SD: ['Sudan'], SG: ['Singapore'], SH: ['Saint Helena'],
  SJ: ['Svalbard and Jan Mayen'], SL: ['Sierra Leone'], SM: ['San Marino'], SN: ['Senegal'], SO: ['Somalia'],
  SR: ['Suriname'], SS: ['South Sudan'], ST: ['São Tomé and Príncipe', 'Sao Tome and Principe'], SV: ['El Salvador'],
  SX: ['Sint Maarten'], SY: ['Syria'], SZ: ['Eswatini', 'Swaziland'], TC: ['Turks and Caicos Islands'], TD: ['Chad'],
  TF: ['French Southern Territories'], TG: ['Togo'], TH: ['Thailand'], TJ: ['Tajikistan'], TK: ['Tokelau'],
  TL: ['Timor-Leste', 'East Timor'], TM: ['Turkmenistan'], TN: ['Tunisia'], TO: ['Tonga'], TT: ['Trinidad and Tobago'],
  TV: ['Tuvalu'], TW: ['Taiwan'], TZ: ['Tanzania'], UG: ['Uganda'], UM: ['United States Minor Outlying Islands'],
  UY: ['Uruguay'], UZ: ['Uzbekistan'], VA: ['Vatican City', 'Holy See'], VC: ['Saint Vincent and the Grenadines'],
  VE: ['Venezuela'], VG: ['British Virgin Islands'], VI: ['U.S. Virgin Islands', 'US Virgin Islands'], VU: ['Vanuatu'],
  WF: ['Wallis and Futuna'], WS: ['Samoa'], XK: ['Kosovo'], YE: ['Yemen'], YT: ['Mayotte'], ZM: ['Zambia'],
  ZW: ['Zimbabwe'],
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

// Every country an adapter wrote into raw: `countries` (Teamtailor, Breezy, Deel), `country` (Workday, Lever,
// SmartRecruiters, BambooHR), `country_code`, in that order.
function rawCountries(raw: unknown): string[] {
  const r = asRecord(raw);
  const fields = [...(Array.isArray(r.countries) ? r.countries : []), r.country, r.country_code];
  return fields.flatMap((f) => (typeof f === 'string' ? [countryOf(f)].filter((c): c is string => !!c) : []));
}

// ISO 3166-1 alpha-2 or null. Raw country fields, then country names in the location, then cities, then the
// company's seed country for a remote posting that names none ("Remote", "Remote (Global)"). Pass the posting's
// mode when it is known; without it, only raw flags and the location text decide whether it is remote.
export function workCountry(
  location: string | null, raw: unknown, companyCountry: string, mode: WorkMode = workMode('', location, '', raw),
): string | null {
  const fromRaw = rawCountries(raw)[0];
  if (fromRaw) return fromRaw;
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

// --- Employer rule ---------------------------------------------------------------------------------------------------
// An employer (companies.kind = 'employer') hires in the places a posting names and nowhere else, so its postings are
// held to what they say about where the work may be done, not to the agency rule above. See employerRule().

// Scopes that include Croatia, by tag. "Eastern Europe", "Central Europe" and "CEE" count; Croatia is in them on most
// lists. Upper-case abbreviations match case-sensitively, everything else case-insensitively.
export type Cover = 'global' | 'europe' | 'emea';
const COVERS: Record<Cover, string[]> = {
  global: ['Global', 'Globally', 'Worldwide', 'World-wide', 'World wide', 'World', 'Anywhere', 'International', 'Internationally'],
  emea: ['EMEA', 'Europe, Middle East and Africa', 'Europe, the Middle East and Africa', 'Europe, Middle East & Africa'],
  europe: [
    'Europe', 'European Union', 'European Economic Area', 'EU', 'EEA', 'European time zones', 'European timezones',
    'European time zone', 'European timezone', 'European hours', 'CET', 'CEST', 'Central European Time', 'Central Europe',
    'Southern Europe', 'Eastern Europe', 'South-East Europe', 'Southeast Europe', 'South Eastern Europe',
    'Central and Eastern Europe', 'Central & Eastern Europe', 'CEE', 'Balkans', 'Western Balkans', 'UTC+1', 'UTC+2', 'GMT+1', 'GMT+2',
  ],
};
// Regions that leave Croatia out. The ones inside the US resolve to US, so "US East Coast" drops as `employer:US-only`.
const REGIONS_US = [
  'East Coast', 'West Coast', 'US East', 'US West', 'Bay Area', 'San Francisco Bay Area', 'Silicon Valley', 'Midwest',
  'Southwest', 'Northeast', 'Northwest', 'Southeast', 'Mid-Atlantic', 'Pacific Northwest',
  'Pacific Time', 'Eastern Time', 'Central Time', 'Mountain Time', 'EST', 'PST', 'CST', 'MST', 'EDT', 'PDT', 'ET', 'PT',
];
const REGIONS_ELSEWHERE = [
  'AMER', 'AMERS', 'Americas', 'North America', 'NORAM', 'NAMER', 'NA', 'LATAM', 'Latin America', 'South America',
  'Central America', 'Caribbean', 'APAC', 'APJ', 'APJC', 'Asia Pacific', 'Asia-Pacific', 'Asia', 'Southeast Asia',
  'South Asia', 'East Asia', 'ASEAN', 'ANZ', 'Oceania', 'Middle East', 'Middle Eastern', 'MENA', 'GCC', 'Africa',
  'Sub-Saharan Africa', 'Nordics', 'Nordic', 'Nordic countries', 'Scandinavia', 'DACH', 'Benelux', 'UK&I', 'UKI',
  'UK & Ireland', 'Iberia', 'Western Europe', 'Northern Europe',
];
// Region spans carry these codes; countries and cities carry their ISO code.
const ELSEWHERE = '@elsewhere';
const coverCode = (c: Cover) => `@${c}`;

function regionTable(): { cs: RegExp; ci: RegExp; codes: Map<string, string> } {
  const entries: [string, string][] = [
    ...(Object.entries(COVERS) as [Cover, string[]][]).flatMap(([c, names]) => names.map((n): [string, string] => [n, coverCode(c)])),
    ...REGIONS_US.map((n): [string, string] => [n, 'US']),
    ...REGIONS_ELSEWHERE.map((n): [string, string] => [n, ELSEWHERE]),
  ];
  const abbr = (n: string) => n === n.toUpperCase() && n.length <= 5;
  const codes = new Map(entries.map(([n, code]) => [abbr(n) ? n : n.toLowerCase(), code]));
  const build = (names: string[], flags: string) => new RegExp(
    `(?<![\\p{L}\\p{N}])(${names.sort((a, b) => b.length - a.length).map(escape).join('|')})(?![\\p{L}\\p{N}])`, flags);
  return {
    cs: build(entries.map(([n]) => n).filter(abbr), 'gu'), ci: build(entries.map(([n]) => n).filter((n) => !abbr(n)), 'giu'), codes,
  };
}
const regions = regionTable();

// Every place in text: countries, US states and codes, cities, covering scopes and regions. Where two overlap, the
// longer wins ("South Africa" over "Africa", "Western Europe" over "Europe"). "Anywhere in the US" is not a scope.
function places(text: string): Span[] {
  const found: Span[] = [...spans(text), ...citySpans(text)];
  for (const re of [regions.cs, regions.ci]) {
    for (const m of text.matchAll(re)) {
      const code = regions.codes.get(m[1]) ?? regions.codes.get(m[1].toLowerCase())!;
      if (/^anywhere$/i.test(m[1]) && /^\s+(?:in|within|across|throughout)\b/i.test(text.slice(m.index + m[0].length))) continue;
      found.push({ start: m.index, end: m.index + m[0].length, code });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Span[] = [];
  for (const s of found) if (!out.length || s.start >= out[out.length - 1].end) out.push(s);
  return out;
}

const isCover = (code: string) => code.startsWith('@') && code !== ELSEWHERE;
// The widest covering scope among codes: global, then EMEA, then Europe.
function widest(codes: string[]): Cover | null {
  for (const c of ['global', 'emea', 'europe'] as const) if (codes.includes(coverCode(c))) return c;
  return null;
}

// Words that say nothing about where: what is left of a location after these and its places is an unknown place.
const FILLER = new RegExp(String.raw`(?<![\p{L}])(?:remote|remotely|distributed|friendly|first|fully|100%|hybrid|office|offices|on-?site|on site|in-office|home|work|from|wfh|based|only|travel|required|flexible|locations?|multiple|various|any|all|n/?a|tbd|and|or|the|in|within|of|time ?zones?|hours|regions?|countries|hq|headquarters|job|position|opportunity|preferred|north|south|east|west|northern|southern|eastern|western|central|greater|metro|area)(?![\p{L}])`, 'giu');
const strip = (text: string, ss: Span[]) => {
  let rest = text;
  for (const s of [...ss].sort((a, b) => b.start - a.start)) rest = rest.slice(0, s.start) + ' ' + rest.slice(s.end);
  return rest.replace(FILLER, ' ');
};
const leftover = (text: string, ss: Span[]) => /[\p{L}\p{N}]/u.test(strip(text, ss));

// A title names a place only as a segment of its own: "Field Engineer - Japan", "Support Engineer (EMEA - Weekends)",
// "Engineering Manager | Remote | Europe", "Senior DBRE - Germany/Austria/UK". Not "Sales Engineer - Italian Speaking"
// (a language) and not "Global Payments Engineer".
// Also a US state or Canadian province code after a comma ("Senior Customer Engineer, Majors - Pittsburgh, PA") and
// "based in" a capitalised name ("Senior Presales Customer Engineer (based in Canberra)").
const CA_PROVINCES = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'ON', 'PE', 'QC', 'SK']);
function titlePlaces(title: string): Span[] {
  const out: Span[] = [];
  for (const seg of title.split(/[-–—|()[\],/:;_]+/u)) {
    const ss = places(seg);
    // "Vancouver BC": a city and its state or province code.
    const bare = seg.replace(/\s([A-Z]{2})\s*$/u, (m, code: string) => (STATE_CODES.has(code) || CA_PROVINCES.has(code) ? ' ' : m));
    if (ss.length && !leftover(bare, places(bare))) out.push(...ss);
  }
  for (const m of title.matchAll(/(?<=\p{L}),\s*([A-Z]{2})(?![\p{L}])/gu)) {
    const code = STATE_CODES.has(m[1]) ? 'US' : CA_PROVINCES.has(m[1]) ? 'CA' : null;
    if (code) out.push({ start: m.index, end: m.index + m[0].length, code });
  }
  for (const m of title.matchAll(/\bbased in ((?:\p{Lu}[\p{L}.'-]*\s?)+)/gu)) {
    const ss = places(m[1]);
    out.push(...(ss.length ? ss : [{ start: m.index, end: m.index + m[0].length, code: ELSEWHERE }]));
  }
  return out;
}

// After a body phrase like "open to candidates based in": the places listed there, "the US and Europe", "Europe,
// Africa, or Middle Eastern timezones", "Croatia, Serbia, Romania or Bulgaria". Stops at the first item that is not a place.
const ITEM_TAIL = /^\s*(?:time ?zones?|timezones?|hours|regions?|countries|only)\b/iu;
const ITEM_SEP = /^\s*(?:,\s*(?:(?:and|or)\s+)?|\/\s*|&\s*|(?:and\/or|and|or)\s+)(?:the\s+)?/iu;
function listAfter(text: string, pos: number, all: Span[]): string[] {
  const at = (p: number) => all.find((s) => s.start === p);
  let p = pos + (/^(?:the )/i.exec(text.slice(pos))?.[0].length ?? 0);
  const codes: string[] = [];
  for (let s = at(p); s; s = at(p)) {
    codes.push(s.code);
    let end = s.end;
    for (let t = ITEM_TAIL.exec(text.slice(end)); t; t = ITEM_TAIL.exec(text.slice(end))) end += t[0].length;
    const sep = ITEM_SEP.exec(text.slice(end));
    if (!sep) break;
    p = end + sep[0].length;
  }
  return codes;
}

// Body phrases that say where the hire may be, each followed by a list of places. Tested against the 4153 employer
// postings of 2026-11-09. Deliberately not here, all seen in those bodies: "our team works remotely across Europe"
// (n8n, every posting, also the US East Coast one), "opportunities across Southern EMEA", "distributed globally across
// the AMER, EMEA, and APAC regions" (GitLab), "a WeWork membership you can use anywhere in the world" (Supabase),
// "one of Europe's fastest-growing fintechs" (Mollie), "remote-first company across the US and Europe" (Linear, on an
// office-based APAC role).
const BODY_LISTS = [
  /\b(?:open|available) to (?:candidates|applicants|people|engineers|anyone)(?: who are)?(?: currently)?(?: based| located| living| residing)?(?: anywhere)? (?:in|from|within) /,
  /\b(?:looking for|seeking|considering|interested in|accepting applications from|hiring)(?: candidates| applicants| people| someone| engineers| talent)?(?: who are)?(?: based| located| living| residing)?(?: anywhere)? (?:in|from|within) /,
  /\b(?:you|candidates?|applicants?|you're|you are)(?: must| should| will| need to)?(?: be)?(?: currently)? (?:based|located|living|residing)(?: anywhere)? (?:in|within):? /,
  /(?:^|[-•*·:] )based (?:anywhere )?in:? /,
  /\bbased in: /,
  /\b(?:required |requires? (?:a )?)?(?:location|residency|residence)(?:\/location)? (?:is )?(?:in|within) /,
  /\bremote(?:ly)?(?: work| working| role| position)?(?: from| in| within)?(?: anywhere)? (?:in|within|from) /,
  /\b(?:work|working|hire|hiring|live|living|based|located)(?: remotely)?(?: from)?(?: almost)? anywhere (?:in|within|across|throughout) /,
  /\b(?:authori[sz]ed|eligible|entitled|permitted|right) to work(?: legally| lawfully| permanently)? (?:in|within|for) /,
  /\b(?:must|need to|needs to|have to|required to)(?: currently)?(?: be)? (?:based|located|resident|residing|living|reside|live)(?: and work)? (?:in|within) /,
  /\b(?:position|role|job) is (?:based|located) in /,
];
// Phrases that are a covering scope on their own.
const BODY_COVERS: [RegExp, Cover][] = [
  [/\bwork(?:ing)? (?:remotely )?from anywhere\b(?!\s+(?:in|within)\b)/, 'global'],
  [/\b(?:we hire|hiring|we recruit) (?:globally|worldwide|internationally|from anywhere)\b/, 'global'],
  [/\blooking for (?:[\p{L}-]+ ){0,4}(?:engineers|developers|people|talent) (?:from )?(?:worldwide|globally|all over the world)\b/u, 'global'],
  [/\b(?:EMEA)[ -]only\b/, 'emea'],
  [/\b(?:Europe|EU|EEA)[ -]only\b/, 'europe'],
];
// "Preferred time zones are UTC+1 to UTC+7", "between UTC-8 and UTC+2": a band that includes CET (UTC+1) or CEST (+2).
const UTC_BAND = /\b(?:time ?zones?|hours)\b[^.]{0,30}?\b(?:UTC|GMT) ?([+\-−–]) ?(\d{1,2})(?::\d\d)?\s*(?:to|and|-|–)\s*(?:UTC|GMT)? ?([+\-−–]) ?(\d{1,2})/iu;

// codes: places the body restricts the hire to. cover: Europe or EMEA named in those phrases. global: worldwide said
// anywhere ("We hire globally", "work from anywhere", "hire almost anywhere in the world"); that is company boilerplate
// on every posting (Supabase, Sourcegraph, Doist), so a restriction in the same body wins over it.
type BodySays = { codes: string[]; cover: Cover | null; global: boolean };
function bodySays(body: string): BodySays {
  const text = body.replace(/\s+/g, ' ');
  const all = places(text);
  const codes: string[] = [];
  for (const re of BODY_LISTS) {
    for (const m of text.matchAll(new RegExp(re.source, 'giu'))) codes.push(...listAfter(text, m.index + m[0].length, all));
  }
  // The agency rule's restrictions too: "US-based candidates only", "based in Spain only".
  for (const h of bodyHits(text)) if (h.kind === 'country') codes.push(...h.codes);
  // Pay by hire location lists where the hire may be (Cloudflare): "For Germany based hires: Estimated annual salary".
  for (const m of text.matchAll(/\bfor ([^.:;$€£]{2,120}?)[ -]based hires\b/giu)) {
    const ss = places(m[1]);
    codes.push(...(ss.length ? ss.map((s) => s.code) : [ELSEWHERE]));
  }
  for (const [re, c] of BODY_COVERS) if (new RegExp(re.source, 'iu').test(text)) codes.push(coverCode(c));
  const band = UTC_BAND.exec(text);
  if (band) {
    const n = (sign: string, h: string) => (sign === '+' ? 1 : -1) * Number(h);
    const [lo, hi] = [n(band[1], band[2]), n(band[3], band[4])].sort((a, b) => a - b);
    if (lo <= 2 && hi >= 1) codes.push(coverCode('europe'));
  }
  return {
    codes: codes.filter((c) => !isCover(c)), cover: widest(codes.filter((c) => c !== coverCode('global'))),
    global: codes.includes(coverCode('global')),
  };
}

// The drop reason for places that leave Croatia out: one country is `employer:XX-only`, anything else (several
// countries, a region, a place the tables do not know) is `employer:elsewhere`.
function elsewhere(codes: string[]): { keep: false; reason: string } {
  const distinct = [...new Set(codes)];
  return { keep: false, reason: distinct.length === 1 && distinct[0] !== ELSEWHERE ? `employer:${distinct[0]}-only` : 'employer:elsewhere' };
}

export type EmployerVerdict = { keep: true; home: true } | { keep: true; home: false; tag: string } | { keep: false; reason: string };

// Where an employer posting may be worked from, decided from what it says, first match wins:
//  1. Croatia named (location, an Ashby secondary location, a title segment, a body list, the raw country) → keep;
//     the caller tags it with eligible() as today (`remote:HR`, `hybrid:HR`, on-site outside Split drops).
//  2. Not remote → `employer:not-remote`.
//  3. The location ties places to "remote" ("Remote, Poland; Remote, United Kingdom", "Remote, AMER") and names no
//     covering scope → drop. That list is the hire list; a title's "EMEA" does not widen it.
//  4. A title segment names a covering scope ("Remote | Europe", "(EMEA)") → keep, `remote:europe` etc.
//  5. A title segment names another place ("- Japan", "(AMER/APAC)", "- US East Coast") → drop.
//  6. The location names a covering scope ("Remote, Global", "Europe", "Remote - EMEA") → keep.
//  7. A body phrase names Europe or EMEA (BODY_LISTS, "EU only", UTC_BAND) → keep.
//  8. A body phrase names other places ("open to candidates based in North America", "must be based in the US",
//     "For Germany based hires") → drop.
//  9. The body says worldwide ("We hire globally", "work from anywhere") → keep, `remote:global`. After 8 because it is
//     boilerplate: Sourcegraph says "hire almost anywhere in the world" and then "require ... located in the United States".
// 10. The location names any other place, a city or a word the tables do not know included ("San Francisco,
//     California", "London", "Sao Paulo") → drop.
// 11. Nothing named ("Remote", "Distributed", empty) → keep, `remote:unstated`, for the owner to judge.
// The title outranks the location because the location is often the board's default office (n8n: "Berlin Office" on
// every posting) or a blanket "Remote, Global" (Supabase "Platform Security Engineer (AMER/APAC)").
export function employerRule(title: string, location: string | null, body: string, raw: unknown, mode: WorkMode): EmployerVerdict {
  const r = asRecord(raw);
  const secondary = Array.isArray(r.secondary_locations) ? r.secondary_locations.filter((s): s is string => typeof s === 'string') : [];
  const loc = [location ?? '', ...secondary].filter(Boolean).join('; ');
  const locPlaces = places(loc);
  const rawCodes = rawCountries(raw);
  const tPlaces = titlePlaces(title);
  const said = bodySays(body);

  if ([...locPlaces, ...tPlaces].some((s) => s.code === HOME) || rawCodes.includes(HOME) || said.codes.includes(HOME)) {
    return { keep: true, home: true };
  }
  if (mode !== 'remote') return { keep: false, reason: 'employer:not-remote' };

  const locCover = widest(locPlaces.map((s) => s.code));
  const tiedPlaces = loc.split(/[;|\n]/).filter((seg) => REMOTE_WORD.test(seg)).flatMap(places);
  if (tiedPlaces.length && !locCover) return elsewhere(tiedPlaces.map((s) => s.code));
  const keep = (c: Cover) => ({ keep: true as const, home: false as const, tag: `remote:${c}` });
  const tCover = widest(tPlaces.map((s) => s.code));
  if (tCover) return keep(tCover);
  if (tPlaces.length) return elsewhere(tPlaces.map((s) => s.code));
  if (locCover) return keep(locCover);
  if (said.cover) return keep(said.cover);
  if (said.codes.length) return elsewhere(said.codes);
  if (said.global) return keep('global');
  const named = [...locPlaces.map((s) => s.code), ...rawCodes];
  if (named.length || leftover(loc, locPlaces)) return elsewhere(named.length ? named : [ELSEWHERE]);
  return { keep: true, home: false, tag: 'remote:unstated' };
}
