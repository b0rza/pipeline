// Flag emoji for ISO 3166-1 alpha-2 codes, shown next to the code on the UI page and in the Telegram message.
// Pure: no db, no network. core/publish.ts does not use it; the out/ files stay plain text.

const A = 0x1f1e6; // REGIONAL INDICATOR SYMBOL LETTER A

// '' for anything that is not exactly two ASCII letters.
export function flag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => A + c.charCodeAt(0) - 65));
}

// Flag then code, `🇬🇧 GB`; the code alone when there is no flag. The code stays so the text is greppable
// and readable where flags render as two letters (Windows).
export const withFlag = (code: string) => (flag(code) ? `${flag(code)} ${code}` : code);

// route_reason from core/filter.ts with each location tag's country flagged: `perm · hybrid:GB` -> `perm · hybrid:🇬🇧 GB`.
// `onsite:split` is the city Split and is left alone; so is anything that is not a two-letter code.
export const routeTag = (reason: string) =>
  reason.replace(/\b(remote|hybrid|onsite|unknown|location):([A-Z]{2})\b/g, (_, mode: string, cc: string) => `${mode}:${withFlag(cc)}`);
