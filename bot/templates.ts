// Fixed-string Compose template. SPEC-v2 "Later": model drafting only if this proves insufficient.

export function composeSubject(company: string): string {
  return `${company}: contract storefront engineering`;
}

// CRLF line breaks, as RFC 6068 asks for in a mailto body.
export function composeBody(company: string, titles: string[]): string {
  return [
    'Hi,',
    '',
    `I saw ${company} is hiring for:`,
    ...titles.map((t) => `- ${t}`),
    '',
    "I'm a contract commerce storefront engineer (Vue/Nuxt, React, commercetools, Salesforce Commerce). " +
      "If a contractor could take one of these on, or help the team that does, I'd be glad to talk.",
    '',
    'Ante',
  ].join('\r\n');
}

// No recipient: contact discovery is manual (docs/DECISIONS.md).
export function composeMailto(company: string, titles: string[]): string {
  return `mailto:?subject=${encodeURIComponent(composeSubject(company))}&body=${encodeURIComponent(composeBody(company, titles))}`;
}
