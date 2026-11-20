import assert from 'node:assert/strict';
import { publicArchetypeTeaser } from '../apps/public-web/lib/publicArchetypeTeaserData';

const OPEN_CODE = 'AAEBAa0GBvAEOpOiYwHHYoKZAAA='.padEnd(24, 'A');
const raw = {
  format: 'wild', formatLabel: 'Вольный', patch: '36.0.3', minimumGames: 50,
  updatedAt: '2026-07-24T12:38:57.727Z', account: 'PRIVATE_ACCOUNT',
  item: {
    slug: 'thief-priest', archetype: 'Thief Priest', archetypeLabel: 'Воровской Жрец',
    translated: true, classKey: 'priest', format: 'wild', games: 31959,
    winrate: 58.3, popularity: 13.5, turns: 7.9, durationMinutes: 8,
    climbingSpeed: 1.24, deckCount: 1, sourceUrl: 'https://www.hsguru.com/meta',
    builds: [{ deckCode: OPEN_CODE, games: 2216, winrate: 57.1, updatedAt: '2026-07-24T12:38:57.727Z', sampleRank: 'all', samplePeriod: 'past_30_days',
      cards: [{ dbfId: 1, name: 'Карта', cost: 2, rarity: 'COMMON', count: 2, tooltip: 'PRIVATE_CARD' }], privateNote: 'PRIVATE_BUILD', sourceUrl: 'https://example.test/PRIVATE_URL' }],
    secret: 'PRIVATE_ITEM',
  },
  featuredBuild: { games: 2216, winrate: 57.1, updatedAt: null,
    sampleRank: 'all', samplePeriod: 'past_30_days', deckCode: 'PRIVATE_FEATURED_DECK' },
  history: [{ recordedAt: 'PRIVATE_HISTORY' }], analysis: { private: 'PRIVATE_ANALYSIS' },
};

const teaser = publicArchetypeTeaser(raw, 'wild', 'thief-priest');
assert.equal(teaser.item.archetypeLabel, 'Воровской Жрец');
assert.deepEqual(teaser.item.builds, [{
  deckCode: OPEN_CODE, games: 2216, winrate: 57.1, sourceUrl: '', updatedAt: '2026-07-24T12:38:57.727Z', classKey: 'priest',
  sampleRank: 'all', samplePeriod: 'past_30_days', cards: [{ dbfId: 1, name: 'Карта', cost: 2, rarity: 'COMMON', count: 2 }],
}], 'the deck code and the card list are the open layer, copied field by field');
assert.deepEqual(teaser.history, []);
assert.equal(teaser.analysis, null);
assert.equal(JSON.stringify(teaser).includes('PRIVATE_'), false);
assert.throws(() => publicArchetypeTeaser(raw, 'wild', 'wrong-slug'), /Invalid/);
assert.throws(() => publicArchetypeTeaser({ ...raw, item: { ...raw.item, builds: [{ ...raw.item.builds[0], deckCode: '<script>' }] } }, 'wild', 'thief-priest'), /Invalid/, 'a deck code is base64 or nothing');
assert.throws(() => publicArchetypeTeaser({ ...raw, item: { ...raw.item, builds: Array.from({ length: 13 }, () => raw.item.builds[0]) } }, 'wild', 'thief-priest'), /Invalid/);
assert.throws(() => publicArchetypeTeaser({ ...raw, item: { ...raw.item, games: -1 } }, 'wild', 'thief-priest'), /Invalid/);
