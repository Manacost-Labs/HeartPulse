import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deckCards,
  deckTrend,
  matchupHeatmap,
  placementShares,
  summaryItems,
  transposeHeatmap,
  winrateTone,
} from '../src/modules/playerStats/model/profileView';
import { PROFILE_STATS_TEXT } from '../src/modules/playerStats/model/profileText';
import { battlegroundsFixture, standardFixture } from '../src/features/playerStats/playerStatsFixtures';
import type { ConstructedStats } from '../src/modules/playerStats/model/stats';

const text = PROFILE_STATS_TEXT.ru;

test('the colour step is symmetric around 50% and even near it', () => {
  assert.deepEqual([50, 51.9, 52, 46, 41, 61, 30, null].map(winrateTone), [0, 0, 1, -1, -2, 3, -3, 0]);
});

test('a deck line starts at its fifth result and needs five results', () => {
  assert.equal(deckTrend(['win', 'loss', 'win', 'win']), null);
  assert.equal(deckTrend(undefined), null);
  assert.deepEqual(deckTrend(['win', 'loss', 'win', 'win', 'loss', 'win']), [60, 66.7]);
});

test('deck cards take the archetype global win rate and mute small decks', () => {
  const stats: ConstructedStats = {
    ...standardFixture,
    decks: [
      { ...standardFixture.decks[0], games: 4, wins: 3 },
      { ...standardFixture.decks[1] },
    ],
    archetypes: [{ ...standardFixture.archetypes[1], globalWinrate: 51.2 }],
  };
  const [small, known] = deckCards(stats);
  assert.equal(small.low, true);
  assert.equal(small.tone, 3);
  assert.equal(known.globalRate, 51.2);
  assert.equal(known.subtitle, 'Жрец · Dragon Priest');
});

test('the heat grid has a row per opponent and own classes plus «Всего» as columns', () => {
  const stats: ConstructedStats = {
    ...standardFixture,
    games: 12,
    classes: [{ playerClass: 'MAGE', games: 10, wins: 6, globalWinrate: null }, { playerClass: 'ROGUE', games: 2, wins: 0, globalWinrate: null }],
    opponentClasses: [{ opponentClass: 'HUNTER', games: 8, wins: 5 }, { opponentClass: 'DRUID', games: 4, wins: 1 }],
    matchups: [
      { playerClass: 'MAGE', opponentClass: 'HUNTER', games: 7, wins: 5 },
      { playerClass: 'MAGE', opponentClass: 'DRUID', games: 3, wins: 1 },
      { playerClass: 'ROGUE', opponentClass: 'HUNTER', games: 1, wins: 0 },
      { playerClass: 'ROGUE', opponentClass: 'DRUID', games: 1, wins: 0 },
    ],
  };
  const grid = matchupHeatmap(stats);
  assert.deepEqual(grid.columns.map(column => column.key), ['MAGE', 'ROGUE', 'all']);
  assert.deepEqual(grid.rows.map(row => row.opponent), ['HUNTER', 'DRUID']);
  const hunter = grid.rows[0].cells;
  assert.deepEqual(hunter.map(cell => [cell.games, cell.tone, cell.low]), [[7, 3, false], [1, 0, true], [8, 3, false]]);
  // Turned for wide screens: the same cells, own classes as rows.
  const turned = transposeHeatmap(grid);
  assert.deepEqual(turned.map(row => row.key), ['MAGE', 'ROGUE', 'all']);
  assert.equal(turned[0].cells[1].opponent, 'DRUID');
  assert.equal(turned[0].cells[1].games, 3);
});

test('header numbers: the legend place moves to the caption, missing ranks are left out', () => {
  const legend = { starLevel: 51, stars: 0, legendRank: 820 };
  const items = summaryItems({ ...standardFixture, summary: { ...standardFixture.summary, bestRank: legend, currentRank: legend } }, text);
  assert.deepEqual(items.map(item => item.id), ['winrate', 'games', 'rank', 'time']);
  assert.equal(items[2].value, 'Легенда');
  assert.equal(items[2].caption, '№820');
  const casual = summaryItems({ ...standardFixture, summary: { ...standardFixture.summary, bestRank: null, currentRank: null } }, text);
  assert.equal(casual.some(item => item.id === 'rank'), false);
  const battlegrounds = summaryItems(battlegroundsFixture, text);
  assert.deepEqual(battlegrounds.map(item => item.id), ['rating', 'placement', 'games', 'time']);
});

test('placement shares mark the top half', () => {
  const shares = placementShares([2, 1, 1, 0, 0, 0, 0, 0]);
  assert.deepEqual(shares.map(item => item.share), [50, 25, 25, 0, 0, 0, 0, 0]);
  assert.deepEqual(shares.map(item => item.top), [true, true, true, true, false, false, false, false]);
  assert.equal(placementShares([0, 0, 0, 0]).every(item => item.share === 0), true);
});
