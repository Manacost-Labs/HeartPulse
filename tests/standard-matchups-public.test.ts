import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import {
  createStandardMatchupRouter, projectStandardMatchupsPublic, standardMatchupSliceDependencies, standardMatchupSliceKey,
  type StandardMatchupRouterDependencies, type StandardMatchupSlice,
} from '../server/standardMatchupRoutes.js';

/**
 * `GET /api/standard/matchups/public`: the open general slice (all ranks) of a format. A sentinel
 * label sits in every paid field of the fixture (the legend rank, the period list, a history field
 * a transform adds), and none of them may reach a guest. The chain on a failure is stale copy,
 * then the last good copy, then 503 with Retry-After.
 */
// The source's 63.3636 reaches the subscribers' answer rounded (63.4), so both forms are labels.
const PAID = ['63.3636', '63.4', 'SENTINEL_PERIOD', 'SENTINEL_HISTORY', 'SENTINEL_NARROW', '71.7171', '71.7'];
let now = 1_000;
let originFails = false;
const redisStore = new Map<string, { data: any; etag: string }>();
let redisReads = 0;
const reads: string[] = [];
const errors: string[] = [];
const redisWrites: string[] = [];

const apiPayload = (slice: StandardMatchupSlice) => ({
  data: {
    period: slice.rank === 'all' ? 'bans' : 'SENTINEL_PERIOD', checked_at: '2026-11-19T06:00:00Z', total_games: 9000,
    source_url: 'https://www.hsguru.com/matchups?format=2&rank=all',
    archetypes: [
      { archetype: 'Aggro Warlock', class: 'WARLOCK', games: 6000, winrate: slice.rank === 'legend' ? 63.3636 : 51.5, popularity_pct: 60 },
      { archetype: 'Other Mage', class: 'MAGE', games: 2000, winrate: 50, popularity_pct: 20 },
      { archetype: "C'Thun DH", class: 'DEMONHUNTER', games: 1000, winrate: 48.4, popularity_pct: 10 },
    ],
    matchups: [
      { archetype: 'Aggro Warlock', opponent: 'Aggro Warlock', winrate: 50, games: 800 },
      { archetype: 'Aggro Warlock', opponent: "C'Thun DH", winrate: slice.rank === 'legend' ? 71.7171 : 54.2, games: 120 },
      { archetype: "C'Thun DH", opponent: 'Aggro Warlock', winrate: 45.8, games: 120 },
      { archetype: 'Aggro Warlock', opponent: 'Other Mage', winrate: 55, games: 90 },
    ],
  },
  meta: { available: { periods: ['SENTINEL_PERIOD', 'bans'], current_period: 'SENTINEL_PERIOD', default_period: 'bans' } },
});

const source = standardMatchupSliceDependencies({
  origin: 'https://api.test',
  fetchJson: async url => {
    reads.push(url);
    if (originFails) throw new Error('origin secret');
    const query = new URL(url).searchParams;
    return apiPayload({ format: query.get('format') as any, rank: query.get('rank') as any, period: null, minGames: Number(query.get('min_games')) });
  },
  formatLabel: format => (format === 'wild' ? 'Вольный' : 'Стандарт'),
  translate: name => (name === 'Aggro Warlock' ? 'Агро-чернокнижник' : name),
});

const accessGuard: RequestHandler = (request, response, next) => {
  if (request.headers['x-test-access'] !== 'allowed') return response.status(403).json({ error: 'subscription required' });
  response.locals.subscriptionGuarded = true;
  return next();
};

const dependencies: StandardMatchupRouterDependencies = {
  accessGuard,
  memoryCache: new Map(),
  publicCache: new Map(),
  redisKey: slice => `standard:${standardMatchupSliceKey(slice)}`,
  redisGet: async key => { redisReads += 1; return redisStore.get(key) ?? null; },
  redisSet: async (key, data, etag) => { redisWrites.push(key); redisStore.set(key, { data, etag }); },
  getTranslations: async () => ({ source: 'translations' }),
  fetchPayload: source.fetchPayload,
  // The transform of a deployment adds history and a narrow-slice field: a projection must not copy them.
  transform: (payload, slice, translations) => ({
    ...source.transform(payload, slice, translations), history: 'SENTINEL_HISTORY', narrow: { legend: 'SENTINEL_NARROW' },
  }),
  memoryTtlMs: 100,
  redisTtlSeconds: 600,
  now: () => now,
  onError: (scope, error) => errors.push(`${scope}:${error instanceof Error ? error.message : error}`),
};

const started = async (overrides: Partial<StandardMatchupRouterDependencies> = {}) => {
  const instance = start(overrides);
  await new Promise<void>(resolve => instance.once('listening', resolve));
  return instance;
};
const start = (overrides: Partial<StandardMatchupRouterDependencies> = {}) => {
  const app = express();
  app.use('/api', createStandardMatchupRouter({ ...dependencies, ...overrides }));
  return app.listen(0, '127.0.0.1');
};
const server = start();
const bare = start({ publicCache: new Map(), redisGet: async () => null });
await Promise.all([server, bare].map(instance => new Promise<void>(resolve => instance.once('listening', resolve))));
const base = (instance: typeof server) => {
  const address = instance.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}/api`;
};

export function assertNoPaidLabels(body: string): void {
  for (const label of PAID) assert.ok(!body.includes(label), `paid label ${label} reached a guest`);
}

try {
  // A guest gets the general slice whatever the query asks for: the server picks the rank, floor and period.
  const open = await fetch(`${base(server)}/standard/matchups/public?format=wild&rank=legend&period=SENTINEL_PERIOD&min_games=10000`);
  assert.equal(open.status, 200);
  assert.match(open.headers.get('cache-control') ?? '', /^public, max-age=300/);
  assert.equal(open.headers.get('x-data-cache'), 'origin');
  const text = await open.text();
  assertNoPaidLabels(text);
  const body = JSON.parse(text);
  assert.equal(reads.length, 1);
  assert.match(reads[0], /format=wild&rank=all&min_games=25/, `only the general slice is read: ${reads[0]}`);
  assert.deepEqual(Object.keys(body).sort(), [
    'columns', 'format', 'formatLabel', 'minGames', 'period', 'rank', 'rankLabel', 'rows', 'source', 'sourceUrl', 'totalGames', 'updatedAt',
  ]);
  assert.equal(body.rank, 'all');
  assert.equal(body.period, 'bans');
  assert.deepEqual(body.columns.map((column: any) => column.name), ['Aggro Warlock', "C'Thun DH"], 'Other archetypes are not in the matrix');
  assert.deepEqual(Object.keys(body.columns[0]).sort(), ['classKey', 'games', 'label', 'name', 'popularity']);
  assert.deepEqual(Object.keys(body.rows[0]).sort(), ['archetype', 'archetypeLabel', 'cells', 'classKey', 'games', 'winrate']);
  assert.deepEqual(Object.keys(body.rows[0].cells[0]).sort(), ['games', 'opponent', 'winrate']);
  assert.equal(body.rows[0].archetypeLabel, 'Агро-чернокнижник');
  assert.deepEqual(body.rows[0].cells.map((cell: any) => [cell.winrate, cell.games]), [[50, 800], [54.2, 120]]);
  assert.equal(body.updatedAt, '2026-11-19T06:00:00Z');

  // Its own cache and ETag: a second read does not reach the origin, and a matching tag is a 304.
  const etag = open.headers.get('etag');
  assert.ok(etag);
  const again = await fetch(`${base(server)}/standard/matchups/public?format=wild`);
  assert.equal(again.headers.get('x-data-cache'), 'memory');
  assert.equal(again.headers.get('etag'), etag);
  assert.equal(reads.length, 1);
  assert.equal((await fetch(`${base(server)}/standard/matchups/public?format=wild`, { headers: { 'If-None-Match': etag } })).status, 304);
  assert.equal((await fetch(`${base(server)}/standard/matchups/public?format=twist`)).status, 400);
  assert.equal(redisWrites.at(-1), 'standard:wild|all|default|25:public-v1');

  // Concurrent misses of one format share a single origin read.
  now = 2_000;
  const before = reads.length;
  await Promise.all(Array.from({ length: 5 }, () => fetch(`${base(server)}/standard/matchups/public?format=standard`).then(answer => answer.text())));
  assert.equal(reads.length - before, 1);

  // The subscribers' route stays behind the guard and keeps the narrow ranks.
  for (const path of ['/standard/matchups', '/standard/matchups?rank=legend&format=wild']) {
    const denied = await fetch(`${base(server)}${path}`);
    assert.ok([401, 403].includes(denied.status), `${path} answers a guest with ${denied.status}`);
    assertNoPaidLabels(await denied.text());
  }
  const paid = await (await fetch(`${base(server)}/standard/matchups?rank=legend`, { headers: { 'X-Test-Access': 'allowed' } })).text();
  assert.ok(paid.includes('63.4') && paid.includes('SENTINEL_HISTORY'), 'the fixture really carries the sentinel on the paid route');

  // Mutation: a projection that spreads the dataset leaks the labels, and the sentinel turns red.
  const full = JSON.parse(paid);
  const leaky = { ...projectStandardMatchupsPublic(full, 'standard'), history: full.history, rows: full.rows, available: full.available };
  assert.throws(() => assertNoPaidLabels(JSON.stringify(leaky)), /paid label/, 'the sentinel must catch a leaking projection');
  // The projection itself drops the history, the period list and the narrow-slice field of a dataset.
  assert.doesNotMatch(JSON.stringify(projectStandardMatchupsPublic(full, 'standard')), /SENTINEL_/);

  // A failure: the stale copy first, flagged.
  now = 500_000;
  originFails = true;
  const stale = await fetch(`${base(server)}/standard/matchups/public?format=standard`);
  assert.equal(stale.status, 200);
  assert.equal(stale.headers.get('x-data-cache'), 'memory-stale');
  assert.equal((await stale.json() as any).warning, 'stale');
  assert.ok(errors.some(error => error.startsWith('origin:')));

  // No memory copy: the last good copy kept apart in Redis, flagged `fallback`, re-projected on the way out.
  const lastKey = 'standard:wild|all|default|25:public-v1';
  redisStore.set(lastKey, { data: { ...redisStore.get(lastKey)!.data, history: 'SENTINEL_HISTORY' }, etag: '"x"' });
  const restored = await started({ publicCache: new Map() });
  const fallback = await fetch(`${base(restored)}/standard/matchups/public?format=wild`);
  await new Promise(resolve => restored.close(resolve));
  assert.equal(fallback.status, 200);
  assert.equal(fallback.headers.get('x-data-cache'), 'fallback');
  const fallbackText = await fallback.text();
  assertNoPaidLabels(fallbackText);
  assert.equal(JSON.parse(fallbackText).warning, 'fallback');

  // Nothing at all: 503 with Retry-After, never 502, and no secret of the origin.
  const down = await fetch(`${base(bare)}/standard/matchups/public?format=standard`);
  assert.equal(down.status, 503);
  assert.equal(down.headers.get('retry-after'), '60');
  assert.equal(down.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await down.json(), { error: 'Standard matchups unavailable' });
  assert.ok(redisReads > 0);

  // An empty matrix is not a usable answer: it is a failure, never cached as a success.
  originFails = false;
  now = 900_000;
  const emptyApp = await started({ publicCache: new Map(), redisGet: async () => null, fetchPayload: async () => ({ data: { archetypes: [] } }) });
  const empty = await fetch(`${base(emptyApp)}/standard/matchups/public?format=standard`);
  assert.equal(empty.status, 503);
  await new Promise(resolve => emptyApp.close(resolve));
} finally {
  await Promise.all([server, bare].map(instance => new Promise<void>(resolve => instance.close(() => resolve()))));
}

console.log('standard matchups public route tests passed');
