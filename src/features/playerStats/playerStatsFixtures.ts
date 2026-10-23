/*
 * Storybook answers of GET /api/account/game-stats, built from a few fixed
 * rows instead of a recorded payload, so every state stays readable here.
 */
import type { ArenaStats, BattlegroundsStats, ConstructedStats } from '../../modules/playerStats/public';

const DAY = 86_400_000;
const START = Date.UTC(2026, 8, 1, 18);

/** Deterministic pseudo-random sequence, so every render shows the same games. */
function sequence(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

const HEROES: Array<[string, string]> = [
  ['BG20_HERO_101', 'Зирелла'],
  ['BG20_HERO_242', 'Гафф Рунический Тотем'],
  ['BG20_HERO_201', 'Вол\'джин'],
  ['BG20_HERO_280', 'Куртрус Ливень Пепла'],
  ['BG20_HERO_100', 'Рокара'],
  ['BG20_HERO_103', 'Вестник смерти Черношип'],
];
const MINIONS: Array<[string, string]> = [
  ['BGS_018', 'Голдринн, Великий волк'],
  ['BG27_084', 'Шустрый скарабей'],
  ['BG26_817', 'Коллекционер мечей'],
  ['BG26_135', 'Музыкант Южных Морей'],
  ['BG24_715', 'Терпеливый разведчик'],
  ['BG25_001', 'Восставший всадник'],
  ['BGS_041', 'Калесгос, аспект магии'],
  ['BG26_152', 'Вспомогательный дрон'],
];
const DELTAS = [62, 41, 22, 6, -8, -24, -41, -58];

function ratingSeries(): BattlegroundsStats['ratingSeries'] {
  const random = sequence(7);
  let rating = 6_800;
  return Array.from({ length: 60 }, (_, index) => {
    const placement = 1 + Math.floor(random() * 8);
    const delta = DELTAS[placement - 1];
    rating += delta;
    return {
      id: `story-bg-${index}`,
      startedAt: START + index * 0.8 * DAY,
      heroCardId: HEROES[index % HEROES.length][0],
      placement,
      rating,
      delta,
      anomalyCardId: null,
      tavernTier: Math.max(3, 7 - Math.floor(placement / 2)),
      board: MINIONS.slice(0, 7).map(([cardId], slot) => ({
        cardId, attack: 8 + slot * 5 + index % 9, health: 10 + slot * 4 + index % 7, golden: (index + slot) % 4 === 0,
      })),
    };
  });
}

function heroes(): BattlegroundsStats['heroes'] {
  return HEROES.map(([heroCardId], index) => {
    const placements = [6, 5, 5, 4, 4, 3, 2, 1].map((count, place) => Math.max(0, count - ((index + place) % 3)));
    const games = placements.reduce((sum, count) => sum + count, 0);
    return {
      heroCardId,
      games,
      netRating: 180 - index * 70,
      averagePlacement: Math.round((placements.reduce((sum, count, place) => sum + count * (place + 1), 0) / games) * 100) / 100,
      placements,
      combat: Array.from({ length: 12 }, (_, turn) => ({ turn: turn + 1, winrate: 45 + ((turn * 7 + index * 11) % 25), rounds: games })),
      offered: games + 6 + index,
      picked: games,
      global: null,
    };
  });
}

const series = ratingSeries();
const ratings = series.map(point => point.rating);

export const battlegroundsFixture: BattlegroundsStats = {
  mode: 'battlegrounds',
  period: 'all',
  duos: false,
  games: series.length,
  summary: {
    highestRating: Math.max(...ratings),
    currentRating: ratings[ratings.length - 1],
    ratingChange: ratings[ratings.length - 1] - 6_800,
    averagePlacement: 4.35,
    placements: [8, 7, 9, 6, 8, 7, 8, 7],
    top4Rate: 50,
    firstPlaces: 8,
    timePlayedSeconds: series.length * 1_500,
  },
  ratingSeries: series,
  heroes: heroes(),
  global: { availability: 'subscription', mmr: 'TOP_50_PERCENT' },
  cards: Object.fromEntries([...HEROES, ...MINIONS]),
};

const DECKS = [
  { playerClass: 'DEATHKNIGHT' as const, deckName: 'Кровь и лёд', archetype: 'Blood Death Knight', games: 92, wins: 61 },
  { playerClass: 'PRIEST' as const, deckName: 'Драконы', archetype: 'Dragon Priest', games: 46, wins: 24 },
  { playerClass: 'SHAMAN' as const, deckName: 'Элементали', archetype: 'Elemental Shaman', games: 22, wins: 12 },
];
const OPPONENTS = ['HUNTER', 'SHAMAN', 'PALADIN', 'PRIEST', 'WARRIOR', 'MAGE', 'ROGUE', 'DRUID'] as const;

function rankSeries(): ConstructedStats['rankSeries'] {
  const random = sequence(11);
  let level = 41;
  let stars = 0;
  return Array.from({ length: 60 }, (_, index) => {
    const win = random() < 0.58;
    if (level < 51) {
      stars += win ? 1 : -1;
      if (stars > 3) { level += 1; stars = 1; }
      if (stars < 0) { level = Math.max(41, level - 1); stars = 2; }
    }
    const rank = { starLevel: level, stars: level === 51 ? 0 : stars, legendRank: level === 51 ? 4_000 - index * 40 : null };
    return { id: `story-std-${index}`, startedAt: START + index * DAY, result: win ? 'win' : 'loss',
      playerClass: DECKS[index % 3].playerClass, rank, value: rank.starLevel * 4 + rank.stars };
  });
}

const ranks = rankSeries();

export const standardFixture: ConstructedStats = {
  mode: 'standard',
  period: 'all',
  games: 160,
  summary: {
    wins: 97, losses: 63, ties: 0, winrate: 60.6, rankedGames: 142, averageDurationSeconds: 590, averageTurns: 10.3,
    timePlayedSeconds: 94_400, currentRank: ranks[ranks.length - 1].rank, bestRank: ranks[ranks.length - 1].rank,
    first: { games: 78, wins: 46 }, coin: { games: 82, wins: 51 },
  },
  rankSeries: ranks,
  decks: DECKS.map((deck, index) => ({ ...deck, key: `${deck.playerClass}:${deck.archetype}`, deckCode: null,
    lastPlayedAt: START + (60 - index) * DAY })),
  archetypes: DECKS.map(({ playerClass, archetype, games, wins }) => ({ playerClass, archetype, games, wins, globalWinrate: null })),
  classes: DECKS.map(({ playerClass, games, wins }) => ({ playerClass, games, wins, globalWinrate: null })),
  opponentClasses: OPPONENTS.map((opponentClass, index) => ({ opponentClass, games: 24 - index * 2, wins: 13 - index })),
  matchups: DECKS.flatMap(deck => OPPONENTS.map((opponentClass, index) => ({
    playerClass: deck.playerClass, opponentClass, games: 6 + index % 3, wins: 2 + (index + deck.games) % 5 }))),
  global: { availability: 'subscription' },
};

const RUN_CLASSES = ['PALADIN', 'MAGE', 'ROGUE', 'HUNTER', 'WARLOCK', 'DEMONHUNTER'] as const;
const runs: ArenaStats['runs'] = Array.from({ length: 12 }, (_, index) => {
  const wins = [3, 7, 1, 12, 5, 2, 9, 0, 4, 6, 10, 2][index];
  const losses = wins === 12 ? 1 : 3;
  return { runId: `story-run-${index}`, playerClass: RUN_CLASSES[index % RUN_CLASSES.length], wins, losses: index === 0 ? 1 : losses,
    games: wins + losses, startedAt: START + index * 4 * DAY, lastPlayedAt: START + index * 4 * DAY + 3_600_000,
    complete: index !== 0, underground: false };
}).reverse();

export const arenaFixture: ArenaStats = {
  mode: 'arena',
  period: 'all',
  games: runs.reduce((sum, run) => sum + run.games, 0),
  summary: {
    runs: runs.length,
    averageWins: Math.round((runs.reduce((sum, run) => sum + run.wins, 0) / runs.length) * 100) / 100,
    bestRun: runs.find(run => run.wins === 12) ?? null,
    twelveWinRuns: 1,
    wins: runs.reduce((sum, run) => sum + run.wins, 0),
    losses: runs.reduce((sum, run) => sum + run.losses, 0),
    gameWinrate: 58.4,
    timePlayedSeconds: 86_000,
  },
  runs,
  classes: RUN_CLASSES.map((playerClass, index) => ({ playerClass, runs: 2, averageWins: 6 - index * 0.7, games: 18 - index,
    wins: 11 - index, globalWinrate: null, globalAverageWins: null })),
  global: { availability: 'subscription' },
};
