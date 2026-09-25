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
