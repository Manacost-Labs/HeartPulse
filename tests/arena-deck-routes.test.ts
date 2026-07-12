import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import {
  createArenaDecksRouter,
  type ArenaDecksCacheStore,
  type ArenaDecksRouterDependencies,
} from '../server/arenaDeckRoutes.js';

const decks = [
  { id: 'd1', classes: [{ name: 'Маг', slug: 'mage' }] },
  { id: 'd2', classes: [{ name: 'Воин', slug: 'warrior' }] },
  { id: 'd3', classes: [{ name: 'Маг', slug: 'mage' }] },
];
let now = 1_000;
let fetchCount = 0;
let fetchFails = false;
const fetchLimits: number[] = [];
const errors: unknown[] = [];
const cache: ArenaDecksCacheStore = { current: null };

const accessGuard: RequestHandler = (request, response, next) => {
  if (request.headers['x-test-access'] !== 'allowed') return response.status(403).json({ error: 'subscription required' });
  response.locals.subscriptionGuarded = true;
  return next();
};

const dependencies: ArenaDecksRouterDependencies = {
  accessGuard,
  fetchDecks: async limit => {
    fetchCount += 1;
    fetchLimits.push(limit);
    if (fetchFails) throw new Error('private upstream detail');
    return {
      decks,
      totalDecks: 30,
      updatedAt: '2026-07-12T12:00:00.000Z',
    };
  },
  cache,
  maxLimit: 500,
  cacheTtlMs: 100,
  publicCacheHeader: 'public, max-age=3600, stale-while-revalidate=600',
  staleCacheHeader: 'public, max-age=300, stale-while-revalidate=600',
  now: () => now,
  onFetchError: error => errors.push(error),
};

function startApp(overrides: Partial<ArenaDecksRouterDependencies> = {}) {
  const app = express();
  app.use('/api', createArenaDecksRouter({ ...dependencies, ...overrides }));
  return app.listen(0, '127.0.0.1');
}

const server = startApp();
const failingServer = startApp({
  cache: { current: null },
  fetchDecks: async () => { throw new Error('secret source failure'); },
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
  const denied = await get('/decks');
  assert.equal(denied.status, 403);
  assert.equal(fetchCount, 0);

  const first = await get('/decks?page=99&pageSize=1&class=%D0%9C%D0%B0%D0%B3', { 'X-Test-Access': 'allowed' });
  assert.equal(first.status, 200);
  assert.match(first.headers.get('cache-control') || '', /^private/);
  assert.match(first.headers.get('vary') || '', /Cookie/);
  assert.match(first.headers.get('vary') || '', /Authorization/);
  const firstEtag = first.headers.get('etag');
  assert.ok(firstEtag);
  assert.deepEqual(await first.json(), {
    decks: [{ id: 'd3', classes: [{ name: 'Маг', slug: 'mage' }] }],
    totalDecks: 30,
    filteredDecks: 2,
    page: 2,
    pageSize: 1,
    totalPages: 2,
    activeClass: 'Маг',
    classOptions: [
      { name: 'Воин', slug: 'warrior' },
      { name: 'Маг', slug: 'mage' },
    ],
    updatedAt: '2026-07-12T12:00:00.000Z',
    source: 'arena-decks',
    sourceUrl: '',
  });
  assert.equal(fetchCount, 1);
  assert.deepEqual(fetchLimits, [500]);

  const notModified = await get('/decks?page=99&pageSize=1&class=%D0%9C%D0%B0%D0%B3', {
    'X-Test-Access': 'allowed',
    'If-None-Match': firstEtag,
  });
  assert.equal(notModified.status, 304);
  assert.equal(fetchCount, 1);

  const normalized = await get('/decks?page=-2&pageSize=500', { 'X-Test-Access': 'allowed' });
  const normalizedBody = await normalized.json() as any;
  assert.equal(normalizedBody.page, 1);
  assert.equal(normalizedBody.pageSize, 20);
  assert.equal(normalizedBody.decks.length, 3);

  now = 1_101;
  fetchFails = true;
  const stale = await get('/decks?page=1&pageSize=2', { 'X-Test-Access': 'allowed' });
  assert.equal(stale.status, 200);
  assert.match(stale.headers.get('cache-control') || '', /^private, max-age=300/);
  assert.match(stale.headers.get('etag') || '', /-stale"$/);
  assert.equal((await stale.json() as any).warning, 'stale');
  assert.equal(errors.length, 1);

  const unavailable = await fetch(`${origin(failingServer)}/decks`, {
    headers: { 'X-Test-Access': 'allowed' },
  });
  assert.equal(unavailable.status, 502);
  assert.deepEqual(await unavailable.json(), { error: 'Arena decks unavailable' });
} finally {
  await Promise.all([server, failingServer].map(instance => new Promise<void>((resolve, reject) => (
    instance.close(error => error ? reject(error) : resolve())
  ))));
}

console.log('arena decks router contract tests passed');
