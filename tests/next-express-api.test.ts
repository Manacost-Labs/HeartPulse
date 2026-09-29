import assert from 'node:assert/strict';
import test from 'node:test';
import { expressOrigin, fetchPublicExpress } from '../apps/public-web/lib/expressApi';

function withOrigin<T>(origin: string | undefined, run: () => T): T {
  const previous = process.env.LEGACY_WEB_ORIGIN;
  if (origin === undefined) delete process.env.LEGACY_WEB_ORIGIN;
  else process.env.LEGACY_WEB_ORIGIN = origin;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.LEGACY_WEB_ORIGIN;
    else process.env.LEGACY_WEB_ORIGIN = previous;
  }
}

test('public Express reads are anonymous, bounded and never follow redirects', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  try {
    await withOrigin('http://127.0.0.1:3101', () => fetchPublicExpress('/api/articles?page=2'));
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:3101/api/articles?page=2');
  assert.equal(calls[0].init?.credentials, 'omit');
  assert.equal(calls[0].init?.redirect, 'error');
  assert.equal(calls[0].init?.cache, 'no-store');
  assert.deepEqual(calls[0].init?.headers, { Accept: 'application/json' });
  assert.ok(calls[0].init?.signal instanceof AbortSignal);
});

test('the development fallback is the local API port', () => {
  assert.equal(withOrigin(undefined, expressOrigin).href, 'http://127.0.0.1:3001/');
});

test('origins with credentials, paths, other protocols or bad syntax are rejected', () => {
  for (const origin of ['http://user:secret@127.0.0.1:3101', 'http://127.0.0.1:3101/base',
    'ftp://127.0.0.1:3101', 'not a url']) {
    assert.throws(() => withOrigin(origin, expressOrigin), /Invalid legacy origin/, origin);
  }
});
