import { XMLParser } from 'fast-xml-parser';
import { htmlToText } from '../../core/html.ts';
import { toIso, type AtsAdapter } from './types.ts';

// Keyless RSS 2.0 per career portal at {host}/jobs/{Portal}/rss, with the full description in each item.
// The feed needs the portal name, so the slug is `{account}/{Portal}` (ziffity/Ziffity-Job-Opening), or
// `{host}/{Portal}` for regional boards (acme.zohorecruit.eu/Careers-Portal). Verified live 2026-11-04 on
// ziffity (1 job). A wrong portal is a 200 application/rss+xml with the plain text "Oops! It seems that the
// joblist has been removed."; a dead account is a 200 HTML "Page does not exist". Neither is XML, so parse throws.
//
// item -> guid -> external_id, title, link without ?source=RSS -> url, description -> body, the text after
//         "Location:" in the description's prefix -> location, pubDate (RFC 822, US zone) -> posted_at;
//         the text after "Category:" -> raw.category.

const xml = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

const list = <T>(v: T | T[] | undefined | null | ''): T[] => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : [v]);

interface Item { title?: string; link?: string; guid?: string; pubDate?: string; description?: string }

function split(slug: string): { host: string; portal: string } {
  const i = slug.indexOf('/');
  if (i <= 0 || i === slug.length - 1) throw new Error(`zoho: slug must be {account}/{Portal}, got ${slug}`);
  const account = slug.slice(0, i);
  return { host: account.includes('.') ? account : `${account}.zohorecruit.com`, portal: slug.slice(i + 1) };
}

export const zoho: AtsAdapter = {
  vendor: 'zoho',
  feedUrl(slug) {
    const { host, portal } = split(slug);
    return `https://${host}/jobs/${encodeURIComponent(portal)}/rss`;
  },
  parse(text) {
    const head = text.trimStart();
    if (!head.startsWith('<?xml') && !head.startsWith('<rss')) {
      throw new Error(`zoho: not an RSS feed (${head.slice(0, 60).replace(/\s+/g, ' ')})`);
    }
    const channel = (xml.parse(text) as { rss?: { channel?: { item?: Item | Item[] } | '' } }).rss?.channel;
    if (channel === undefined) throw new Error('zoho: missing <rss><channel>');
    const items = channel === '' ? [] : list(channel.item);
    return items.map((i) => {
      const html = i.description ?? '';
      const link = (i.link ?? '').trim();
      const id = (i.guid ?? '').trim() || link.match(/\/jobs\/[^/]+\/(\d+)/)?.[1];
      if (!id || !link) throw new Error('zoho: item without guid or link');
      return {
        external_id: id,
        title: (i.title ?? '').trim() || id,
        location: html.match(/Location:([^<]*)</)?.[1].trim() || null,
        url: link.split('?')[0],
        body: htmlToText(html),
        posted_at: toIso(i.pubDate),
        raw: { category: html.match(/Category:([^<]*)</)?.[1].trim() || null },
      };
    });
  },
};
