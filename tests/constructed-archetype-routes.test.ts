import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import {
  createConstructedArchetypeRouter,
  constructedArchetypeSlug,
  type ConstructedArchetypeCatalog,
  type ConstructedArchetypeRouterDependencies,
} from '../server/constructedArchetypeRoutes.js';

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

  assert.equal((await fetch(`${origin}/classic/thief-priest`, { headers })).status, 400);
  assert.equal((await fetch(`${origin}/wild/missing`, { headers })).status, 404);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
}
