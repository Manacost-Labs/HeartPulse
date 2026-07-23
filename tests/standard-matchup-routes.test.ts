import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import {
  createStandardMatchupRouter,
  type StandardMatchupFormat,
  type StandardMatchupRouterDependencies,
} from '../server/standardMatchupRoutes.js';

let now = 1_000;
let redisMode: 'miss' | 'hit' | 'error' = 'miss';
let originFails = false;
const fetchFormats: StandardMatchupFormat[] = [];
const translationTimes: number[] = [];
const redisWrites: any[] = [];
const errors: Array<{ scope: string; error: unknown }> = [];
const memoryCache = new Map<string, { data: any; etag: string; expiresAt: number }>();

const accessGuard: RequestHandler = (request, response, next) => {
  if (request.headers['x-test-access'] !== 'allowed') return response.status(403).json({ error: 'subscription required' });
  response.locals.subscriptionGuarded = true;
  return next();
};

const dependencies: StandardMatchupRouterDependencies = {
  accessGuard,
  memoryCache,
  redisKey: format => `standard:${format}`,
  redisGet: async key => {
    if (redisMode === 'error') throw new Error('redis secret');
    if (redisMode === 'hit') {
      const format = key.endsWith('wild') ? 'wild' : 'standard';
      return {
        etag: `"redis-${format}"`,
        data: { rows: [{ id: format }], columns: ['one'], translationSource: 'redis', updatedAt: null },
      };
    }
    return null;
  },
  redisSet: async (key, data, etag, ttl) => { redisWrites.push({ key, data, etag, ttl }); },
  fetchPayload: async format => {
    fetchFormats.push(format);
    if (originFails) throw new Error('origin secret');
    return { format };
  },
  getTranslations: async timestamp => {
    translationTimes.push(timestamp);
    return { source: 'translations' };
  },
  transform: (payload, format) => ({
    rows: [{ id: `${payload.format}-row` }],
    columns: ['left', 'right'],
    translationSource: 'local',
    updatedAt: format === 'wild' ? '2026-07-12T12:00:00.000Z' : null,
  }),
  memoryTtlMs: 100,
  redisTtlSeconds: 600,
  cacheHeader: 'public, max-age=3600, stale-while-revalidate=600',
  now: () => now,
  onError: (scope, error) => errors.push({ scope, error }),
};

function startApp(overrides: Partial<StandardMatchupRouterDependencies> = {}) {
  const app = express();
  app.use('/api', createStandardMatchupRouter({ ...dependencies, ...overrides }));
  return app.listen(0, '127.0.0.1');
}

const server = startApp();
const failingServer = startApp({
  memoryCache: new Map(),
  redisGet: async () => null,
  fetchPayload: async () => { throw new Error('do not expose me'); },
});
await Promise.all([server, failingServer].map(instance => new Promise<void>((resolve, reject) => {
  instance.once('listening', resolve);
  instance.once('error', reject);
})));

function origin(instance: typeof server) {
  const address = instance.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}/api`;
}

async function get(path: string, headers: Record<string, string> = {}) {
  return fetch(`${origin(server)}${path}`, { headers });
}

try {
  const denied = await get('/standard/matchups');
  assert.equal(denied.status, 403);
  assert.deepEqual(fetchFormats, []);

  memoryCache.set('standard', {
    data: { rows: [{ id: 'memory' }], columns: [], translationSource: 'memory' },
    etag: '"memory-standard"',
    expiresAt: 1_100,
  });
  const memory = await get('/standard/matchups?format=unknown', { 'X-Test-Access': 'allowed' });
  assert.equal(memory.status, 200);
  assert.equal(memory.headers.get('x-data-cache'), 'memory');
  assert.match(memory.headers.get('cache-control') || '', /^private/);
  assert.match(memory.headers.get('vary') || '', /Cookie/);
  assert.deepEqual(await memory.json(), { rows: [{ id: 'memory' }], columns: [], translationSource: 'memory' });

  const notModified = await get('/standard/matchups', {
    'X-Test-Access': 'allowed',
    'If-None-Match': '"memory-standard"',
  });
  assert.equal(notModified.status, 304);

  redisMode = 'hit';
  const redis = await get('/standard/matchups?format=wild', { 'X-Test-Access': 'allowed' });
  assert.equal(redis.headers.get('x-data-cache'), 'redis');
  assert.equal(redis.headers.get('etag'), '"redis-wild"');
  assert.equal((await redis.json() as any).rows[0].id, 'wild');
  assert.equal(memoryCache.get('wild')?.expiresAt, 1_100);

  memoryCache.clear();
  redisMode = 'error';
  const fromOrigin = await get('/standard/matchups?format=wild', { 'X-Test-Access': 'allowed' });
  assert.equal(fromOrigin.status, 200);
  assert.equal(fromOrigin.headers.get('x-data-cache'), 'origin');
  assert.match(fromOrigin.headers.get('etag') || '', /^"standard-matchups-v5-wild-/);
  assert.equal((await fromOrigin.json() as any).rows[0].id, 'wild-row');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(fetchFormats, ['wild']);
  assert.deepEqual(translationTimes, [1_000]);
  assert.equal(redisWrites[0].key, 'standard:wild');
  assert.equal(redisWrites[0].ttl, 600);
  assert.equal(errors[0].scope, 'redis-read');

  now = 1_101;
  redisMode = 'miss';
  originFails = true;
  const stale = await get('/standard/matchups?format=wild', { 'X-Test-Access': 'allowed' });
  assert.equal(stale.status, 200);
  assert.equal(stale.headers.get('x-data-cache'), 'memory-stale');
  assert.equal((await stale.json() as any).warning, 'stale');
  assert.equal(errors.at(-1)?.scope, 'origin');

  const unavailable = await fetch(`${origin(failingServer)}/standard/matchups`, {
    headers: { 'X-Test-Access': 'allowed' },
  });
  assert.equal(unavailable.status, 502);
  assert.deepEqual(await unavailable.json(), { error: 'Standard matchups unavailable' });
} finally {
  await Promise.all([server, failingServer].map(instance => new Promise<void>((resolve, reject) => (
    instance.close(error => error ? reject(error) : resolve())
  ))));
}

console.log('standard matchup router contract tests passed');
