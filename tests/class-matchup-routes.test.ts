import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import {
  createClassMatchupRouter,
  type ClassMatchupCacheStore,
  type ClassMatchupRouterDependencies,
} from '../server/classMatchupRoutes.js';

let now = 1_000;
let redisMode: 'miss' | 'hit' | 'error' = 'miss';
let originFails = false;
let fetchCount = 0;
const redisWrites: any[] = [];
const errors: Array<{ scope: string; error: unknown }> = [];
const cache: ClassMatchupCacheStore = { current: null };

const accessGuard: RequestHandler = (request, response, next) => {
  if (request.headers['x-test-access'] !== 'allowed') return response.status(403).json({ error: 'subscription required' });
  response.locals.subscriptionGuarded = true;
  return next();
};

const dependencies: ClassMatchupRouterDependencies = {
  accessGuard,
  cache,
  redisKey: 'dataset:class-matchups',
  redisGet: async () => {
    if (redisMode === 'error') throw new Error('redis secret');
    if (redisMode === 'hit') {
      return { data: { matchups: [{ id: 'redis' }], updatedAt: null }, etag: '"redis-class-matchups"' };
    }
    return null;
  },
  redisSet: async (key, data, etag, ttl) => { redisWrites.push({ key, data, etag, ttl }); },
  fetchMatchups: async () => {
    fetchCount += 1;
    if (originFails) throw new Error('origin secret');
    return { matchups: [{ id: 'origin' }, { id: 'second' }], updatedAt: '2026-07-12T12:00:00.000Z' };
  },
  memoryTtlMs: 100,
  redisTtlSeconds: 600,
  cacheHeader: 'public, max-age=3600, stale-while-revalidate=600',
  staleCacheHeader: 'public, max-age=300, stale-while-revalidate=600',
  now: () => now,
  onError: (scope, error) => errors.push({ scope, error }),
};

function startApp(overrides: Partial<ClassMatchupRouterDependencies> = {}) {
  const app = express();
  app.use('/api', createClassMatchupRouter({ ...dependencies, ...overrides }));
  return app.listen(0, '127.0.0.1');
}

const server = startApp();
const failingServer = startApp({
  cache: { current: null },
  redisGet: async () => null,
  fetchMatchups: async () => { throw new Error('do not expose me'); },
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

async function get(headers: Record<string, string> = {}) {
  return fetch(`${origin(server)}/class-matchups`, { headers });
}

try {
  const denied = await get();
  assert.equal(denied.status, 403);
  assert.equal(fetchCount, 0);

  cache.current = { data: { matchups: [{ id: 'memory' }] }, etag: '"memory-class"', expiresAt: 1_100 };
  const memory = await get({ 'X-Test-Access': 'allowed' });
  assert.equal(memory.headers.get('x-data-cache'), 'memory');
  assert.match(memory.headers.get('cache-control') || '', /^private/);
  assert.match(memory.headers.get('vary') || '', /Cookie/);
  assert.equal((await memory.json() as any).matchups[0].id, 'memory');

  const notModified = await get({ 'X-Test-Access': 'allowed', 'If-None-Match': '"memory-class"' });
  assert.equal(notModified.status, 304);

  cache.current = null;
  redisMode = 'hit';
  const redis = await get({ 'X-Test-Access': 'allowed' });
  assert.equal(redis.headers.get('x-data-cache'), 'redis');
  assert.equal(redis.headers.get('etag'), '"redis-class-matchups"');
  assert.equal(cache.current?.expiresAt, 1_100);

  cache.current = null;
  redisMode = 'error';
  const originResponse = await get({ 'X-Test-Access': 'allowed' });
  assert.equal(originResponse.status, 200);
  assert.equal(originResponse.headers.get('x-data-cache'), 'origin');
  assert.match(originResponse.headers.get('etag') || '', /^"class-matchups-/);
  assert.equal((await originResponse.json() as any).matchups.length, 2);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetchCount, 1);
  assert.equal(redisWrites[0].key, 'dataset:class-matchups');
  assert.equal(redisWrites[0].ttl, 600);
  assert.equal(errors[0].scope, 'redis-read');

  now = 1_101;
  redisMode = 'miss';
  originFails = true;
  const stale = await get({ 'X-Test-Access': 'allowed' });
  assert.equal(stale.status, 200);
  assert.equal(stale.headers.get('x-data-cache'), 'memory-stale');
  assert.match(stale.headers.get('cache-control') || '', /^private, max-age=300/);
  assert.equal((await stale.json() as any).warning, 'stale');
  assert.equal(errors.at(-1)?.scope, 'origin');

  const unavailable = await fetch(`${origin(failingServer)}/class-matchups`, {
    headers: { 'X-Test-Access': 'allowed' },
  });
  assert.equal(unavailable.status, 502);
  assert.deepEqual(await unavailable.json(), { error: 'Class matchups unavailable' });
} finally {
  await Promise.all([server, failingServer].map(instance => new Promise<void>((resolve, reject) => (
    instance.close(error => error ? reject(error) : resolve())
  ))));
}

console.log('class matchup router contract tests passed');
