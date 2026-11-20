import assert from 'node:assert/strict';
import { publicArchetypeTeaser } from '../apps/public-web/lib/publicArchetypeTeaserData';

const raw = {
  format: 'wild', formatLabel: 'Вольный', patch: '36.0.3', minimumGames: 50,
  updatedAt: '2026-07-24T12:38:57.727Z', account: 'PRIVATE_ACCOUNT',
  item: {
    slug: 'thief-priest', archetype: 'Thief Priest', archetypeLabel: 'Воровской Жрец',
    translated: true, classKey: 'priest', format: 'wild', games: 31959,
    winrate: 58.3, popularity: 13.5, turns: 7.9, durationMinutes: 8,
    climbingSpeed: 1.24, deckCount: 1, sourceUrl: 'https://www.hsguru.com/meta',
    builds: [{ deckCode: 'PRIVATE_DECK' }], secret: 'PRIVATE_ITEM',
  },
  featuredBuild: { games: 2216, winrate: 57.1, updatedAt: null,
    sampleRank: 'all', samplePeriod: 'past_30_days', deckCode: 'PRIVATE_FEATURED_DECK' },
  history: [{ recordedAt: 'PRIVATE_HISTORY' }], analysis: { private: 'PRIVATE_ANALYSIS' },
};

const teaser = publicArchetypeTeaser(raw, 'wild', 'thief-priest');
assert.equal(teaser.item.archetypeLabel, 'Воровской Жрец');
assert.deepEqual(teaser.item.builds, []);
assert.deepEqual(teaser.history, []);
assert.equal(teaser.analysis, null);
assert.equal(JSON.stringify(teaser).includes('PRIVATE_'), false);
assert.throws(() => publicArchetypeTeaser(raw, 'wild', 'wrong-slug'), /Invalid/);
assert.throws(() => publicArchetypeTeaser({ ...raw, item: { ...raw.item, games: -1 } }, 'wild', 'thief-priest'), /Invalid/);

// Open layer: a build passes field by field with its card list; anything else of a build, and a build the page
// cannot show whole, stays out. The paid layer (mulligan and card statistics, history) never reaches the page.
const openRaw = {
  ...raw,
  item: { ...raw.item, deckCount: 3, builds: [
    { deckCode: 'AAECAf0GAfKiBALxogTzogQAAA==', games: 2216, winrate: 57.1, updatedAt: '2026-07-22T21:05:32.877Z',
      sampleRank: 'all', samplePeriod: 'past_30_days', sourceUrl: 'https://www.hsguru.com/deck/PRIVATE_URL',
      mulliganImpact: 7.1717, keptImpact: 6.2626,
      cards: [{ id: 'TST_001', name: 'Тестовый удар', cost: 1, count: 2, keptImpact: 6.2626 }] },
    { deckCode: 'AAEBAa0GAfGiBAH0ogQAAA==', games: null, winrate: null, updatedAt: null, cards: null },
    { deckCode: 'AAECAf0GAfKiBALxogTzogQAAA==', games: 10, winrate: 50, updatedAt: null,
      cards: [{ id: '../../admin', name: 'PRIVATE_CARD', cost: 1, count: 1 }] },
    { deckCode: 'PRIVATE_DECK', games: 10, winrate: 50, updatedAt: null, cards: null },
  ] },
  history: [{ recordedAt: '2026-07-24T12:38:57.727Z', winrate: 41.4141 }],
};
const open = publicArchetypeTeaser(openRaw, 'wild', 'thief-priest');
assert.deepEqual(open.openBuilds, [
  { deckCode: 'AAECAf0GAfKiBALxogTzogQAAA==', games: 2216, winrate: 57.1, updatedAt: '2026-07-22T21:05:32.877Z',
    cards: [{ id: 'TST_001', name: 'Тестовый удар', cost: 1, count: 2 }] },
  { deckCode: 'AAEBAa0GAfGiBAH0ogQAAA==', games: null, winrate: null, updatedAt: null, cards: null },
]);
assert.deepEqual(open.item.builds, [], 'the client gallery never gets the open builds');
for (const paid of ['7.1717', '6.2626', '41.4141', 'PRIVATE_']) {
  assert.equal(JSON.stringify(open).includes(paid), false, `the page data carries ${paid}`);
}
