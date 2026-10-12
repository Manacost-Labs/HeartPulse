import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
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
const dependencies: ConstructedArchetypeRouterDependencies = {
  accessGuard,
  setPrivateNoStore: response => {
    response.set('Cache-Control', 'no-store');
    response.vary('Cookie');
  },
  loadCatalog: async format => ({ ...catalog, format, formatLabel: format === 'standard' ? 'Стандарт' : 'Вольный' }),
  loadHistory: async () => [{
    recordedAt: '2026-07-24T12:38:57.727Z',
    games: 31_959,
    winrate: 58.3,
    popularity: 13.5,
    turns: 7.9,
    durationMinutes: 8,
    climbingSpeed: 1.24,
  }],
  loadCardCatalog: async () => { if (!mediaAvailable) throw new Error('Catalog unavailable'); return { cards: [{ card_id: 'different-id', dbf: 123, rarity: 'EPIC', images: { tile: 'https://api.kolodahearthstone.com/uploads/card-tiles/constructed_card/TOY_330-test.png', horizontal: 'https://api.kolodahearthstone.com/uploads/horizontal-art/constructed_card/TOY_330.webp' } }] }; },
  loadAnalysis: async () => ({
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
  }),
};

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
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
}
