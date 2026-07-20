import assert from 'node:assert/strict';
import express from 'express';
import { createTierlistCacheBustRouter } from '../server/tierlistCacheBustRoutes.js';

const calls: Array<{ source: string; bypassCache: boolean }> = [];
const app = express();
app.use('/_internal', createTierlistCacheBustRouter({
  resolveSource: source => ['hsreplay', 'heartharena', 'firestone'].includes(source ?? '')
    ? source as string
    : null,
  getData: async (source, _now, bypassCache) => {
    calls.push({ source, bypassCache });
    return {
      data: {
        updatedAt: '2026-07-21T00:00:00.000Z',
        provisional: true,
        accepted_rows: 74,
      },
      etag: `"${source}-early"`,
      cacheSource: 'origin',
    };
  },
  now: () => 1_000,
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});

const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;

try {
  const refreshed = await fetch(`${origin}/_internal/tierlist/cache-bust?source=hsreplay`, {
    method: 'POST',
  });
  assert.equal(refreshed.status, 200);
  assert.match(refreshed.headers.get('cache-control') || '', /no-store/);
  assert.deepEqual(await refreshed.json(), {
    source: 'hsreplay',
    updatedAt: '2026-07-21T00:00:00.000Z',
    provisional: true,
    acceptedRows: 74,
    etag: '"hsreplay-early"',
  });
  assert.deepEqual(calls, [{ source: 'hsreplay', bypassCache: true }]);

  const proxied = await fetch(`${origin}/_internal/tierlist/cache-bust?source=firestone`, {
    method: 'POST',
    headers: {
      'X-Forwarded-For': '203.0.113.7',
      'X-Real-IP': '203.0.113.7',
    },
  });
  assert.equal(proxied.status, 404);
  assert.deepEqual(calls, [{ source: 'hsreplay', bypassCache: true }]);

  const unknown = await fetch(`${origin}/_internal/tierlist/cache-bust?source=unknown`, {
    method: 'POST',
  });
  assert.equal(unknown.status, 400);

  const wrongMethod = await fetch(`${origin}/_internal/tierlist/cache-bust?source=hsreplay`);
  assert.equal(wrongMethod.status, 404);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('tierlist internal cache-bust route tests passed');
