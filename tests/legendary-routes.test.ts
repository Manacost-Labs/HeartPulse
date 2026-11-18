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


// --- Public projection (#437): allowlist, sentinel, order, cache, ETag ---
const SENTINELS = ['91.234', '87.654', '77.777', '66.666', '55.555', 'futureSentinel', 'tierSentinel'];
const PAID_KEYS = [
  'offerRate', 'score', 'arenaScore', 'winrate', 'deckWinrate', 'playedWinrate', 'inDecks', 'discardRate',
  'drawnWinrate', 'mulliganWinrate', 'keptRate', 'avgCopies', 'arenaSmithTier', 'arenaSmithTierPosition',
  'arenaSmithRank', 'tier', 'statsContext', 'futureMetric',
];
const paidCard = (cardId: string) => ({
  cardId, name: `Card ${cardId}`, cost: 5, type: 'minion', rarity: 'legendary', classKey: 'mage', count: 1,
  imageRu: `/img/${cardId}.png`, imageHa: `https://img/${cardId}.png`,
  winrate: 77.777, deckWinrate: 77.777, totalGames: 123456, pickRate: 66.666, playedWinrate: 55.555,
  inDecks: 4242, discardRate: 12.121, drawnWinrate: 77.777, mulliganWinrate: 77.777, keptRate: 33.333,
  avgCopies: 1.717, arenaSmithTier: 'tierSentinel', arenaSmithTierPosition: 9, arenaSmithRank: 8, tier: 'tierSentinel',
  statsContext: 'tierlist', offerRate: 91.234, arenaScore: 87.654, score: 87.654, futureMetric: 'futureSentinel',
});
const paidGroup = (cardId: string, winRate: number, score: number) => ({
  keyCard: paidCard(cardId), cards: [paidCard(`${cardId}-b`)], winRate, pickRate: 11.5, totalGames: 5000,
  offerRate: 91.234, score, arenaScore: score, classKey: 'mage', futureMetric: 'futureSentinel',
  byClass: { mage: { winRate: 60.5, pickRate: 12.5, offerRate: 91.234, score: 87.654, futureMetric: 'futureSentinel' } },
});
// Order by score is the reverse of the order by winRate.
const paidDataset = () => ({
  groups: [paidGroup('A', 50, 99), paidGroup('C', 60, 10), paidGroup('B', 60, 50), paidGroup('D', 70, 1)],
  updatedAt: '2026-11-18', source: 'HSReplay', futureMetric: 'futureSentinel',
});
const publicState = { fail: false, loadFallback: true };
const publicCache = new Map<string, any>();
const publicGetCalls: boolean[] = [];
const publicApp = startApp({
  cache: new Map(),
  publicCache,
  getData: async (source, _now, bypass) => {
    publicGetCalls.push(bypass);
    if (publicState.fail) throw new Error('origin down');
    return { data: paidDataset(), etag: `"paid-${source}"`, cacheSource: 'origin' };
  },
  loadFallback: source => publicState.loadFallback && source === 'hsreplay'
    ? { data: paidDataset(), etag: '"paid-fallback"' }
    : null,
});
await new Promise<void>(resolve => publicApp.once('listening', resolve));
const publicOrigin = origin(publicApp);
const assertClean = (text: string) => {
  for (const mark of SENTINELS) assert.equal(text.includes(mark), false, `leaked ${mark}`);
  // `paidMetrics` legitimately names offerRate/score as booleans; check the keys outside of it.
  const rest = text.replace(/"paidMetrics":\{[^}]*\}/, '');
  for (const key of PAID_KEYS) assert.equal(rest.includes(`"${key}"`), false, `leaked key ${key}`);
};

try {
  for (const source of ['hsreplay', 'firestone']) {
    timestamp = 10_000;
    publicState.fail = false;
    publicCache.clear();
    const fresh = await fetch(`${publicOrigin}/legendaries/public?source=${source}`);
    assert.equal(fresh.status, 200);
    assert.equal(fresh.headers.get('cache-control'), 'public, max-age=300, stale-while-revalidate=600');
    const freshText = await fresh.text();
    assertClean(freshText);
    const body = JSON.parse(freshText);
    assert.equal(body.sourceId, source);
    assert.deepEqual(body.paidMetrics, { offerRate: true, score: true });
    assert.deepEqual(body.groups.map((group: any) => group.keyCard.cardId), ['D', 'B', 'C', 'A']);
    assert.deepEqual(Object.keys(body.groups[0].byClass.mage).sort(), ['pickRate', 'winRate']);
    assert.deepEqual(Object.keys(body.groups[0].keyCard).sort(), [
      'cardId', 'classKey', 'cost', 'count', 'imageHa', 'imageRu', 'name', 'rarity', 'type',
    ]);
    assert.equal(body.groups[0].winRate, 70);
    assert.ok(publicCache.has(`legendaries-public:${source}`));
    assert.equal(publicGetCalls.every(bypass => bypass === false), true);

    const etag = fresh.headers.get('etag') as string;
    const notModified = await fetch(`${publicOrigin}/legendaries/public?source=${source}`, { headers: { 'If-None-Match': etag } });
    assert.equal(notModified.status, 304);
    // The protected route over the same data keeps every paid value (and proves the fixture carries them).
    const guarded = await fetch(`${publicOrigin}/legendaries?source=${source}`, { headers: { 'X-Test-Access': 'allowed' } });
    assert.notEqual(guarded.headers.get('etag'), etag);
    const guardedText = await guarded.text();
    assert.ok(guardedText.includes('91.234') && guardedText.includes('futureSentinel'));
    assert.equal((await fetch(`${publicOrigin}/legendaries?source=${source}`)).status, 403);

    publicState.fail = true;
    timestamp = 10_000 + 400_000;
    const stale = await fetch(`${publicOrigin}/legendaries/public?source=${source}`);
    assert.equal(stale.status, 200);
    const staleText = await stale.text();
    assertClean(staleText);
    assert.equal(JSON.parse(staleText).warning, 'stale');

    publicCache.clear();
    if (source === 'hsreplay') {
      const fallbackResponse = await fetch(`${publicOrigin}/legendaries/public?source=hsreplay`);
      assert.equal(fallbackResponse.status, 200);
      const fallbackText = await fallbackResponse.text();
      assertClean(fallbackText);
      const fallbackBody = JSON.parse(fallbackText);
      assert.equal(fallbackBody.warning, 'fallback');
      assert.ok(fallbackBody.groups.length > 0);
    } else {
      const down = await fetch(`${publicOrigin}/legendaries/public?source=firestone`);
      assert.equal(down.status, 503);
      assert.equal(down.headers.get('retry-after'), '60');
      assert.deepEqual(await down.json(), { error: 'Legendaries unavailable' });
    }
  }

  // An empty projection is a failure, not an empty 200.
  publicState.fail = false;
  publicState.loadFallback = false;
  publicCache.clear();
  const emptyApp = startApp({
    cache: new Map(),
    getData: async () => ({ data: { groups: [{ keyCard: { name: 'no id' } }] }, etag: '"x"', cacheSource: 'origin' }),
    loadFallback: () => null,
  });
  await new Promise<void>(resolve => emptyApp.once('listening', resolve));
  const emptyResponse = await fetch(`${origin(emptyApp)}/legendaries/public`);
  assert.equal(emptyResponse.status, 503);
  await new Promise<void>(resolve => emptyApp.close(() => resolve()));
} finally {
  await new Promise<void>(resolve => publicApp.close(() => resolve()));
}

console.log('legendary router contract tests passed');
