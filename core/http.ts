// Guardrails from SPEC: 1 req/s per host, backoff on 429/5xx, real User-Agent.

export const BACKOFF_MS = [2000, 8000];  // exported so tests can shorten it
const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

export class HttpError extends Error {
  constructor(readonly status: number, readonly url: string, message?: string) {
    super(message ?? `HTTP ${status} ${url}`);
  }
}

export interface FetchResult {
  status: number;
  url: string;          // final URL after redirects
  contentType: string;
  text: string;
  headers: Record<string, string>;
}

const nextSlot = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Reserves the next free 1s slot for the host synchronously, so concurrent callers queue up.
async function waitTurn(host: string): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, at + 1000);
  if (at > now) await sleep(at - now);
}

// AGENTS.md rule 4: a real User-Agent naming the company and a contact URL.
export const USER_AGENT = 'ant-hive-pipeline/0.1 (+https://anthive.dev/contact)';

// Follows redirects by hand so every hop waits its turn on its own host.
async function fetchFollowing(
  url: string,
  opts: { method?: string; body?: string; headers?: Record<string, string> },
  ua: string,
): Promise<{ res: Response; url: string }> {
  let current = url;
  let method = opts.method ?? 'GET';
  let body = opts.body;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await waitTurn(new URL(current).host);
    const res = await fetch(current, {
      method,
      body,
      headers: { 'user-agent': ua, ...opts.headers },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) return { res, url: current };
    await res.body?.cancel();
    current = new URL(location, current).href;
    if (res.status === 303) { method = 'GET'; body = undefined; }
  }
  throw new HttpError(0, url, `more than ${MAX_REDIRECTS} redirects ${url}`);
}

export async function fetchText(
  url: string,
  opts: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<FetchResult> {
  const ua = USER_AGENT;
  for (let attempt = 0; ; attempt++) {
    try {
      const { res, url: finalUrl } = await fetchFollowing(url, opts, ua);
      const text = await res.text();
      if (res.ok) {
        return {
          status: res.status,
          url: finalUrl,
          contentType: res.headers.get('content-type') ?? '',
          text,
          headers: Object.fromEntries(res.headers),
        };
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= BACKOFF_MS.length) throw new HttpError(res.status, url);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      // network error or timeout: retried like a 5xx, reported as status 0
      if (attempt >= BACKOFF_MS.length) throw new HttpError(0, url, `${(err as Error).message} ${url}`);
    }
    await sleep(BACKOFF_MS[attempt]);
  }
}
