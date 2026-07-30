import assert from 'node:assert/strict';
import {
  firestoneArenaMatchupsDataset,
  normalizeFirestoneArenaClassRows,
  normalizeHsReplayArenaClassRows,
} from '../server/modules/arena/classStatisticsNormalizer.js';

const classInfo = {
  mage: { id: 'mage', name: 'Маг', color: '#0000ff' },
  deathknight: { id: 'death-knight', name: 'Рыцарь смерти', color: '#00ffff' },
};
const classIds = {
  mage: 'mage',
  deathknight: 'death-knight',
};

const hsReplay = normalizeHsReplayArenaClassRows([
  {
    class: 'Mage',
    win_rate: 0.548,
    num_drafts: 12_345,
    wins: 6_765,
    losses: 5_580,
    pick_rate: '11.4%',
    pct_7_plus: 0.247,
  },
], classIds, classInfo);

assert.deepEqual(hsReplay[0], {
  ...classInfo.mage,
  winrate: 54.8,
  games: 12_345,
  wins: 6_765,
  losses: 5_580,
  pickRate: 11.4,
  sevenPlusWinsRate: 24.7,
});

const firestone = normalizeFirestoneArenaClassRows([
  {
    playerClass: 'Death Knight',
    totalGames: 10_000,
    totalsWins: 5_250,
    playerHeroPower: 'HERO_11bp',
    winsDistribution: [
      { wins: 0, total: 1_200 },
      { wins: 1, total: 2_800 },
    ],
    matchups: [{
      opponentClass: 'mage',
      opponentHeroPower: 'HERO_08bp',
      totalGames: 2_100,
      totalsWins: 1_134,
    }],
    pickRate: 0.173,
    sevenPlusWinsRate: '22.5%',
  },
], classInfo);

assert.deepEqual(firestone[0], {
  ...classInfo.deathknight,
  winrate: 52.5,
  games: 10_000,
  wins: 5_250,
  losses: 4_750,
  heroPowerCardId: 'HERO_11bp',
  winsDistribution: [
    { wins: 0, games: 1_200 },
    { wins: 1, games: 2_800 },
  ],
  matchups: [{
    opponentClassId: 'mage',
    opponentHeroPowerCardId: 'HERO_08bp',
    games: 2_100,
    wins: 1_134,
    losses: 966,
    winrate: 54,
  }],
  pickRate: 17.3,
  sevenPlusWinsRate: 22.5,
});

assert.deepEqual(
  firestoneArenaMatchupsDataset({
    classes: firestone,
    updatedAt: '2026-07-30T12:00:00.000Z',
    source: 'firestoneapp.com',
  }).matchups,
  [{
    classAId: 'death-knight',
    classBId: 'mage',
    winrate: 54,
    games: 2_100,
  }],
);

assert.deepEqual(
  normalizeHsReplayArenaClassRows([{ class: 'Unknown', games: 10, winrate: 50 }], classIds, classInfo),
  [],
);

console.log('Arena class statistics normalizer tests passed');
