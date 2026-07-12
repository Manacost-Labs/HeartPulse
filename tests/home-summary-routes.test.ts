import assert from 'node:assert/strict';
import express from 'express';
import {
  createHomeSummaryRouter,
  type HomeSummaryRouterDependencies,
} from '../server/homeSummaryRoutes.js';

let timestamp = 1_000;
let redisMode: 'miss' | 'hit' | 'error' = 'miss';
let originFails = false;
const builds: number[] = [];
const writes: any[] = [];
const errors: Array<{ scope: string; error: unknown }> = [];
const cache = { current: null as { data: any; etag: string; expiresAt: number } | null };

const dependencies: HomeSummaryRouterDependencies = {
  cache,
  redisKey: 'home-summary',
  redisGet: async () => {
    if (redisMode === 'error') throw new Error('redis secret');
    if (redisMode === 'hit') return {
      data: { topClasses: [{ id: 'redis' }] },
      etag: '"redis"',
    };
    return null;
  },
  redisSet: async (key, data, etag, ttl) => { writes.push({ key, data, etag, ttl }); },
  buildSummary: async now => {
    builds.push(now);
    if (originFails) throw new Error('origin secret');
    return { topClasses: [{ id: 'origin' }], updatedAt: { winrates: null } };
  },
  makeEtag: (_data, now) => `"home-${now}"`,
  memoryTtlMs: 100,
  redisTtlSeconds: 600,
  now: () => timestamp,
  onError: (scope, error) => errors.push({ scope, error }),
};

function startApp(overrides: Partial<HomeSummaryRouterDependencies> = {}) {
  const app = express();
  app.use('/api', createHomeSummaryRouter({ ...dependencies, ...overrides }));
  return app.listen(0, '127.0.0.1');
}

const server = startApp();
const unavailableServer = startApp({
  cache: { current: null },
  redisGet: async () => null,
  buildSummary: async () => { throw new Error('never expose me'); },
});
await Promise.all([server, unavailableServer].map(instance => new Promise<void>((resolve, reject) => {
  instance.once('listening', resolve);
  instance.once('error', reject);
})));

function origin(instance: typeof server) {
  const address = instance.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}/api`;
}

async function get(instance = server, headers: Record<string, string> = {}) {
  return fetch(`${origin(instance)}/home/summary`, { headers });
}

try {
  cache.current = { data: { topClasses: [{ id: 'memory' }] }, etag: '"memory"', expiresAt: 1_100 };
  const memory = await get();
  assert.equal(memory.status, 200);
  assert.equal(memory.headers.get('x-data-cache'), 'memory');
  assert.match(memory.headers.get('cache-control') || '', /^public/);
  assert.equal((await memory.json() as any).topClasses[0].id, 'memory');

  const notModified = await get(server, { 'If-None-Match': '"memory"' });
  assert.equal(notModified.status, 304);

  cache.current = null;
  redisMode = 'hit';
  const redis = await get();
  assert.equal(redis.headers.get('x-data-cache'), 'redis');
  assert.equal(cache.current?.expiresAt, 1_100);

  cache.current = null;
  redisMode = 'error';
  const originResponse = await get();
  assert.equal(originResponse.headers.get('x-data-cache'), 'origin');
  assert.deepEqual(builds, [1_000]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes[0].key, 'home-summary');
  assert.equal(writes[0].ttl, 600);
  assert.equal(errors[0].scope, 'redis-read');

  timestamp = 1_101;
  redisMode = 'miss';
  originFails = true;
  const stale = await get();
  assert.equal(stale.headers.get('x-data-cache'), 'memory-stale');
  assert.equal((await stale.json() as any).warning, 'stale');
  assert.equal(errors.at(-1)?.scope, 'origin');

  const unavailable = await get(unavailableServer);
  assert.equal(unavailable.status, 502);
  assert.deepEqual(await unavailable.json(), { error: 'Home summary unavailable' });
} finally {
  await Promise.all([server, unavailableServer].map(instance => new Promise<void>((resolve, reject) => (
    instance.close(error => error ? reject(error) : resolve())
  ))));
}

console.log('home summary router contract tests passed');
