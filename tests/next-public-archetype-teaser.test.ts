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
      cards: [{ id: 'TST_001', name: 'Тестовый удар', cost: 1, rarity: 'LEGENDARY', count: 2, hasPage: true, keptImpact: 6.2626 },
        { id: 'TIME_875t', name: 'Король Ллейн', cost: 3, rarity: 'legendary<script>', count: 1, hasPage: false },
        { id: null, name: null, cost: null, count: 1, hasPage: true }],
      // The code's sideboards: kept under a card of the list, field by field; one under a card the list lacks, or with a
      // line that does not read, is left out.
      sideboards: [
        { keyId: 'TST_001', label: 'PRIVATE_LABEL', cards: [{ id: 'TST_003', name: 'Тестовая буря', cost: 2, rarity: 'RARE', count: 1, hasPage: true, mulliganImpact: 7.1717 },
          { id: 'TOY_330t97', name: 'Модуль', cost: 3, count: 1, hasPage: false }] },
        { keyId: 'TST_404', cards: [{ id: 'TST_003', name: 'Тестовая буря', cost: 2, count: 1, hasPage: true }] },
        { keyId: 'TIME_875t', cards: [{ id: 'TST_003', name: 'Тестовая буря', cost: 2, count: 0, hasPage: true }] },
      ] },
    { deckCode: 'AAEBAa0GAfGiBAH0ogQAAA==', games: null, winrate: null, updatedAt: null, cards: null,
      sideboards: [{ keyId: 'TST_001', cards: [{ id: 'TST_003', name: 'Тестовая буря', cost: 2, count: 1, hasPage: true }] }] },
    { deckCode: 'AAECAf0GAfKiBALxogTzogQAAC==', games: 10, winrate: 50, updatedAt: null,
      cards: [{ id: 'TST_001', name: 'Тестовый удар', cost: 1, count: 2, hasPage: true }, { id: '/OG_211', name: 'Зов лесов', cost: 8, count: 1, hasPage: true }, { id: '../../admin', name: 'Чужая', cost: 1, count: 1 }, { id: 'TST_002', name: '', cost: 1, count: 1, hasPage: true }] },
    { deckCode: 'PRIVATE_DECK', games: 10, winrate: 50, updatedAt: null, cards: null },
    { deckCode: 'AAEBAa0GAfGiBAH0ogQAAA==', games: 1, winrate: 1, updatedAt: null, cards: null },
  ] },
  history: [{ recordedAt: '2026-07-24T12:38:57.727Z', winrate: 41.4141 }],
  buildsTotal: 12, buildsOffset: 0, nextOffset: 8,
};
const open = publicArchetypeTeaser(openRaw, 'wild', 'thief-priest');
assert.deepEqual(open.openBuilds, [
  { deckCode: 'AAECAf0GAfKiBALxogTzogQAAA==', games: 2216, winrate: 57.1, updatedAt: '2026-07-22T21:05:32.877Z',
    sampleRank: 'all', samplePeriod: 'past_30_days',
    cards: [{ id: 'TST_001', name: 'Тестовый удар', cost: 1, rarity: 'LEGENDARY', count: 2, hasPage: true },
      { id: 'TIME_875t', name: 'Король Ллейн', cost: 3, rarity: null, count: 1, hasPage: false },
      { id: null, name: null, cost: null, rarity: null, count: 1, hasPage: false }],
    sideboards: [{ keyId: 'TST_001', cards: [{ id: 'TST_003', name: 'Тестовая буря', cost: 2, rarity: 'RARE', count: 1, hasPage: true },
      { id: 'TOY_330t97', name: 'Модуль', cost: 3, rarity: null, count: 1, hasPage: false }] }] },
  { deckCode: 'AAEBAa0GAfGiBAH0ogQAAA==', games: null, winrate: null, updatedAt: null, sampleRank: '', samplePeriod: '', cards: null },
  { deckCode: 'AAECAf0GAfKiBALxogTzogQAAC==', games: 10, winrate: 50, updatedAt: null, sampleRank: '', samplePeriod: '',
    cards: [{ id: 'TST_001', name: 'Тестовый удар', cost: 1, rarity: null, count: 2, hasPage: true },
      { id: null, name: 'Зов лесов', cost: 8, rarity: null, count: 1, hasPage: false }, { id: null, name: 'Чужая', cost: 1, rarity: null, count: 1, hasPage: false },
      { id: 'TST_002', name: null, cost: 1, rarity: null, count: 1, hasPage: false }] },
]);
assert.deepEqual(open.item.builds, [], 'the client gallery never gets the open builds');
assert.equal(open.openBuildsTotal, 12, 'the page counts every open build, not only the ones of this page');
assert.equal(open.openBuildsNext, 8, 'the next page starts at the source offset, not at the count of builds kept');
assert.equal(publicArchetypeTeaser(raw, 'wild', 'thief-priest').openBuildsNext, null);
assert.equal(publicArchetypeTeaser(raw, 'wild', 'thief-priest').openBuildsTotal, 0);
for (const paid of ['7.1717', '6.2626', '41.4141', 'PRIVATE_']) {
  assert.equal(JSON.stringify(open).includes(paid), false, `the page data carries ${paid}`);
}

// An answer with more than a real code holds (five sideboards, one of eleven lines) keeps the first four sideboards and
// the first ten lines of each; the rest never reaches the page, and the build keeps its list.
const line = (id: string) => ({ id, name: `Карта ${id}`, cost: 1, rarity: 'COMMON', count: 1, hasPage: true });
const crowded = publicArchetypeTeaser({ ...raw, item: { ...raw.item, builds: [{
  deckCode: 'AAECAf0GAfKiBALxogTzogQAAA==', games: 10, winrate: 50, updatedAt: null,
  cards: ['KEY_1', 'KEY_2', 'KEY_3', 'KEY_4', 'KEY_5'].map(line),
  sideboards: [
    { keyId: 'KEY_1', cards: ['SB_01', 'SB_02', 'SB_03', 'SB_04', 'SB_05', 'SB_06', 'SB_07', 'SB_08', 'SB_09', 'SB_10', 'SB_11'].map(line) },
    { keyId: 'KEY_2', cards: [line('SB_20')] }, { keyId: 'KEY_3', cards: [line('SB_21')] },
    { keyId: 'KEY_4', cards: [line('SB_22')] }, { keyId: 'KEY_5', cards: [line('SB_23')] },
  ],
}] } }, 'wild', 'thief-priest').openBuilds[0];
assert.equal(crowded.cards?.length, 5, 'the build keeps its list');
assert.deepEqual(crowded.sideboards?.map(board => board.keyId), ['KEY_1', 'KEY_2', 'KEY_3', 'KEY_4']);
assert.deepEqual(crowded.sideboards?.[0].cards.map(card => card.id),
  ['SB_01', 'SB_02', 'SB_03', 'SB_04', 'SB_05', 'SB_06', 'SB_07', 'SB_08', 'SB_09', 'SB_10']);
assert.equal(JSON.stringify(crowded).includes('SB_11'), false, 'the eleventh line stays out');
assert.equal(JSON.stringify(crowded).includes('SB_23'), false, 'the fifth sideboard stays out');
