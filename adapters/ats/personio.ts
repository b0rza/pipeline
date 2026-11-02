import { XMLParser } from 'fast-xml-parser';
import { htmlToText } from '../../core/html.ts';
import { toIso, type AtsAdapter } from './types.ts';

const xml = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

const list = <T>(v: T | T[] | undefined | null | ''): T[] => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : [v]);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

interface Position {
  id: string;
  name: string;
  office?: string;
  additionalOffices?: { office?: string | string[] } | '';
  department?: string;
  jobDescriptions?: { jobDescription?: { name?: string; value?: string } | { name?: string; value?: string }[] } | '';
  employmentType?: string;
  seniority?: string;
  schedule?: string;
  keywords?: string;
  salaryInformation?: unknown;
  createdAt?: string;
}

export const personio: AtsAdapter = {
  vendor: 'personio',
  // No ?language=en: it blanks descriptions on German-only boards.
  feedUrl: (slug) => `https://${slug}.jobs.personio.de/xml`,
  parse(text, contentType, slug) {
    // A dead slug serves an HTML page, so check before trusting the parse.
    if (!/xml/i.test(contentType) || !text.includes('<workzag-jobs')) {
      throw new Error(`personio: not an XML feed (content-type ${contentType || 'none'})`);
    }
    const root = xml.parse(text)['workzag-jobs'] as { position?: Position | Position[] } | '' | undefined;
    if (root === undefined) throw new Error('personio: missing <workzag-jobs> root');
    const positions = root === '' ? [] : list(root.position);
    return positions.map((p) => {
      const additional = p.additionalOffices ? list(p.additionalOffices.office) : [];
      const offices = [str(p.office), ...additional.map(str)].filter((o): o is string => o !== null);
      const descriptions = p.jobDescriptions ? list(p.jobDescriptions.jobDescription) : [];
      const html = descriptions.map((d) => `<h3>${str(d.name) ?? ''}</h3>${str(d.value) ?? ''}`).join('\n');
      return {
        external_id: String(p.id),
        title: String(p.name).trim(),
        location: offices.length ? [...new Set(offices)].join(', ') : null,
        url: `https://${slug}.jobs.personio.de/job/${p.id}`,
        body: htmlToText(html),
        body_html: html || null,
        posted_at: toIso(p.createdAt),
        raw: {
          department: str(p.department),
          employment_type: str(p.employmentType),
          seniority: str(p.seniority),
          schedule: str(p.schedule),
          keywords: str(p.keywords),
          salary_information: p.salaryInformation ?? null,
        },
      };
    });
  },
};
