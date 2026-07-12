import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import {
  createLegendaryRouter,
  type LegendaryRouterDependencies,
} from '../server/legendaryRoutes.js';

let timestamp = 1_000;
let originFails = false;
let resultIsEmpty = false;
const getDataCalls: Array<{ source: string; now: number; bypass: boolean }> = [];
const errors: unknown[] = [];
const cache = new Map<string, { data: any; etag: string; expiresAt: number }>();

const accessGuard: RequestHandler = (request, response, next) => {
  if (request.headers['x-test-access'] !== 'allowed') return response.status(403).json({ error: 'subscription required' });
  response.locals.subscriptionGuarded = true;
  return next();
};

const dependencies: LegendaryRouterDependencies = {
  accessGuard,
  cache,
  resolveSource: source => source === 'firestone' ? 'firestone' : 'hsreplay',
  getData: async (source, now, bypass) => {
    getDataCalls.push({ source, now, bypass });
    if (originFails) throw new Error('origin secret');
    return {
      data: { groups: resultIsEmpty ? [] : [{ id: `${source}-group` }] },
      etag: `"${source}-origin"`,
      cacheSource: 'origin',
    };
  },
  isUsableData: data => Array.isArray(data?.groups) && data.groups.length > 0,
  loadFallback: source => source === 'hsreplay'
    ? { data: { groups: [{ id: 'fallback-group' }] }, etag: '"fallback"' }
    : null,
  now: () => timestamp,
  onError: error => errors.push(error),
};

function startApp(overrides: Partial<LegendaryRouterDependencies> = {}) {
  const app = express();
  app.use('/api', createLegendaryRouter({ ...dependencies, ...overrides }));
  return app.listen(0, '127.0.0.1');
}

const server = startApp();
const unavailableServer = startApp({
  cache: new Map(),
  getData: async () => { throw new Error('never expose me'); },
  loadFallback: () => null,
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
  const denied = await get('/legendaries');
  assert.equal(denied.status, 403);
  assert.deepEqual(getDataCalls, []);

  cache.set('hsreplay', {
    data: { groups: [{ id: 'memory-group' }] },
    etag: '"memory"',
    expiresAt: 1_100,
  });
  const memory = await get('/legendaries?source=unknown', { 'X-Test-Access': 'allowed' });
  assert.equal(memory.status, 200);
  assert.equal(memory.headers.get('x-data-cache'), 'memory');
  assert.match(memory.headers.get('cache-control') || '', /^private/);
  assert.match(memory.headers.get('vary') || '', /Cookie/);
  assert.equal((await memory.json() as any).groups[0].id, 'memory-group');

  const notModified = await get('/legendaries', {
    'X-Test-Access': 'allowed',
    'If-None-Match': '"memory"',
  });
  assert.equal(notModified.status, 304);

  const bypass = await get('/legendaries?bust=1', { 'X-Test-Access': 'allowed' });
  assert.equal(bypass.headers.get('x-data-cache'), 'origin');
  assert.deepEqual(getDataCalls.at(-1), { source: 'hsreplay', now: 1_000, bypass: true });

  cache.set('firestone', { data: { groups: [] }, etag: '"empty"', expiresAt: 2_000 });
  const repairedEmpty = await get('/legendaries?source=firestone', { 'X-Test-Access': 'allowed' });
  assert.equal(repairedEmpty.status, 200);
  assert.equal(repairedEmpty.headers.get('x-data-cache'), 'origin');
  assert.equal(cache.has('firestone'), false);

  timestamp = 1_101;
  originFails = true;
  const stale = await get('/legendaries', { 'X-Test-Access': 'allowed' });
  assert.equal(stale.status, 200);
  assert.equal(stale.headers.get('x-data-cache'), 'memory-stale');
  assert.equal((await stale.json() as any).warning, 'stale');

  cache.clear();
  const fallback = await get('/legendaries', { 'X-Test-Access': 'allowed' });
  assert.equal(fallback.status, 200);
  assert.equal(fallback.headers.get('x-data-cache'), 'fallback');
  assert.equal((await fallback.json() as any).warning, 'fallback');

  originFails = false;
  resultIsEmpty = true;
  const emptyFallsBack = await get('/legendaries', { 'X-Test-Access': 'allowed' });
  assert.equal(emptyFallsBack.status, 200);
  assert.equal(emptyFallsBack.headers.get('x-data-cache'), 'fallback');
  assert.ok(errors.length >= 3);

  const unavailable = await fetch(`${origin(unavailableServer)}/legendaries?source=firestone`, {
    headers: { 'X-Test-Access': 'allowed' },
  });
  assert.equal(unavailable.status, 502);
  assert.deepEqual(await unavailable.json(), { error: 'Legendaries unavailable' });
} finally {
  await Promise.all([server, unavailableServer].map(instance => new Promise<void>((resolve, reject) => (
    instance.close(error => error ? reject(error) : resolve())
  ))));
}

console.log('legendary router contract tests passed');
