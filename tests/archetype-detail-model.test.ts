import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { classIconUrl, normalizeClassKey } from '../src/features/classIcons.js';
import {
  hsguruImpactTone,
  hsguruAnalysisEmptyMessage,
  hsguruMatchupTone,
  archetypeClassBackdrop,
  archetypeHeroArt,
  cardStatImpactScale,
  cardStatsCsvRows,
  isLowCardSample,
  nextCardStatSort,
  sortHsguruCardStats,
  sortMulliganRows,
  type MulliganSort,
} from '../src/features/archetypeDetailModel.js';

assert.equal(normalizeClassKey('DEATH_KNIGHT'), 'deathknight');
assert.equal(normalizeClassKey(' Demon Hunter '), 'demonhunter');
assert.equal(classIconUrl('MAGE'), '/class_icon/ui/mage-64.webp');
assert.equal(classIconUrl('unknown'), '/class_icon/neutral.webp');

const rows = [
  { dbf_id: 1, card_name: 'Поздняя', hsreplay_rank: 3, keep_percentage: 40, avg_turn_played_on: 7.2 },
  { dbf_id: 2, card_name: 'Ранняя', hsreplay_rank: 2, keep_percentage: 61, avg_turn_played_on: 2.1 },
  { dbf_id: 3, card_name: 'Нет данных', hsreplay_rank: 1, keep_percentage: null, avg_turn_played_on: null },
  { dbf_id: 4, card_name: 'Средняя', hsreplay_rank: 4, keep_percentage: 61, avg_turn_played_on: 4.4 },
];

function ids(sort: MulliganSort) {
  return sortMulliganRows(rows, sort).map(row => row.dbf_id);
}

assert.deepEqual(ids({ key: 'hsreplay_rank', direction: 'asc' }), [3, 2, 1, 4]);
assert.deepEqual(ids({ key: 'keep_percentage', direction: 'desc' }), [2, 4, 1, 3]);
assert.deepEqual(ids({ key: 'avg_turn_played_on', direction: 'asc' }), [2, 4, 1, 3]);
assert.deepEqual(ids({ key: 'avg_turn_played_on', direction: 'desc' }), [1, 4, 2, 3]);

const cardStats = [
  { cardName: 'Альфа', mulliganImpact: 2.4, mulliganCount: 800 },
  { cardName: 'Бета', mulliganImpact: -1.2, mulliganCount: 1_500 },
  { cardName: 'Гамма', mulliganImpact: null, mulliganCount: 300 },
];

assert.deepEqual(
  sortHsguruCardStats(cardStats, { key: 'mulliganImpact', direction: 'desc' }).map(row => row.cardName),
  ['Альфа', 'Бета', 'Гамма'],
);
assert.deepEqual(
  sortHsguruCardStats(cardStats, { key: 'mulliganCount', direction: 'desc' }).map(row => row.cardName),
  ['Бета', 'Альфа', 'Гамма'],
);
assert.equal(hsguruImpactTone(1.2), 'positive');
assert.equal(hsguruImpactTone(-0.8), 'negative');
assert.equal(hsguruImpactTone(null), 'unknown');
assert.equal(hsguruMatchupTone(52), 'favored');
assert.equal(hsguruMatchupTone(49.5), 'even');
assert.equal(hsguruMatchupTone(47.9), 'unfavored');
assert.equal(
  hsguruAnalysisEmptyMessage('error', 'matchups'),
  'Последнее обновление завершилось ошибкой. Мы уже повторяем сбор матчапов.',
);
assert.equal(
  hsguruAnalysisEmptyMessage('partial', 'cards'),
  'HSGuru не вернул статистику карт в последнем срезе. Данные появятся, когда у архетипа будет достаточная выборка.',
);
assert.equal(
  hsguruAnalysisEmptyMessage(null, 'matchups'),
  'Матчапы ещё не получены.',
);

// A phase measured on fewer than 100 games is shown muted, and a missing count is never trusted.
assert.equal(isLowCardSample(99), true);
assert.equal(isLowCardSample(100), false);
assert.equal(isLowCardSample(null), true);

// Bars of one phase share a scale: the largest absolute impact, but never below 2 points,
// so a phase where every card is within ±0.3% does not draw full-width bars.
const phaseRows = [
  { cardName: 'А', mulliganImpact: 6.6, drawnImpact: 0.2 },
  { cardName: 'Б', mulliganImpact: -8.1, drawnImpact: -0.3 },
  { cardName: 'В', mulliganImpact: null, drawnImpact: null },
];
assert.equal(cardStatImpactScale(phaseRows, 'mulliganImpact'), 8.1);
assert.equal(cardStatImpactScale(phaseRows, 'drawnImpact'), 2);
assert.equal(cardStatImpactScale([], 'keptImpact'), 2);

// A new column starts descending; the active column flips; the table's "unsorted" step is never taken.
assert.deepEqual(nextCardStatSort({ key: 'mulliganImpact', direction: 'desc' }, 'drawnImpact'), { key: 'drawnImpact', direction: 'desc' });
assert.deepEqual(nextCardStatSort({ key: 'drawnImpact', direction: 'desc' }, 'drawnImpact'), { key: 'drawnImpact', direction: 'asc' });
assert.deepEqual(nextCardStatSort({ key: 'drawnImpact', direction: 'asc' }, 'drawnImpact'), { key: 'drawnImpact', direction: 'desc' });

// The CSV keeps one column per metric even though the table pairs impact and sample in one cell.
assert.deepEqual(cardStatsCsvRows([
  { cardName: 'Гадалка', mulliganImpact: 5, mulliganCount: 3_703, drawnImpact: 3.3, drawnCount: 17_159, keptImpact: null, keptCount: null },
]), {
  header: ['Карта', 'Влияние в муллигане', 'Количество муллиганов', 'Влияние при доборе', 'Количество доборов', 'Влияние при оставлении', 'Количество оставлений'],
  rows: [['Гадалка', '+5%', '3703', '+3,3%', '17159', '—', '—']],
});

// Hero art: never the 320x64 tile strip. Prefer a high-resolution artwork among the most
// mulliganed cards, else the HearthstoneJSON original of the most mulliganed card.
const artCards = [
  { cardId: 'TLC_817', cardName: 'Квест', mulliganCount: 15_922, artwork: 'https://api.kolodahearthstone.com/uploads/horizontal-art/constructed_card/TLC_817.webp', fullArtwork: null },
  { cardId: 'BE_784', cardName: 'Арт', mulliganCount: 4_000, artwork: null, fullArtwork: 'https://api.kolodahearthstone.com/uploads/constructed-related-wiki-full-art/BE_784.jpg' },
  { cardId: null, cardName: 'Без id', mulliganCount: 90_000, artwork: null, fullArtwork: null },
];
assert.equal(
  archetypeHeroArt('quest-priest', artCards)?.src,
  '/api/public-resource/db/uploads/constructed-related-wiki-full-art/BE_784.jpg?width=512&quality=82&format=webp&trim=1',
);
assert.equal(
  archetypeHeroArt('quest-priest', [artCards[0]])?.src,
  '/api/public-resource/hsjson/v1/orig/TLC_817.png?width=512&quality=82&format=webp&trim=1',
  'the padded square original is trimmed by the proxy and never requested upscaled',
);
assert.deepEqual(archetypeHeroArt('void-soul-dh', artCards), { src: '/archetype-art/void-soul-dh.webp' });
assert.equal(archetypeHeroArt('quest-priest', []), null);
assert.equal(archetypeHeroArt('quest-priest', [artCards[2]]), null);

// Every class has full-bleed header art, so guests never see an empty plate.
for (const classKey of ['deathknight', 'demonhunter', 'druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior']) {
  const backdrop = archetypeClassBackdrop(classKey);
  assert.equal(backdrop?.src, `/archetype-art/classes/${classKey}-1920.webp`);
  assert.equal(backdrop?.srcSet, `/archetype-art/classes/${classKey}-960.webp 960w, /archetype-art/classes/${classKey}-1920.webp 1920w`);
  assert.ok(existsSync(new URL(`../public/archetype-art/classes/${classKey}-960.webp`, import.meta.url)));
  assert.ok(existsSync(new URL(`../public/archetype-art/classes/${classKey}-1920.webp`, import.meta.url)));
}
assert.equal(archetypeClassBackdrop(null), null);
assert.equal(archetypeClassBackdrop('neutral'), null);

console.log('archetype detail model tests passed');
