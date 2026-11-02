const named: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ', times: '×', deg: '°',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  hellip: '…', bull: '•', middot: '·', euro: '€', pound: '£', copy: '©', reg: '®', trade: '™', shy: '',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', agrave: 'à', egrave: 'è',
  ccedil: 'ç', ntilde: 'ñ', aring: 'å', Aring: 'Å', oslash: 'ø', Oslash: 'Ø', aelig: 'æ', AElig: 'Æ',
  scaron: 'š', Scaron: 'Š', ccaron: 'č', Ccaron: 'Č', zcaron: 'ž', Zcaron: 'Ž',
};

export function unescapeHtml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return named[e] ?? ''; // unknown named entity: drop it rather than leak it into the body
  });
}

const block = 'p|div|h[1-6]|li|ul|ol|tr|td|th|dt|dd|hr|table|section|article|header|footer|blockquote|pre';

export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(new RegExp(`</?(${block})(\\s[^>]*)?\\/?>`, 'gi'), '\n')
    .replace(/<[^>]*>/g, '');
  return unescapeHtml(text)
    .replace(/ /g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v\r]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
