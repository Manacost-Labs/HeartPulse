import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import { setImmediate as flush } from 'node:timers/promises';
import { createArchetypeCatalogCache, createArchetypeRankMatrixLoader } from '../server/modules/constructedArchetypes/public.js';
import { withCatalogCardMedia } from '../server/modules/constructedCards/public.js';
import {
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
      deckCode: 'AAEBAa0GValidDeckCode',
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
  loadCatalog: (format, period) => {
    // Period keys of the cache are covered by constructed-archetype-catalog-period.test.ts.
    catalogPeriods.push(period ?? null);
    return catalogCache.load(format);
  },
  loadHistory: async () => { historyReads++; if (historyFails) throw new Error('History unavailable'); return [{
    recordedAt: '2026-07-24T12:38:57.727Z',
    games: 31_959,
    winrate: 58.3,
    popularity: 13.5,
    turns: 7.9,
    durationMinutes: 8,
    climbingSpeed: 1.24,
  }]; },
  loadCardCatalog: async () => { mediaReads++; if (!mediaAvailable) throw new Error('Catalog unavailable'); return { cards: [{ card_id: 'different-id', dbf: 123, rarity: 'EPIC', images: { tile: 'https://api.kolodahearthstone.com/uploads/card-tiles/constructed_card/TOY_330-test.png', horizontal: 'https://api.kolodahearthstone.com/uploads/horizontal-art/constructed_card/TOY_330.webp' } }] }; },
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
      mulliganImpact: 4.8,
      mulliganCount: 1_250,
      drawnImpact: -1.2,
      drawnCount: 980,
      keptImpact: 6.1,
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
  assert.equal(JSON.stringify(teaserListingBody).includes('AAEBAa0GValidDeckCode'), false);

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
  const teaserDetailBody = await teaserDetail.json() as any;
  assert.deepEqual(teaserDetailBody.item.builds, []);
  assert.deepEqual(teaserDetailBody.history, []);
  assert.equal(teaserDetailBody.analysis, null);
  assert.deepEqual(teaserDetailBody.featuredBuild, {
    games: 2_216,
    winrate: 57.1,
    updatedAt: '2026-07-22T21:05:32.877Z',
    sampleRank: 'all',
    samplePeriod: 'past_30_days',
  });
  assert.equal(JSON.stringify(teaserDetailBody).includes('AAEBAa0GValidDeckCode'), false);

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
  assert.deepEqual([historyReads, analysisReads, mediaReads], [0, 0, 0], 'core must not start optional work');
  assert.equal(core.headers.get('cache-control'), 'no-store');
  const history = await fetch(`${origin}/wild/thief-priest?section=history`, { headers });
  assert.equal((await history.json() as any).history.length, 1);
  assert.deepEqual([historyReads, analysisReads, mediaReads], [1, 0, 0]);
  const analysis = await fetch(`${origin}/wild/thief-priest?section=analysis`, { headers });
  assert.equal((await analysis.json() as any).analysis.cardStats[0].rarity, 'EPIC');
  assert.deepEqual([historyReads, analysisReads, mediaReads], [1, 1, 1]);
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
  assert.deepEqual(ranksBody.ranks.periods.slice(-2).map((period: any) => period.label), ['Тёмная империя', 'После банов']);
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
  assert.equal(detailBody.history.length, 1);
  assert.equal(detailBody.analysis.rank, 'legend');
  assert.equal(detailBody.analysis.classMatchups[0].classKey, 'mage');
  assert.equal(detailBody.analysis.cardStats[0].mulliganImpact, 4.8);
  assert.equal(detailBody.analysis.cardStats[0].cost, 3);
  assert.equal(detailBody.analysis.cardStats[0].tile, 'https://api.kolodahearthstone.com/uploads/card-tiles/constructed_card/TOY_330-test.png');
  assert.equal(detailBody.analysis.cardStats[0].rarity, 'EPIC');
  mediaAvailable = false;
  const withoutMedia = await fetch(`${origin}/wild/thief-priest`, { headers });
  assert.equal(withoutMedia.status, 200);
  const withoutMediaBody = await withoutMedia.json() as any;
  assert.equal(withoutMediaBody.analysis.cardStats[0].tile, null);
  assert.equal(withoutMediaBody.analysis.cardStats[0].mulliganImpact, 4.8);

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
    assert.deepEqual(guest.item.builds, [], 'refresh must preserve the public projection');
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
