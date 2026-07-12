import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import {
  createWinrateRouter,
  type ClassWinrateSource,
  type WinrateRouterDependencies,
} from '../server/winrateRoutes.js';

let timestamp = 1_000;
let redisMode: 'miss' | 'hit' | 'error' = 'miss';
let originMode: 'ok' | 'error' | 'empty' = 'ok';
let snapshot: { data: any; etag: string } | null = null;
const fetches: ClassWinrateSource[] = [];
const writes: any[] = [];
const errors: Array<{ scope: string; source: string; error: unknown }> = [];
const cache = new Map<string, { data: any; etag: string; expiresAt: number }>();

const accessGuard: RequestHandler = (request, response, next) => {
  if (request.headers['x-test-access'] !== 'allowed') return response.status(403).json({ error: 'subscription required' });
  response.locals.subscriptionGuarded = true;
  return next();
};

const dependencies: WinrateRouterDependencies = {
  accessGuard,
  cache,
  redisKey: source => `winrates:${source}`,
  redisGet: async key => {
    if (redisMode === 'error') throw new Error('redis secret');
    if (redisMode === 'hit') return {
      data: { classes: [{ id: key }], source: 'redis' },
      etag: '"redis"',
    };
    return null;
  },
  redisSet: async (key, data, etag, ttl) => { writes.push({ key, data, etag, ttl }); },
  fetchSource: async source => {
    fetches.push(source);
    if (originMode === 'error') throw new Error('origin secret');
    if (originMode === 'empty') return { classes: [], source };
    return {
      classes: [{ id: `${source}-class` }],
      updatedAt: '2026-07-12T12:00:00.000Z',
      source,
    };
  },
  loadSnapshot: () => snapshot,
  memoryTtlMs: 100,
  redisTtlSeconds: 600,
  now: () => timestamp,
  onError: (scope, source, error) => errors.push({ scope, source, error }),
};

function startApp(overrides: Partial<WinrateRouterDependencies> = {}) {
  const app = express();
  app.use('/api', createWinrateRouter({ ...dependencies, ...overrides }));
  return app.listen(0, '127.0.0.1');
}

const server = startApp();
const unavailableServer = startApp({
  cache: new Map(),
  redisGet: async () => null,
  fetchSource: async () => { throw new Error('never expose me'); },
  loadSnapshot: () => null,
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

async function get(path: string, headers: Record<string, string> = {}) {
  return fetch(`${origin(server)}${path}`, { headers });
}

try {
  const denied = await get('/winrates');
  assert.equal(denied.status, 403);
  assert.deepEqual(fetches, []);

  cache.set('hsreplay', {
    data: { classes: [{ id: 'memory' }] },
    etag: '"memory"',
    expiresAt: 1_100,
  });
  const memory = await get('/winrates?source=unknown', { 'X-Test-Access': 'allowed' });
  assert.equal(memory.status, 200);
  assert.equal(memory.headers.get('x-data-cache'), 'memory');
  assert.match(memory.headers.get('cache-control') || '', /^private/);
  assert.match(memory.headers.get('vary') || '', /Cookie/);

  const notModified = await get('/winrates', {
    'X-Test-Access': 'allowed',
    'If-None-Match': '"memory"',
  });
  assert.equal(notModified.status, 304);

  redisMode = 'hit';
  const redis = await get('/winrates?source=firestone', { 'X-Test-Access': 'allowed' });
  assert.equal(redis.headers.get('x-data-cache'), 'redis');
  assert.equal(cache.get('firestone')?.expiresAt, 1_100);

  cache.clear();
  redisMode = 'error';
  const originResponse = await get('/winrates', { 'X-Test-Access': 'allowed' });
  assert.equal(originResponse.status, 200);
  assert.equal(originResponse.headers.get('x-data-cache'), 'origin');
  assert.deepEqual(fetches, ['hsreplay']);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes[0].key, 'winrates:hsreplay');
  assert.equal(writes[0].ttl, 600);
  assert.equal(errors[0].scope, 'redis-read');

  cache.clear();
  redisMode = 'miss';
  snapshot = {
    data: {
      classes: [{ id: 'newer-snapshot' }],
      updatedAt: '2026-07-12T13:00:00.000Z',
      source: 'snapshot',
    },
    etag: '"snapshot"',
  };
  const freshest = await get('/winrates', { 'X-Test-Access': 'allowed' });
  assert.equal(freshest.headers.get('x-data-cache'), 'local-fresher-than-upstream');
  assert.equal((await freshest.json() as any).classes[0].id, 'newer-snapshot');

  cache.delete('firestone');
  snapshot = null;
  const firestone = await get('/winrates?source=firestone', { 'X-Test-Access': 'allowed' });
  assert.equal(firestone.headers.get('x-data-cache'), 'origin');
  assert.equal((await firestone.json() as any).source, 'firestone');
  assert.equal(fetches.at(-1), 'firestone');

  timestamp = 1_101;
  originMode = 'error';
  const stale = await get('/winrates?source=firestone', { 'X-Test-Access': 'allowed' });
  assert.equal(stale.headers.get('x-data-cache'), 'memory-stale');
  assert.equal((await stale.json() as any).warning, 'stale');

  cache.clear();
  snapshot = { data: { classes: [{ id: 'fallback' }], source: 'snapshot' }, etag: '"fallback"' };
  const fallback = await get('/winrates?source=firestone', { 'X-Test-Access': 'allowed' });
  assert.equal(fallback.headers.get('x-data-cache'), 'fallback');
  assert.equal((await fallback.json() as any).warning, 'fallback');
  assert.equal(fetches.at(-1), 'firestone');

  originMode = 'empty';
  const emptyFallback = await get('/winrates', { 'X-Test-Access': 'allowed' });
  assert.equal(emptyFallback.headers.get('x-data-cache'), 'fallback');

  const unavailable = await fetch(`${origin(unavailableServer)}/winrates`, {
    headers: { 'X-Test-Access': 'allowed' },
  });
  assert.equal(unavailable.status, 502);
  assert.deepEqual(await unavailable.json(), { error: 'Class winrates unavailable' });
} finally {
  await Promise.all([server, unavailableServer].map(instance => new Promise<void>((resolve, reject) => (
    instance.close(error => error ? reject(error) : resolve())
  ))));
}

console.log('winrate router contract tests passed');
