import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import {
  normalizeFirestoneArenaClassRows,
  normalizeHsReplayArenaClassRows,
} from '../server/modules/arena/public.js';
import { assertProperty } from './helpers/propertyRuns.js';

const CLASS_IDS = { mage: 'mage', warrior: 'warrior', deathknight: 'death-knight', priest: 'priest' };
const CLASS_INFO = {
  mage: { id: 'mage', name: 'Маг' },
  warrior: { id: 'warrior', name: 'Воин' },
  deathknight: { id: 'death-knight', name: 'Рыцарь смерти' },
  priest: { id: 'priest', name: 'Жрец' },
};
const SOURCE_CLASS = fc.constantFrom('Mage', 'Warrior', 'Death Knight', 'Priest');
// Win rates as hs-data-api publishes them: percent with one decimal.
const PUBLISHED_WINRATE = fc.integer({ min: 300, max: 700 }).map(tenths => tenths / 10);

function hsReplayRow(sourceClass: string, winrate: unknown, games: unknown = 1_000) {
  return { class: sourceClass, win_rate: winrate, num_drafts: games };
}

test('the class tier list goes from the best win rate to the worst', () => {
  const rows = fc.array(fc.tuple(SOURCE_CLASS, PUBLISHED_WINRATE), { maxLength: 12 });
  assertProperty(fc.property(rows, sourceRows => {
    const tiers = normalizeHsReplayArenaClassRows(
      sourceRows.map(([sourceClass, winrate]) => hsReplayRow(sourceClass, winrate)), CLASS_IDS, CLASS_INFO,
    );

    assert.equal(tiers.length, sourceRows.length);
    tiers.slice(1).forEach((tier, index) => assert.ok(tiers[index].winrate >= tier.winrate));
  }));
});

test('the Firestone class tier list also goes from the best win rate to the worst', () => {
  const rows = fc.array(fc.tuple(SOURCE_CLASS, fc.integer({ min: 0, max: 1_000 })), { maxLength: 12 });
  assertProperty(fc.property(rows, sourceRows => {
    const tiers = normalizeFirestoneArenaClassRows(
      sourceRows.map(([playerClass, wins]) => ({ playerClass, totalGames: 1_000, totalsWins: wins })), CLASS_INFO,
    );

    assert.equal(tiers.length, sourceRows.length);
    tiers.slice(1).forEach((tier, index) => assert.ok(tiers[index].winrate >= tier.winrate));
  }));
});

test('classes with the same win rate keep the order the source lists them in', () => {
  const classes = fc.shuffledSubarray(['Mage', 'Warrior', 'Death Knight', 'Priest'], { minLength: 2 });
  assertProperty(fc.property(classes, PUBLISHED_WINRATE, (order, winrate) => {
    const hsReplay = normalizeHsReplayArenaClassRows(order.map(name => hsReplayRow(name, winrate)), CLASS_IDS, CLASS_INFO);
    const firestone = normalizeFirestoneArenaClassRows(
      order.map(name => ({ playerClass: name, totalGames: 1_000, totalsWins: 500 })), CLASS_INFO,
    );
    const ids = { Mage: 'mage', Warrior: 'warrior', 'Death Knight': 'death-knight', Priest: 'priest' };

    assert.deepEqual(hsReplay.map(tier => tier.id), order.map(name => ids[name as keyof typeof ids]));
    assert.deepEqual(firestone.map(tier => tier.id), order.map(name => ids[name as keyof typeof ids]));
  }));
});

test('every class on the tier list keeps its name, win rate and sample size', () => {
  assertProperty(fc.property(SOURCE_CLASS, PUBLISHED_WINRATE, fc.integer({ min: 1, max: 5_000_000 }), (name, winrate, games) => {
    const [tier] = normalizeHsReplayArenaClassRows([hsReplayRow(name, winrate, games)], CLASS_IDS, CLASS_INFO);

    assert.equal(typeof tier.name, 'string');
    assert.equal(tier.winrate, winrate);
    assert.equal(tier.games, games);
  }));
});

test('a percentage written with a % sign is shown as written', () => {
  const percent = fc.integer({ min: 1, max: 1_000 }).map(tenths => tenths / 10);
  assertProperty(fc.property(percent, percent, (winrate, pickRate) => {
    const [tier] = normalizeHsReplayArenaClassRows(
      [{ class: 'Mage', win_rate: `${winrate}%`, num_drafts: 100, pick_rate: `${pickRate}%`, pct_7_plus: `${pickRate} %` }],
      CLASS_IDS, CLASS_INFO,
    );

    assert.equal(tier.winrate, winrate);
    assert.equal(tier.pickRate, pickRate);
    assert.equal(tier.sevenPlusWinsRate, pickRate);
  }));
});

test('a low share written in percent is not inflated a hundredfold', () => {
  const [tier] = normalizeHsReplayArenaClassRows(
    [{ class: 'Priest', win_rate: '0.9%', num_drafts: 100, pick_rate: '0.5%', pct_7_plus: '1%' }], CLASS_IDS, CLASS_INFO,
  );

  assert.deepEqual([tier.winrate, tier.pickRate, tier.sevenPlusWinsRate], [0.9, 0.5, 1]);
});

test('a blank win rate is no win rate, not 0%', () => {
  assert.deepEqual(normalizeHsReplayArenaClassRows([hsReplayRow('Mage', ''), hsReplayRow('Priest', 51.2)], CLASS_IDS, CLASS_INFO)
    .map(tier => [tier.id, tier.winrate]), [['priest', 51.2]]);
});

test('a class without a published win rate or games is left off the tier list', () => {
  const missingWinrate = fc.constantFrom(undefined, null, '', ' ', '%', 'n/a', Number.NaN, Number.POSITIVE_INFINITY, {}, [], [54.8], true);
  const missingGames = fc.constantFrom(0, -5, '', 'many', Number.NaN, null);
  assertProperty(fc.property(missingWinrate, missingGames, PUBLISHED_WINRATE, (winrate, games, realWinrate) => {
    const tiers = normalizeHsReplayArenaClassRows([
      hsReplayRow('Mage', winrate),
      hsReplayRow('Warrior', realWinrate, games),
      hsReplayRow('Priest', realWinrate),
    ], CLASS_IDS, CLASS_INFO);

    assert.deepEqual(tiers.map(tier => tier.id), ['priest']);
  }));
});

test('HSReplay rows read their class, counts and shares from every published spelling', () => {
  const tiers = normalizeHsReplayArenaClassRows([
    null,
    'Mage',
    ['Mage'],
    { class: 'Shaman', win_rate: 55, num_drafts: 10 },
    { class_name: 'death_knight', winrate: '0.5', games: '240', total_wins: 120.4, total_losses: -1, pickRate: 0, seven_plus_wins_rate: 1 },
    { name: 'PRIEST', win_rate: 0.4999, total_games: 50, totalWins: 'x', totalLosses: 25.6 },
    { class: 'Warrior', win_rate: 60, totalGames: 30, wins: 18, losses: 12, pick_rate: 0.12, pct7Plus: 22 },
  ], CLASS_IDS, CLASS_INFO);

  assert.deepEqual(tiers, [
    { id: 'warrior', name: 'Воин', winrate: 60, games: 30, wins: 18, losses: 12, pickRate: 12, sevenPlusWinsRate: 22 },
    { id: 'death-knight', name: 'Рыцарь смерти', winrate: 50, games: 240, wins: 120, losses: undefined, pickRate: 0,
      sevenPlusWinsRate: 100 },
    { id: 'priest', name: 'Жрец', winrate: 50, games: 50, wins: undefined, losses: 26, pickRate: null,
      sevenPlusWinsRate: null },
  ]);
});

test('Firestone rows give the class card, the wins chart in order and the matchups', () => {
  const tiers = normalizeFirestoneArenaClassRows([
    { playerClass: 'Shaman', totalGames: 10, totalsWins: 5 },
    { playerClass: 'Mage', totalGames: 0, totalsWins: 0 },
    { playerClass: 'Mage', totalGames: 'many', totalsWins: 1 },
    { playerClass: 'Mage', totalGames: 100, totalsWins: 'some' },
    {
      playerClass: 'Death   Knight',
      totalGames: 400,
      totalsWins: 210,
      playerHeroPower: 'HERO_11bp-x',
      winsDistribution: [
        { wins: 2, total: 90 },
        { wins: 0, games: 120 },
        { wins: 1 },
        { total: 30 },
        'bad',
        { wins: 12, total: 4 },
      ],
      matchups: [
        { opponentClass: 'mage', opponentHeroPower: ' HERO_08bp ', totalGames: 200, totalsWins: 90 },
        { opponentClass: 'Priest', totalGames: 0, totalsWins: 0 },
        { opponentClass: 'Shaman', totalGames: 20, totalsWins: 10 },
        { opponentClass: 'warrior', totalGames: 20 },
        { opponentClass: 'warrior', totalsWins: 3 },
        'bad',
      ],
      pct_7_plus: 0.31,
    },
    { playerClass: 'warrior', totalGames: 100, totalsWins: 40, winsDistribution: 'none', matchups: {}, sevenPlusWinsRate: 9 },
  ], CLASS_INFO);

  assert.deepEqual(tiers, [
    {
      id: 'death-knight', name: 'Рыцарь смерти', winrate: 52.5, games: 400, wins: 210, losses: 190, heroPowerCardId: null,
      winsDistribution: [{ wins: 0, games: 120 }, { wins: 2, games: 90 }, { wins: 12, games: 4 }],
      matchups: [{ opponentClassId: 'mage', opponentHeroPowerCardId: 'HERO_08bp', games: 200, wins: 90, losses: 110, winrate: 45 }],
      pickRate: null,
      sevenPlusWinsRate: 31,
    },
    {
      id: 'warrior', name: 'Воин', winrate: 40, games: 100, wins: 40, losses: 60, heroPowerCardId: null,
      winsDistribution: [], matchups: [], pickRate: null, sevenPlusWinsRate: 9,
    },
  ]);
});
