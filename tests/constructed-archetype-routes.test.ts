import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import { setImmediate as flush } from 'node:timers/promises';
import { loadArchetypeCatalogForPeriod, loadArchetypeCatalogForSlug } from '../server/constructedArchetypeCatalogPeriod.js';
import { createArchetypeCatalogCache, createArchetypeRankMatrixLoader } from '../server/modules/constructedArchetypes/public.js';
import { withCatalogCardMedia } from '../server/modules/constructedCards/public.js';
import {
  createArchetypeCardDictionaries,
  createConstructedArchetypeRouter,
  constructedArchetypeSlug,
  type ConstructedArchetypeCatalog,
  type ConstructedArchetypeRouterDependencies,
} from '../server/constructedArchetypeRoutes.js';

assert.equal(withCatalogCardMedia([{ cardId: null, dbfId: null }], [
  { card_id: null, dbf: null, images: { tile: 'wrong-card.png' } },
])[0].tile, null, 'missing identities must never match an unrelated catalog card');
assert.equal(withCatalogCardMedia([{ cardId: 'TOY_330', dbfId: null }], [
  { card_id: 'TOY_330', images: { tile: 'same-card.png' } },
])[0].tile, 'same-card.png', 'card identity supplies media without a DBF');

const coreMedia = { card_id: 'CORE_REV_990', dbf: 999, images: {
  tile: 'core-tile.png', horizontal: 'core-horizontal.webp', art: 'core-full.jpg',
} };
const reissueRow = { cardId: 'REV_990', dbfId: 123, mulliganCount: 316 };
const enriched = withCatalogCardMedia([reissueRow], [coreMedia])[0];
assert.equal(enriched.tile, 'core-tile.png', 'Core reissues supply a tile for the original statistics ID');
assert.equal(enriched.fullArtwork, 'core-full.jpg', 'headers receive clean full artwork');
assert.equal(enriched.cardId, 'REV_990', 'media lookup preserves statistics identity');
assert.equal(enriched.mulliganCount, 316);
assert.equal(withCatalogCardMedia([reissueRow], [coreMedia, {
  card_id: 'REV_990', images: { tile: 'original-tile.png' },
}])[0].tile, 'original-tile.png', 'an exact edition always wins over a Core alias');
assert.equal(withCatalogCardMedia([{ cardId: 'CORE_REV_990', dbfId: null }], [{
  card_id: 'REV_990', images: { tile: 'original-tile.png' },
}])[0].tile, 'original-tile.png', 'Core statistics can use the original edition media');

const catalog: ConstructedArchetypeCatalog = {
  format: 'wild',
  formatLabel: 'Вольный',
  patch: '36.0.3',
  period: 'patch_36.0.3',
  availablePeriods: ['patch_36.0.3'],
  minimumGames: 50,
  updatedAt: '2026-07-24T12:38:57.727Z',
  coverage: { wild: { archetypes: 265, withDecks: 129 } },
  items: [{
    slug: 'thief-priest',
    archetype: 'Thief Priest',
    archetypeLabel: 'Воровской Жрец',
    translated: true,
    classKey: 'priest',
    format: 'wild',
    games: 31_959,
    winrate: 58.3,
    popularity: 13.5,
    turns: 7.9,
    durationMinutes: 8,
    climbingSpeed: 1.24,
    deckCount: 1,
    sourceUrl: 'https://www.hsguru.com/meta',
    builds: [{
      deckCode: 'AAECAf0GAfKiBALxogTzogQAAA==',
      games: 2_216,
      winrate: 57.1,
      sourceUrl: 'https://www.hsguru.com/deck/40919030',
      updatedAt: '2026-07-22T21:05:32.877Z',
      classKey: 'priest',
      sampleRank: 'all',
      samplePeriod: 'past_30_days',
    }],
  }],
};

const accessGuard: RequestHandler = (request, response, next) => {
  if (request.headers['x-test-access'] !== 'allowed') {
    return response.status(403).json({ error: 'diamond only' });
  }
  next();
};

let mediaAvailable = true;
let historyReads = 0, analysisReads = 0, mediaReads = 0;
let historyFails = false, analysisFails = false;
let catalogTime = 0, catalogReads = 0;
const catalogPeriods: Array<string | null> = [];
const slugReads: string[] = [];
let refresh: Promise<ConstructedArchetypeCatalog> | null = null;
const catalogCache = createArchetypeCatalogCache({
  ttlMs: 100, staleMs: 100, retryMs: 100, now: () => catalogTime,
  read: async format => {
    catalogReads += 1;
    return refresh ?? { ...catalog, format, formatLabel: format === 'standard' ? 'Стандарт' : 'Вольный' };
  },
});
const dependencies: ConstructedArchetypeRouterDependencies = {
  accessGuard,
  setPrivateNoStore: response => {
    response.set('Cache-Control', 'no-store');
    response.vary('Cookie');
  },
  loadCatalog: (format, period, slug) => {
    // Period keys of the cache are covered by constructed-archetype-catalog-period.test.ts.
    if (slug) slugReads.push(`${format}/${slug}`);
    else catalogPeriods.push(period ?? null);
    return catalogCache.load(format);
  },
  loadHistory: async () => { historyReads++; if (historyFails) throw new Error('History unavailable'); return [{
    recordedAt: '2026-07-24T12:38:57.727Z',
    games: 31_959,
    winrate: 41.4141,
    popularity: 13.5,
    turns: 7.9,
    durationMinutes: 8,
    climbingSpeed: 1.24,
  }]; },
  loadCardCatalog: async () => { mediaReads++; if (!mediaAvailable) throw new Error('Catalog unavailable'); return { cards: [{ card_id: 'different-id', dbf: 123, rarity: 'EPIC', images: { tile: 'https://api.kolodahearthstone.com/uploads/card-tiles/constructed_card/TOY_330-test.png', horizontal: 'https://api.kolodahearthstone.com/uploads/horizontal-art/constructed_card/TOY_330.webp' } },
    { card_id: 'TST_001', dbf: 70_001, name: { ru: 'Тестовый удар', en: 'Test Strike' }, mana_cost: 1, rarity: 'COMMON' },
    { card_id: 'TST_002', dbf: 70_002, name: { ru: 'Тестовый страж', en: 'Test Warden' }, mana_cost: 4, rarity: 'LEGENDARY' },
    { card_id: 'TST_003', dbf: 70_003, name: { ru: 'Тестовая буря', en: 'Test Storm' }, mana_cost: 2, rarity: 'RARE' }] }; },
  loadAnalysis: async () => { analysisReads++; if (analysisFails) throw new Error('Analysis unavailable'); return ({
    rank: 'legend',
    period: 'past_week',
    state: 'ok',
    updatedAt: '2026-07-24T13:00:00.000Z',
    matchupsUpdatedAt: '2026-07-24T13:00:00.000Z',
    cardStatsUpdatedAt: '2026-07-24T13:00:00.000Z',
    sourceUrls: {
      matchups: 'https://www.hsguru.com/archetype/Thief%20Priest?rank=legend',
      cards: 'https://www.hsguru.com/card-stats?archetype=Thief+Priest&rank=legend',
    },
    classMatchups: [{
      classKey: 'mage',
      classLabel: 'Mage',
      winrate: 54.2,
      games: 320,
      share: 12.4,
    }],
    cardStats: [{
      cardId: 'TOY_330',
      dbfId: 123,
      cardName: 'Гость из Бездны',
      cost: 3,
      mulliganImpact: 7.1717,
      mulliganCount: 1_250,
      drawnImpact: -1.2,
      drawnCount: 980,
      keptImpact: 6.2626,
      keptCount: 740,
    }],
  }); },
};

let rankReads = 0;
dependencies.loadRanks = createArchetypeRankMatrixLoader(async (_format, rank, period, coin) => {
  rankReads++;
  if (rank === 'top_legend' && period === 'past_day') throw new Error('slice unavailable');
  return {
    updatedAt: `2026-10-2${period === 'past_week' ? '1' : '0'}T08:00:00.000Z`,
    items: rank === 'legend' && period === 'past_3_days' ? [] : [{
      archetype: 'Thief Priest', winrate: coin === 'on_coin' ? 51.2 : coin === 'going_first' ? 58.4 : 55.5, games: 1_234,
    }],
  };
});

const app = express();
app.use('/api', createConstructedArchetypeRouter(dependencies));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}/api/constructed-archetypes`;
const headers = { 'X-Test-Access': 'allowed' };

try {
  assert.equal(constructedArchetypeSlug('Thief Priest'), 'thief-priest');

  const teaserListing = await fetch(`${origin}/teaser?format=wild`);
  assert.equal(teaserListing.status, 200, 'The archetype catalog teaser is public');
  assert.match(teaserListing.headers.get('cache-control') ?? '', /^public,/);
  const teaserListingBody = await teaserListing.json() as any;
  assert.equal(teaserListingBody.items.length, 1);
  assert.deepEqual(teaserListingBody.items[0].builds, []);
  assert.equal(JSON.stringify(teaserListingBody).includes('AAECAf0GAfKiBALxogTzogQAAA=='), false, 'the catalog lists no deck codes');

  // The period is optional: absent opens the default catalog, an unknown one is refused before any read.
  assert.equal(catalogPeriods.at(-1), null);
  assert.equal((await fetch(`${origin}/teaser?format=wild&period=nope`)).status, 400);
  assert.equal((await fetch(`${origin}?format=wild&period=nope`, { headers })).status, 400);
  assert.equal((await fetch(`${origin}/teaser?format=wild&period=black_empire_ban`)).status, 200);
  assert.equal(catalogPeriods.at(-1), 'black_empire_ban');
  assert.equal((await fetch(`${origin}/teaser?format=wild&period=violet_hold`)).status, 200);
  assert.equal(catalogPeriods.at(-1), 'black_empire', 'a retired window opens its successor');

  const teaserDetail = await fetch(`${origin}/teaser/wild/thief-priest`);
  assert.equal(teaserDetail.status, 200, 'The detail hero teaser is public');
  assert.match(teaserDetail.headers.get('cache-control') ?? '', /^public,/);
  const teaserDetailBody = await teaserDetail.json() as any;
  // Open layer (owner decision 2026-11-18): the builds with their deck codes and card lists, nothing else of a build.
  assert.deepEqual(teaserDetailBody.item.builds, [{
    deckCode: 'AAECAf0GAfKiBALxogTzogQAAA==', games: 2_216, winrate: 57.1, updatedAt: '2026-07-22T21:05:32.877Z',
    sampleRank: 'all', samplePeriod: 'past_30_days',
    cards: [
      { id: 'TST_001', name: 'Тестовый удар', cost: 1, count: 2, hasPage: true },
      { id: 'TST_003', name: 'Тестовая буря', cost: 2, count: 2, hasPage: true },
      { id: 'TST_002', name: 'Тестовый страж', cost: 4, count: 1, hasPage: true },
    ],
  }]);
  // Sentinel: the paid layer (mulligan and card statistics, class matchups, history, ranks) is never read for the open answer.
  for (const paid of ['7.1717', '6.2626', 'mulliganImpact', 'keptImpact', 'classMatchups', '54.2', '41.4141', 'hsguru.com/deck/']) {
    assert.equal(JSON.stringify(teaserDetailBody).includes(paid), false, `the open archetype answer carries ${paid}`);
  }
  assert.deepEqual([historyReads, analysisReads, rankReads, mediaReads], [0, 0, 0, 1]);
  assert.deepEqual(teaserDetailBody.history, []);
  assert.equal(teaserDetailBody.analysis, null);
  assert.deepEqual(teaserDetailBody.featuredBuild, {
    games: 2_216,
    winrate: 57.1,
    updatedAt: '2026-07-22T21:05:32.877Z',
    sampleRank: 'all',
    samplePeriod: 'past_30_days',
  });

  assert.equal((await fetch(`${origin}?format=wild`)).status, 403);

  const listing = await fetch(`${origin}?format=wild&q=thief`, { headers });
  assert.equal(listing.status, 200);
  const listingBody = await listing.json() as any;
  assert.equal(listingBody.items.length, 1);
  assert.equal(listingBody.items[0].deckCount, 1);
  assert.deepEqual(listingBody.items[0].builds, []);
  assert.equal(listing.headers.get('cache-control'), 'no-store');

  for (const section of ['core', 'history', 'analysis']) {
    assert.equal((await fetch(`${origin}/wild/thief-priest?section=${section}`)).status, 403);
  }
  const core = await fetch(`${origin}/wild/thief-priest?section=core`, { headers });
  const coreBody = await core.json() as any;
  assert.equal(core.status, 200);
  assert.equal(coreBody.item.builds[0].deckCode, catalog.items[0].builds[0].deckCode);
  assert.deepEqual(coreBody.history, []);
  assert.equal(coreBody.analysis, null);
  assert.deepEqual([historyReads, analysisReads, mediaReads], [0, 0, 1], 'core must not start optional work');
  assert.equal(core.headers.get('cache-control'), 'no-store');
  const history = await fetch(`${origin}/wild/thief-priest?section=history`, { headers });
  assert.equal((await history.json() as any).history.length, 1);
  assert.deepEqual([historyReads, analysisReads, mediaReads], [1, 0, 1]);
  const analysis = await fetch(`${origin}/wild/thief-priest?section=analysis`, { headers });
  assert.equal((await analysis.json() as any).analysis.cardStats[0].rarity, 'EPIC');
  assert.deepEqual([historyReads, analysisReads, mediaReads], [1, 1, 2]);
  historyFails = true; analysisFails = true;
  assert.equal((await fetch(`${origin}/wild/thief-priest?section=core`, { headers })).status, 200);
  assert.equal((await fetch(`${origin}/wild/thief-priest?section=history`, { headers })).status, 502);
  assert.equal((await fetch(`${origin}/wild/thief-priest?section=analysis`, { headers })).status, 502);
  historyFails = false; analysisFails = false;
  for (const section of ['wrong', 'core&section=history']) {
    assert.equal((await fetch(`${origin}/wild/thief-priest?section=${section}`, { headers })).status, 400);
  }
  assert.equal((await fetch(`${origin}/wild/missing?section=analysis`, { headers })).status, 404);

  // Winrate by rank and period: 5 ranks × 7 periods and the Bans window by coin; a failed or missing slice leaves one empty cell.
  assert.equal((await fetch(`${origin}/wild/thief-priest?section=ranks`)).status, 403);
  const ranks = await fetch(`${origin}/wild/thief-priest?section=ranks`, { headers });
  assert.equal(ranks.status, 200);
  const ranksBody = await ranks.json() as any;
  assert.deepEqual(ranksBody.ranks.ranks.map((rank: any) => rank.label), ['Алмаз 1–4', 'Алмаз — Легенда', 'Легенда', 'Топ-5000', 'Топ-1000']);
  assert.deepEqual(ranksBody.ranks.periods.slice(-2).map((period: any) => period.label), ['Тёмная империя', 'Баны']);
  assert.equal(ranksBody.ranks.cells.length, 35);
  assert.equal(rankReads, 45);
  assert.equal(ranksBody.ranks.coins.period, 'black_empire_ban');
  assert.deepEqual(ranksBody.ranks.coins.columns.map((column: any) => column.label), ['Первым ходом', 'С монеткой']);
  assert.deepEqual(ranksBody.ranks.coins.cells.filter((cell: any) => cell.rank === 'legend'), [
    { rank: 'legend', period: 'going_first', winrate: 58.4, games: 1_234 },
    { rank: 'legend', period: 'on_coin', winrate: 51.2, games: 1_234 },
  ]);
  assert.deepEqual(ranksBody.ranks.cells.find((cell: any) => cell.rank === 'diamond' && cell.period === 'past_week'),
    { rank: 'diamond', period: 'past_week', winrate: 55.5, games: 1_234 });
  assert.equal(ranksBody.ranks.cells.find((cell: any) => cell.rank === 'top_legend' && cell.period === 'past_day').winrate, null);
  assert.equal(ranksBody.ranks.cells.find((cell: any) => cell.rank === 'legend' && cell.period === 'past_3_days').games, null);
  assert.equal(ranksBody.ranks.updatedAt, '2026-10-21T08:00:00.000Z');
  assert.equal(ranks.headers.get('cache-control'), 'no-store');

  const detail = await fetch(`${origin}/wild/thief-priest`, { headers });
  assert.equal(detail.status, 200);
  const detailBody = await detail.json() as any;
  assert.equal(detailBody.item.archetype, 'Thief Priest');
  assert.ok(slugReads.includes('wild/thief-priest'), 'the detail page looks the slug up through the window chain');
  assert.equal(detailBody.history.length, 1);
  assert.equal(detailBody.analysis.rank, 'legend');
  assert.equal(detailBody.analysis.classMatchups[0].classKey, 'mage');
  assert.equal(detailBody.analysis.cardStats[0].mulliganImpact, 7.1717);
  assert.equal(detailBody.analysis.cardStats[0].cost, 3);
  assert.equal(detailBody.analysis.cardStats[0].tile, 'https://api.kolodahearthstone.com/uploads/card-tiles/constructed_card/TOY_330-test.png');
  assert.equal(detailBody.analysis.cardStats[0].rarity, 'EPIC');
  mediaAvailable = false;
  const withoutMedia = await fetch(`${origin}/wild/thief-priest`, { headers });
  assert.equal(withoutMedia.status, 200);
  const withoutMediaBody = await withoutMedia.json() as any;
  assert.equal(withoutMediaBody.analysis.cardStats[0].tile, null);
  assert.equal(withoutMediaBody.analysis.cardStats[0].mulliganImpact, 7.1717);

  assert.equal((await fetch(`${origin}/classic/thief-priest`, { headers })).status, 400);
  assert.equal((await fetch(`${origin}/wild/missing`, { headers })).status, 404);

  let finishRefresh!: (value: ConstructedArchetypeCatalog) => void;
  refresh = new Promise(resolve => { finishRefresh = resolve; });
  catalogTime = 100;
  try {
    const responses = await Promise.all([
      fetch(`${origin}/teaser/wild/thief-priest`, { signal: AbortSignal.timeout(2_000) }),
      fetch(`${origin}/wild/thief-priest`, { headers, signal: AbortSignal.timeout(2_000) }),
      fetch(`${origin}/wild/thief-priest`),
    ]);
    assert.deepEqual(responses.map(response => response.status), [200, 200, 403]);
    const guest = await responses[0].json() as any;
    const member = await responses[1].json() as any;
    assert.deepEqual(Object.keys(guest.item.builds[0]), ['deckCode', 'games', 'winrate', 'updatedAt', 'sampleRank', 'samplePeriod', 'cards'],
      'refresh must preserve the public projection');
    assert.equal(guest.item.builds[0].cards, null, 'without the card catalog a build keeps its code and loses only the list');
    assert.equal(member.item.builds[0].deckCode, catalog.items[0].builds[0].deckCode);
    assert.equal(responses[1].headers.get('cache-control'), 'no-store');
    assert.equal(catalogReads, 2, 'guest and protected routes share a single refresh');
  } finally {
    finishRefresh({ ...catalog, updatedAt: '2026-07-24T13:00:00.000Z' });
    await flush();
  }
  const refreshed = await fetch(`${origin}?format=wild`, { headers });
  assert.equal((await refreshed.json() as any).updatedAt, '2026-07-24T13:00:00.000Z');
} finally {
  catalogCache.clear();
  await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
}

// API -> window choice -> route: the real window chain behind the routes, with a fixture HSGuru source.
{
  const windows = ['black_empire', 'black_empire_ban', 'patch_37.0.2'];
  const thief = catalog.items[0];
  const patchTen = { ...thief, archetype: 'Patch Ten', archetypeLabel: 'Patch Ten', slug: 'patch-ten' };
  const window = (period: string, patch: string, items: typeof catalog.items) => ({
    ...catalog, format: 'standard' as const, formatLabel: 'Стандарт', period, patch, availablePeriods: windows, items,
    currentPatchPeriod: 'patch_37.0.2',
  });
  const served: Record<string, ConstructedArchetypeCatalog | Error> = {
    'patch_37.0.2': window('patch_37.0.2', '37.0.2', [patchTen]),
    black_empire_ban: window('black_empire_ban', 'black_empire_ban', [thief, patchTen]),
  };
  const source = window('black_empire', '', [thief, patchTen]);
  const load = async (_format: 'standard' | 'wild', period?: string) => {
    const answer = period ? served[period] : source;
    if (answer instanceof Error) throw answer;
    return answer ?? source;
  };
  const chainApp = express();
  chainApp.use('/api', createConstructedArchetypeRouter({
    ...dependencies,
    loadCatalog: (format, period, slug) => (slug
      ? loadArchetypeCatalogForSlug(load, format, slug) : loadArchetypeCatalogForPeriod(load, format, period)),
  }));
  const chainServer = chainApp.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => chainServer.once('listening', resolve));
  const chainAddress = chainServer.address();
  assert.ok(chainAddress && typeof chainAddress === 'object');
  const chain = `http://127.0.0.1:${chainAddress.port}/api/constructed-archetypes`;
  const read = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${chain}${path}`, init);
    return { status: response.status, body: await response.json() as any };
  };
  try {
    let answer = await read('/teaser?format=standard');
    assert.deepEqual([answer.body.period, answer.body.patch], ['patch_37.0.2', '37.0.2']);
    answer = await read('/teaser/standard/patch-ten');
    assert.deepEqual([answer.status, answer.body.patch], [200, '37.0.2']);
    // Not in the shorter patch window, found in Bans: the page names that window.
    answer = await read('/teaser/standard/thief-priest');
    assert.deepEqual([answer.status, answer.body.patch], [200, 'black_empire_ban']);
    answer = await read('/standard/thief-priest', { headers });
    assert.deepEqual([answer.status, answer.body.patch, answer.body.item.slug], [200, 'black_empire_ban', 'thief-priest']);
    answer = await read('/standard/patch-ten', { headers });
    assert.deepEqual([answer.status, answer.body.patch], [200, '37.0.2']);
    assert.equal((await read('/teaser/standard/nobody')).status, 404);
    assert.equal((await read('/standard/nobody', { headers })).status, 404);
    answer = await read('/teaser?format=standard&period=black_empire_ban');
    assert.equal(answer.body.period, 'black_empire_ban');
    // A failed patch window falls back to Bans, then to the source window, never to a 5xx.
    served['patch_37.0.2'] = new Error('HTTP 500');
    answer = await read('/teaser?format=standard');
    assert.deepEqual([answer.status, answer.body.period], [200, 'black_empire_ban']);
    served.black_empire_ban = new Error('HTTP 500');
    answer = await read('/teaser?format=standard');
    assert.deepEqual([answer.status, answer.body.period], [200, 'black_empire']);
  } finally {
    await new Promise<void>((resolve, reject) => chainServer.close(error => (error ? reject(error) : resolve())));
  }
}

{
  // Open builds (#444): every build is open, a page of 8 at a time; a stalled or failed card catalog never holds the
  // answer, which then carries the codes without card lists and a short cache, so the lists come back with the catalog.
  const nine = { ...catalog.items[0], slug: 'nine', deckCount: 9,
    builds: Array.from({ length: 9 }, () => catalog.items[0].builds[0]) };
  let cardsMode: 'ok' | 'fail' | 'hang' = 'ok';
  const cardCatalog = { cards: [{ card_id: 'TST_001', dbf: 70_001, name: { ru: 'Тестовый удар' }, mana_cost: 1 },
    { card_id: 'TST_002', dbf: 70_002, name: { ru: 'Тестовый страж' }, mana_cost: 4 },
    { card_id: 'TST_003', dbf: 70_003, name: { ru: 'Тестовая буря' }, mana_cost: 2 }] };
  const openApp = express();
  openApp.use('/api', createConstructedArchetypeRouter({
    ...dependencies, cardCatalogDeadlineMs: 200,
    loadCatalog: async () => ({ ...catalog, items: [nine] }),
    loadCardCatalog: () => (cardsMode === 'hang' ? new Promise(() => {})
      : cardsMode === 'fail' ? Promise.reject(new Error('Catalog unavailable')) : Promise.resolve(cardCatalog)),
  }));
  const openServer = openApp.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => openServer.once('listening', resolve));
  const openAddress = openServer.address();
  assert.ok(openAddress && typeof openAddress === 'object');
  const read = async (query = '') => {
    const response = await fetch(`http://127.0.0.1:${openAddress.port}/api/constructed-archetypes/teaser/wild/nine${query}`,
      { signal: AbortSignal.timeout(2_000) });
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() as any };
  };
  try {
    let answer = await read();
    assert.deepEqual([answer.body.item.builds.length, answer.body.buildsTotal, answer.body.buildsOffset, answer.body.nextOffset], [8, 9, 0, 8]);
    assert.equal(answer.cache, 'public, max-age=300, stale-while-revalidate=900');
    answer = await read('?buildsOffset=8');
    assert.deepEqual([answer.body.item.builds.length, answer.body.buildsTotal, answer.body.buildsOffset, answer.body.nextOffset], [1, 9, 8, null]);
    assert.equal(answer.body.item.builds[0].cards.length, 3, 'the ninth build is open with its card list');
    assert.equal((await read('?buildsOffset=-1')).status, 400);
    assert.equal((await read('?buildsOffset=abc')).status, 400);
    cardsMode = 'hang';
    answer = await read();
    assert.equal(answer.status, 200, 'a stalled card catalog does not hold the answer');
    assert.deepEqual(answer.body.item.builds.map((build: any) => build.cards), Array(8).fill(null));
    assert.equal(answer.body.item.builds[0].deckCode, 'AAECAf0GAfKiBALxogTzogQAAA==');
    assert.equal(answer.cache, 'public, max-age=30, stale-while-revalidate=30');
    cardsMode = 'fail';
    answer = await read();
    assert.deepEqual([answer.body.item.builds[0].cards, answer.cache], [null, 'public, max-age=30, stale-while-revalidate=30']);
    cardsMode = 'ok';
    answer = await read();
    assert.deepEqual([answer.body.item.builds[0].cards.length, answer.cache], [3, 'public, max-age=300, stale-while-revalidate=900'],
      'the lists are back once the catalog answers');
  } finally {
    openServer.closeAllConnections();
    await new Promise<void>(resolve => openServer.close(() => resolve()));
  }
}

{
  // Regression (QA on PR 552): a real «Айяйя Разбойник» deck with Гарона Полуорчиха. Its two companion cards are in the
  // deck code but not in the format's catalog; they must not drop the list. They are named from the deck builder's
  // dictionaries and listed without a page link; a card no dictionary knows keeps its place and count.
  const GARONA_DECK = 'AAECAaIHCs7+BsODB4aoB4eoB4ioB+WvB5qzB6XYB4jZB8OLCAqRnwT3nwTZogbBlwe0wQfFwQfVxQek2AeR2QeN2gcAAA==';
  const garonaCatalog = { cards: [
    { card_id: 'CORE_CS2_072', dbf: 69521, name: { ru: 'Удар в спину' }, mana_cost: 0 },
    { card_id: 'CORE_EX1_145', dbf: 69623, name: { ru: 'Подготовка' }, mana_cost: 0 },
    { card_id: 'CORE_EX1_129', dbf: 102745, name: { ru: 'Веер клинков' }, mana_cost: 2 },
    { card_id: 'EDR_523', dbf: 114510, name: { ru: 'Паутина обмана' }, mana_cost: 2 },
    { card_id: 'EDR_856', dbf: 115139, name: { ru: 'Повелитель кошмаров Ксавий' }, mana_cost: 4 },
    { card_id: 'TLC_515', dbf: 117697, name: { ru: 'Карта сектантов' }, mana_cost: 2 },
    { card_id: 'TIME_875', dbf: 119814, name: { ru: 'Гарона Полуорчиха' }, mana_cost: 4 },
    { card_id: 'TIME_713', dbf: 120805, name: { ru: 'Хроноадмирал Крюкохвост' }, mana_cost: 5 },
    { card_id: 'END_000', dbf: 121242, name: { ru: 'Бесчисленные возможности' }, mana_cost: 2 },
    { card_id: 'CATA_200', dbf: 123060, name: { ru: 'Агент Древних' }, mana_cost: 1 },
    { card_id: 'CATA_203', dbf: 123077, name: { ru: 'Последний бой Гароны' }, mana_cost: 2 },
    { card_id: 'CATA_785', dbf: 123605, name: { ru: 'Сумеречный обряд' }, mana_cost: 2 },
    { card_id: 'JAIL_503', dbf: 125988, name: { ru: 'Кнут Черной Лапы' }, mana_cost: 3 },
    { card_id: 'JAIL_504', dbf: 125989, name: { ru: 'Айя, главарь «Лотоса»' }, mana_cost: 6 },
    { card_id: 'CORE_RLK_567', dbf: 126088, name: { ru: 'Гибельная тень' }, mana_cost: 0 },
    { card_id: 'CATA_EVENT_402', dbf: 126097, name: { ru: 'Смертельная взятка' }, mana_cost: 3 },
    { card_id: 'JAIL_720', dbf: 126221, name: { ru: 'Букмекер из «Лотоса»' }, mana_cost: 2 },
    { card_id: 'BE_009', dbf: 132547, name: { ru: 'Манипулятор Йогг-Сарон' }, mana_cost: 9 },
  ] };
  // `cards_ru.json` names the companions as «<legendary> (<n> - <name>)».
  const cardsRu = {
    TIME_875t: { name: 'Гарона Полуорчиха (1 - Король Ллейн)', mana: 3, rarity: '', dbf: 119815 },
    TIME_875t1: { name: 'Гарона Полуорчиха (2 - Убийцы Королей)', mana: 2, rarity: '', dbf: 119816 },
  };
  let dictionariesFail = false;
  const ayaya = { ...catalog.items[0], slug: 'ayaya-rogue', classKey: 'rogue' as const, format: 'standard' as const,
    builds: [{ ...catalog.items[0].builds[0], deckCode: GARONA_DECK }] };
  const garonaApp = express();
  garonaApp.use('/api', createConstructedArchetypeRouter({
    ...dependencies, cardCatalogDeadlineMs: 200,
    loadCatalog: async () => ({ ...catalog, format: 'standard', items: [ayaya] }),
    loadCardCatalog: async () => garonaCatalog,
    loadCardDictionaries: async () => { if (dictionariesFail) throw new Error('HearthstoneJSON unavailable'); return [cardsRu]; },
  }));
  const garonaServer = garonaApp.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => garonaServer.once('listening', resolve));
  const garonaAddress = garonaServer.address();
  assert.ok(garonaAddress && typeof garonaAddress === 'object');
  const readAyaya = async () => {
    const response = await fetch(`http://127.0.0.1:${garonaAddress.port}/api/constructed-archetypes/teaser/standard/ayaya-rogue`);
    return { cache: response.headers.get('cache-control'), cards: (await response.json() as any).item.builds[0].cards };
  };
  try {
    let answer = await readAyaya();
    assert.equal(answer.cards.length, 20, 'the whole main deck is listed');
    assert.equal(answer.cards.reduce((sum: number, card: any) => sum + card.count, 0), 30);
    assert.deepEqual(answer.cards.filter((card: any) => card.id?.startsWith('TIME_875')), [
      { id: 'TIME_875t1', name: 'Убийцы Королей', cost: 2, count: 1, hasPage: false },
      { id: 'TIME_875t', name: 'Король Ллейн', cost: 3, count: 1, hasPage: false },
      { id: 'TIME_875', name: 'Гарона Полуорчиха', cost: 4, count: 1, hasPage: true },
    ]);
    assert.equal(answer.cards.filter((card: any) => card.hasPage).length, 18, 'every card of the catalog links to its page');
    assert.equal(answer.cache, 'public, max-age=300, stale-while-revalidate=900');
    dictionariesFail = true;
    answer = await readAyaya();
    assert.equal(answer.cards.length, 20, 'without the dictionaries the list stays whole');
    assert.deepEqual(answer.cards.slice(-2), [
      { id: null, name: null, cost: null, count: 1, hasPage: false },
      { id: null, name: null, cost: null, count: 1, hasPage: false },
    ]);
    assert.equal(answer.cache, 'public, max-age=30, stale-while-revalidate=30', 'an unnamed card is back soon');
  } finally {
    garonaServer.closeAllConnections();
    await new Promise<void>(resolve => garonaServer.close(() => resolve()));
  }
}

{
  // The card dictionaries of the open builds, as production wires them: the local `cards_ru.json` always answers, whatever
  // HearthstoneJSON does; HearthstoneJSON is read once and kept, a failure is retried only after a pause, never per render.
  const local = { TIME_875t: { name: 'Гарона Полуорчиха (1 - Король Ллейн)', mana: 3, rarity: '', dbf: 119815 } };
  const remote = { TIME_850t: { name: 'Кровавый боец Бролл', mana: 3, rarity: '', dbf: 119453 } };
  let clock = 0, calls = 0, mode: 'hang' | 'fail' | 'ok' = 'hang';
  const source = () => {
    calls += 1;
    return mode === 'hang' ? new Promise<Record<string, unknown>>(() => {}) : mode === 'fail' ? Promise.reject(new Error('HearthstoneJSON 503')) : Promise.resolve(remote);
  };
  const options = { local: () => local, remote: source, deadlineMs: 50, retryMs: 60_000, ttlMs: 6 * 3_600_000, now: () => clock };
  const hanging = createArchetypeCardDictionaries(options);
  const started = Date.now();
  assert.deepEqual(await hanging(), [local], 'a stalled HearthstoneJSON keeps the local dictionary');
  assert.ok(Date.now() - started < 1_000);
  assert.deepEqual(await hanging(), [local]);
  assert.equal(calls, 1, 'one request in flight, not one per render');
  calls = 0; mode = 'fail';
  const failing = createArchetypeCardDictionaries(options);
  assert.deepEqual(await failing(), [local], 'a failed HearthstoneJSON keeps the local dictionary');
  assert.deepEqual(await failing(), [local]);
  assert.equal(calls, 1, 'a failure is not retried on every render');
  clock += 60_000; mode = 'ok';
  assert.deepEqual(await failing(), [local, remote], 'after the pause HearthstoneJSON is read again');
  clock += 1_000;
  assert.deepEqual(await failing(), [local, remote]);
  assert.equal(calls, 2, 'a loaded HearthstoneJSON is kept');
  const noLocal = createArchetypeCardDictionaries({ ...options, local: () => { throw new Error('cards_ru.json unreadable'); } });
  assert.deepEqual(await noLocal(), [remote], 'an unreadable local file keeps HearthstoneJSON');
}
