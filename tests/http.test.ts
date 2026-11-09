import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { BACKOFF_MS, fetchText, HttpError, USER_AGENT } from '../core/http.ts';

// Each test uses its own hosts: the 1 req/s slots are module state.
const realFetch = globalThis.fetch;
const realBackoff = [...BACKOFF_MS];
let calls: { url: string; at: number; ua: string | null }[];

function stub(respond: (url: string, n: number) => Response) {
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, at: Date.now(), ua: new Headers(init?.headers).get('user-agent') });
    return respond(url, calls.length);
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
  BACKOFF_MS.splice(0, BACKOFF_MS.length, 20, 20);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  BACKOFF_MS.splice(0, BACKOFF_MS.length, ...realBackoff);
});

test('one host is spaced 1s apart, different hosts are not serialized', async () => {
  stub(() => new Response('ok'));
  const start = Date.now();
  const sameHost = (async () => {
    for (let i = 0; i < 3; i++) await fetchText(`https://slow.test/${i}`);
  })();
  await Promise.all([sameHost, fetchText('https://other.test/')]);
  const slow = calls.filter((c) => c.url.includes('slow.test')).map((c) => c.at);
  const other = calls.find((c) => c.url.includes('other.test'))!;
  assert.equal(slow.length, 3);
  assert.ok(slow[1] - slow[0] >= 990 && slow[2] - slow[1] >= 990, `gaps ${slow[1] - slow[0]}, ${slow[2] - slow[1]}`);
  assert.ok(other.at - start < 500, `other host waited ${other.at - start}ms`);
  assert.equal(other.ua, USER_AGENT);
});

test('a 503 is retried and the 200 returned', async () => {
  stub((_, n) => (n === 1 ? new Response('busy', { status: 503 }) : new Response('fine')));
  const res = await fetchText('https://retry.test/feed');
  assert.equal(res.text, 'fine');
  assert.equal(calls.length, 2);
});

test('a 404 throws HttpError after one fetch', async () => {
  stub(() => new Response('nope', { status: 404 }));
  await assert.rejects(fetchText('https://missing.test/feed'), (err) => err instanceof HttpError && err.status === 404);
  assert.equal(calls.length, 1);
});

test('a 301 to another host is followed and the final url reported', async () => {
  stub((url) => (url.startsWith('https://from.test/')
    ? new Response(null, { status: 301, headers: { location: '//to.test/jobs?x=1' } })
    : new Response('landed')));
  const res = await fetchText('https://from.test/careers');
  assert.deepEqual(calls.map((c) => c.url), ['https://from.test/careers', 'https://to.test/jobs?x=1']);
  assert.equal(res.url, 'https://to.test/jobs?x=1');
  assert.equal(res.text, 'landed');
});

test('more than 5 redirects throws HttpError with status 0', async () => {
  stub((_, n) => new Response(null, { status: 302, headers: { location: `https://hop${n}.test/` } }));
  await assert.rejects(fetchText('https://hop0.test/'), (err) => err instanceof HttpError && err.status === 0 && /redirects/.test(err.message));
  assert.equal(calls.length, 6);
});

test('a POST keeps method, body and headers, shares the host queue with GETs and retries with the same body', async () => {
  const sent: { method: string; body: string | null; type: string | null; ua: string | null; at: number }[] = [];
  globalThis.fetch = (async (_input: string | URL, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    sent.push({
      method: init?.method ?? 'GET', body: init?.body ? String(init.body) : null, type: h.get('content-type'), ua: h.get('user-agent'),
      at: Date.now(),
    });
    return sent.length === 2 ? new Response('busy', { status: 503 }) : new Response('{"ok":true}');
  }) as typeof fetch;
  const body = '{"limit":20,"offset":0}';
  await fetchText('https://post.test/jobs');
  const res = await fetchText('https://post.test/jobs', { method: 'POST', body, headers: { 'content-type': 'application/json' } });
  assert.equal(res.text, '{"ok":true}');
  assert.deepEqual(sent.map((s) => [s.method, s.body, s.type, s.ua]), [
    ['GET', null, null, USER_AGENT],
    ['POST', body, 'application/json', USER_AGENT],
    ['POST', body, 'application/json', USER_AGENT],
  ]);
  assert.ok(sent[1].at - sent[0].at >= 990, `POST waited ${sent[1].at - sent[0].at}ms after the GET`);
});

test('a POST that keeps failing throws HttpError after the backoff attempts', async () => {
  stub(() => new Response('down', { status: 500 }));
  await assert.rejects(fetchText('https://postfail.test/jobs', { method: 'POST', body: '{}' }), (err) => err instanceof HttpError && err.status === 500);
  assert.equal(calls.length, 1 + BACKOFF_MS.length);
});
