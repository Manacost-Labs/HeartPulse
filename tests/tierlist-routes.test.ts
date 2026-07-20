import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import {
  createTierlistRouter,
  type TierlistRouterDependencies,
} from '../server/tierlistRoutes.js';

let timestamp = 1_000;
let originFails = false;
const calls: Array<{ source: string; now: number; bypass: boolean }> = [];
const errors: unknown[] = [];
const cache = new Map<string, { data: any; etag: string; expiresAt: number }>();

const accessGuard: RequestHandler = (request, response, next) => {
  if (request.headers['x-test-access'] !== 'allowed') return response.status(403).json({ error: 'subscription required' });
  response.locals.subscriptionGuarded = true;
  return next();
};

const dependencies: TierlistRouterDependencies = {
  accessGuard,
  cache,
  resolveSource: source => ['hsreplay', 'heartharena', 'firestone'].includes(source ?? '')
    ? source as string
    : 'hsreplay',
  getData: async (source, now, bypass) => {
    calls.push({ source, now, bypass });
    if (originFails) throw new Error('origin secret');
    return {
      data: {
        sections: [{ source }],
        ...(source === 'firestone' ? {
          data_phase: 'post_patch_early',
          provisional: true,
        } : {}),
      },
      etag: `"${source}-origin"`,
      cacheSource: 'origin',
    };
  },
  present: data => ({ ...data, positioned: true }),
  loadFallback: source => source === 'hsreplay'
    ? { data: { sections: [{ source: 'snapshot-hsreplay' }] }, etag: '"fallback-hsreplay"' }
    : source === 'heartharena'
      ? { data: { sections: [{ source: 'snapshot-heartharena' }] }, etag: '"fallback-heartharena"' }
      : null,
  now: () => timestamp,
  onError: error => errors.push(error),
  cacheHeader: 'public, max-age=3600, stale-while-revalidate=3600',
  provisionalCacheHeader: 'public, max-age=300, stale-while-revalidate=300',
};

function startApp(overrides: Partial<TierlistRouterDependencies> = {}) {
  const app = express();
  app.use('/api', createTierlistRouter({ ...dependencies, ...overrides }));
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
  const denied = await get('/tierlist');
  assert.equal(denied.status, 403);
  assert.deepEqual(calls, []);

  const deniedBust = await get('/tierlist?source=hsreplay&bust=1');
  assert.equal(deniedBust.status, 403);
  assert.deepEqual(calls, []);

  cache.set('hsreplay', {
    data: { sections: [{ source: 'memory' }] },
    etag: '"memory"',
    expiresAt: 1_100,
  });
  const memory = await get('/tierlist?source=invalid', { 'X-Test-Access': 'allowed' });
  assert.equal(memory.status, 200);
  assert.equal(memory.headers.get('x-data-cache'), 'memory');
  assert.match(memory.headers.get('cache-control') || '', /^private/);
  assert.match(memory.headers.get('vary') || '', /Authorization/);
  assert.match(memory.headers.get('cache-control') || '', /max-age=3600/);
  assert.equal((await memory.json() as any).positioned, true);

  const notModified = await get('/tierlist', {
    'X-Test-Access': 'allowed',
    'If-None-Match': '"memory"',
  });
  assert.equal(notModified.status, 304);

  const bust = await get('/tierlist?source=firestone&t=123', { 'X-Test-Access': 'allowed' });
  assert.equal(bust.headers.get('x-data-cache'), 'origin');
  assert.match(bust.headers.get('cache-control') || '', /^private, max-age=300/);
  assert.equal((await bust.clone().json() as any).provisional, true);
  assert.deepEqual(calls.at(-1), { source: 'firestone', now: 1_000, bypass: true });

  const provisionalNotModified = await get('/tierlist?source=firestone&t=124', {
    'X-Test-Access': 'allowed',
    'If-None-Match': '"firestone-origin"',
  });
  assert.equal(provisionalNotModified.status, 304);
  assert.match(provisionalNotModified.headers.get('cache-control') || '', /^private, max-age=300/);

  const queryBust = await get('/tierlist?source=heartharena&bust=1', { 'X-Test-Access': 'allowed' });
  assert.equal(queryBust.status, 200);
  assert.deepEqual(calls.at(-1), { source: 'heartharena', now: 1_000, bypass: true });

  timestamp = 1_101;
  originFails = true;
  const stale = await get('/tierlist', { 'X-Test-Access': 'allowed' });
  assert.equal(stale.status, 200);
  assert.equal(stale.headers.get('x-data-cache'), 'memory-stale');
  assert.equal((await stale.json() as any).warning, 'stale');

  cache.clear();
  const fallback = await get('/tierlist?source=heartharena', { 'X-Test-Access': 'allowed' });
  assert.equal(fallback.status, 200);
  assert.equal(fallback.headers.get('x-data-cache'), 'fallback');
  assert.equal((await fallback.json() as any).warning, 'fallback');
  assert.ok(errors.length >= 2);

  const unavailable = await fetch(`${origin(unavailableServer)}/tierlist?source=firestone`, {
    headers: { 'X-Test-Access': 'allowed' },
  });
  assert.equal(unavailable.status, 502);
  assert.deepEqual(await unavailable.json(), { error: 'Tierlist unavailable' });
} finally {
  await Promise.all([server, unavailableServer].map(instance => new Promise<void>((resolve, reject) => (
    instance.close(error => error ? reject(error) : resolve())
  ))));
}

console.log('tierlist router contract tests passed');
