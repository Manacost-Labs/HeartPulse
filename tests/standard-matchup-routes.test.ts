import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import {
  createStandardMatchupRouter,
  excludeOtherStandardMatchups,
  parseStandardMatchupSlice,
  standardMatchupSliceDependencies,
  standardMatchupSliceKey,
  standardMatchupSlicePath,
  transformHsguruMatchups,
  transformHsguruMatchupSlice,
  type StandardMatchupRouterDependencies,
  type StandardMatchupSlice,
} from '../server/standardMatchupRoutes.js';

// A request names a slice; unknown values fall back to the defaults and never reach the source.
assert.deepEqual(parseStandardMatchupSlice({}), { format: 'standard', rank: 'legend', period: null, minGames: 25 });
assert.deepEqual(parseStandardMatchupSlice({
  format: 'wild', rank: 'top_legend', period: 'black_empire_ban', min_games: '100',
}), { format: 'wild', rank: 'top_legend', period: 'black_empire_ban', minGames: 100 });
assert.deepEqual(parseStandardMatchupSlice({
  format: 'twist', rank: 'top_100', period: '../admin', min_games: '7',
}), { format: 'standard', rank: 'legend', period: null, minGames: 25 });
assert.equal(standardMatchupSlicePath(parseStandardMatchupSlice({ rank: 'all', period: 'past_day', min_games: '1' })),
  'v1/hsguru/matchups?format=standard&rank=all&min_games=1&limit=60&period=past_day');
assert.equal(standardMatchupSlicePath(parseStandardMatchupSlice({})),
  'v1/hsguru/matchups?format=standard&rank=legend&min_games=25&limit=60', 'no period asks the source default (Bans)');

// The unified API: archetypes by games, pairs with games; a pair below the minimum is null.
const slice = transformHsguruMatchupSlice({
  data: {
    period: 'black_empire_ban', checked_at: '2026-10-25T16:31:28Z', total_games: 1430,
    source_url: 'https://www.hsguru.com/matchups?format=2&rank=legend&period=black_empire_ban',
    archetypes: [
      { archetype: 'Aggro Warlock', class: 'WARLOCK', games: 1000, winrate: 56.5, popularity_pct: 69.93 },
      { archetype: "C'Thun DH", class: 'DEMONHUNTER', games: 400, winrate: 51.2, popularity_pct: 27.97 },
    ],
    matchups: [
      { archetype: 'Aggro Warlock', opponent: 'Aggro Warlock', winrate: 50, games: 300 },
      { archetype: 'Aggro Warlock', opponent: "C'Thun DH", winrate: 54.2, games: 120 },
      { archetype: "C'Thun DH", opponent: 'Aggro Warlock', winrate: 45.8, games: 120 },
    ],
  },
  meta: { available: { periods: ['past_day', 'black_empire', 'black_empire_ban', 'bad period'],
    current_period: 'black_empire', default_period: 'black_empire_ban' } },
}, parseStandardMatchupSlice({ min_games: '100' }), { formatLabel: 'Стандарт', sourceId: 'hsguru_matchups',
  translationSource: 'test', translate: name => (name === 'Aggro Warlock' ? 'Агро-чернокнижник' : name) });
assert.equal(slice.rank, 'legend');
assert.equal(slice.rankLabel, 'Легенда');
assert.equal(slice.period, 'black_empire_ban');
assert.equal(slice.minGames, 100);
assert.equal(slice.totalGames, 1430);
assert.deepEqual(slice.available.periods, ['past_day', 'black_empire', 'black_empire_ban']);
assert.deepEqual(slice.columns.map(column => [column.name, column.classKey, column.popularity, column.games]), [
  ['Aggro Warlock', 'warlock', '69.9%', 1000], ["C'Thun DH", 'demonhunter', '28.0%', 400],
]);
assert.equal(slice.rows[0].archetypeLabel, 'Агро-чернокнижник');
assert.deepEqual(slice.rows.map(row => row.cells.map(cell => [cell.winrate, cell.games])), [
  [[50, 300], [54.2, 120]], [[45.8, 120], [null, 0]],
]);

const filteredFixture = excludeOtherStandardMatchups({
  columns: [
    { name: 'Control Priest' },
    { name: 'Other Priest' },
    { name: 'Tempo Rogue' },
    { name: 'Other DK' },
  ],
  rows: [
    {
      archetype: 'Control Priest',
      cells: [
        { opponent: 'Control Priest', winrate: 50 },
        { opponent: 'Other Priest', winrate: 55 },
        { opponent: 'Tempo Rogue', winrate: 47 },
        { opponent: 'Other DK', winrate: 51 },
      ],
    },
    { archetype: 'Other Priest', cells: [] },
    { archetype: 'Other Rogue', cells: [] },
    {
      archetype: 'Tempo Rogue',
      cells: [
        { opponent: 'Control Priest', winrate: 53 },
        { opponent: 'Other Priest', winrate: 45 },
        { opponent: 'Tempo Rogue', winrate: 50 },
        { opponent: 'Other DK', winrate: 49 },
      ],
    },
  ],
});
assert.deepEqual(filteredFixture.columns.map((column: any) => column.name), ['Control Priest', 'Tempo Rogue']);
assert.deepEqual(filteredFixture.rows.map((row: any) => row.archetype), ['Control Priest', 'Tempo Rogue']);
assert.deepEqual(
  filteredFixture.rows.map((row: any) => row.cells.map((cell: any) => cell.opponent)),
  [['Control Priest', 'Tempo Rogue'], ['Control Priest', 'Tempo Rogue']],
  'Other class aggregates must be removed from rows, columns and cells',
);

// HSGuru's popularity row has one value per archetype column (no cell for the
// win-rate and name columns); an empty cell is a pair below the source sample.
const hsguru = transformHsguruMatchups({
  fetched_at: '2026-10-21T05:19:59Z',
  data: {
    url: 'https://www.hsguru.com/matchups?min_matchup_sample=25&rank=legend',
    tables: [{
      headers: ['Winrate', 'Popularity: Archetype', 'Quest Priest', 'Harold DK', 'Rafaamlock'],
      rows: [
        ['26.2%', '2.9%', '0.8%'],
        ['56.6', 'Quest Priest', '50.0', '77.1', ''],
        ['47.0', 'Harold DK', '22.9', '50.0', '51,5'],
      ],
    }],
  },
}, 'standard', { formatLabel: 'Стандарт', sourceId: 'hsguru_matchups_legend', translationSource: 'test',
  translate: name => (name === 'Harold DK' ? 'Рыцарь смерти на возвещении' : name) });
assert.deepEqual(hsguru.columns.map(column => [column.name, column.classKey, column.popularity]), [
  ['Quest Priest', 'priest', '26.2%'], ['Harold DK', 'deathknight', '2.9%'], ['Rafaamlock', 'warlock', '0.8%'],
], 'each archetype column must read its own popularity and class');
assert.deepEqual(hsguru.rows.map(row => [row.archetype, row.classKey, row.winrate, row.cells.map(cell => cell.winrate)]), [
  ['Quest Priest', 'priest', 56.6, [50, 77.1, null]], ['Harold DK', 'deathknight', 47, [22.9, 50, 51.5]],
]);
assert.equal(hsguru.rows[1].archetypeLabel, 'Рыцарь смерти на возвещении');
assert.equal(hsguru.sourceUrl, 'https://www.hsguru.com/matchups?min_matchup_sample=25&rank=legend');

// The composition root names only its origin, fetcher and labels.
const fetchedUrls: string[] = [];
const sliceSource = standardMatchupSliceDependencies({
  origin: 'https://api.example.test/', formatLabel: format => format.toUpperCase(),
  fetchJson: async url => { fetchedUrls.push(url); return { data: { archetypes: [{ archetype: 'Tempo Rogue', games: 5 }] } }; },
  translate: (name, map) => map?.[name] ?? name,
});
const sourced = sliceSource.transform(await sliceSource.fetchPayload(parseStandardMatchupSlice({ format: 'wild' })),
  parseStandardMatchupSlice({ format: 'wild' }), { source: 'db', map: { 'Tempo Rogue': 'Темп-разбойник' } });
assert.deepEqual(fetchedUrls, ['https://api.example.test/v1/hsguru/matchups?format=wild&rank=legend&min_games=25&limit=60']);
assert.equal(sourced.formatLabel, 'WILD');
assert.equal(sourced.rows[0].archetypeLabel, 'Темп-разбойник');

let now = 1_000;
let redisMode: 'miss' | 'hit' | 'error' = 'miss';
let originFails = false;
const fetchFormats: string[] = [];
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
  redisKey: slice => `standard:${standardMatchupSliceKey(slice)}`,
  redisGet: async key => {
    if (redisMode === 'error') throw new Error('redis secret');
    if (redisMode === 'hit') {
      const format = key.includes(':wild') ? 'wild' : 'standard';
      return {
        etag: `"redis-${format}"`,
        data: { rows: [{ id: format }], columns: ['one'], translationSource: 'redis', updatedAt: null },
      };
    }
    return null;
  },
  redisSet: async (key, data, etag, ttl) => { redisWrites.push({ key, data, etag, ttl }); },
  fetchPayload: async (slice: StandardMatchupSlice) => {
    fetchFormats.push(standardMatchupSliceKey(slice));
    if (originFails) throw new Error('origin secret');
    return { format: slice.format };
  },
  getTranslations: async timestamp => {
    translationTimes.push(timestamp);
    return { source: 'translations' };
  },
  transform: (payload, slice) => ({
    rows: [{ id: `${payload.format}-row` }],
    columns: ['left', 'right'],
    translationSource: 'local',
    updatedAt: slice.format === 'wild' ? '2026-07-12T12:00:00.000Z' : null,
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

  memoryCache.set('standard|legend|default|25', {
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
  assert.equal(memoryCache.get('wild|legend|default|25')?.expiresAt, 1_100);

  memoryCache.clear();
  redisMode = 'error';
  const fromOrigin = await get('/standard/matchups?format=wild', { 'X-Test-Access': 'allowed' });
  assert.equal(fromOrigin.status, 200);
  assert.equal(fromOrigin.headers.get('x-data-cache'), 'origin');
  assert.match(fromOrigin.headers.get('etag') || '', /^"standard-matchups-v8-wild-legend-default-25-/);
  assert.equal((await fromOrigin.json() as any).rows[0].id, 'wild-row');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(fetchFormats, ['wild|legend|default|25']);
  assert.deepEqual(translationTimes, [1_000]);
  assert.equal(redisWrites[0].key, 'standard:wild|legend|default|25:without-other-v3');

  // Each slice has its own cache entry and origin request.
  const ranked = await get('/standard/matchups?format=wild&rank=all&period=past_day&min_games=100',
    { 'X-Test-Access': 'allowed' });
  assert.equal(ranked.headers.get('x-data-cache'), 'origin');
  assert.match(ranked.headers.get('etag') || '', /^"standard-matchups-v8-wild-all-past_day-100-/);
  assert.equal(fetchFormats.at(-1), 'wild|all|past_day|100');
  assert.ok(memoryCache.has('wild|all|past_day|100'));
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
