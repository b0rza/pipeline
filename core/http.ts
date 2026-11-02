// Guardrails from SPEC: 1 req/s per host, backoff on 429/5xx, real User-Agent.

const DEFAULT_UA = 'pipeline/0.1 (+https://example.invalid/contact; set PIPELINE_USER_AGENT)';
const BACKOFF_MS = [2000, 8000];
const TIMEOUT_MS = 20_000;

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

let warned = false;
function userAgent(): string {
  const ua = process.env.PIPELINE_USER_AGENT;
  if (ua) return ua;
  if (!warned) {
    warned = true;
    console.error('warning: PIPELINE_USER_AGENT not set, using a placeholder User-Agent');
  }
  return DEFAULT_UA;
}

export async function fetchText(
  url: string,
  opts: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<FetchResult> {
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    await waitTurn(host);
    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        body: opts.body,
        headers: { 'user-agent': userAgent(), ...opts.headers },
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await res.text();
      if (res.ok) {
        return {
          status: res.status,
          url: res.url || url,
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
