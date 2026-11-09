// Decoder for the loader data React Router (v7 "single fetch") inlines into server-rendered pages:
// `window.__reactRouterContext.streamController.enqueue("<turbo-stream>")`. The payload's first line is one flat
// JSON array; element 0 is the root, objects are {"_<key index>": <value index>}, arrays hold value indices, negative
// indices are constants and ["D", ms]-style arrays are typed values. Deferred data (promises, later lines) is
// dropped. Pure: no I/O.

const NULL = -5;

export function turboStreamData(html: string): unknown {
  const m = /streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)/.exec(html);
  if (!m) throw new Error('turbo-stream: page has no streamController.enqueue payload');
  const stream = JSON.parse(m[1]) as string;
  const flat = JSON.parse(stream.split('\n')[0]) as unknown[];
  if (!Array.isArray(flat)) throw new Error('turbo-stream: payload is not an array');
  const memo = new Map<number, unknown>();
  const at = (i: number): unknown => {
    if (i === NULL) return null;
    if (i < 0) return undefined; // hole, undefined, NaN, infinities, -0: none matter for job data
    if (memo.has(i)) return memo.get(i);
    const v = flat[i];
    if (Array.isArray(v)) {
      if (typeof v[0] === 'string') return v[0] === 'D' ? new Date(v[1] as number).toISOString() : undefined;
      const out: unknown[] = [];
      memo.set(i, out);
      for (const j of v as number[]) out.push(at(j));
      return out;
    }
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      memo.set(i, out);
      for (const [k, j] of Object.entries(v as Record<string, number>)) out[String(flat[Number(k.slice(1))])] = at(j);
      return out;
    }
    return v;
  };
  return at(0);
}

// loaderData[route] of a decoded page, or throws naming the route.
export function loaderData(html: string, route: string): Record<string, unknown> {
  const root = turboStreamData(html) as { loaderData?: Record<string, unknown> } | null;
  const data = root?.loaderData?.[route];
  if (!data || typeof data !== 'object') throw new Error(`turbo-stream: no loader data for route ${route}`);
  return data as Record<string, unknown>;
}
