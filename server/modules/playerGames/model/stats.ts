import type { BoardMinion, HearthstoneClass, LadderRank } from './game.js';

export const STATS_PERIODS = ['all', '7', '30', '90', 'season'] as const;
export type StatsPeriod = typeof STATS_PERIODS[number];

export const GLOBAL_MMR_FILTERS = ['TOP_50_PERCENT', 'TOP_20_PERCENT', 'TOP_5_PERCENT', 'TOP_1_PERCENT'] as const;
export type GlobalMmrFilter = typeof GLOBAL_MMR_FILTERS[number];

/** Newest games a statistics request reads; keeps aggregation bounded for heavy players. */
export const MAX_STATS_GAMES = 5_000;
export const MAX_SERIES_POINTS = 500;

/**
 * `available`: the viewer may see paid global statistics and they loaded;
 * `subscription`: global statistics need the section's subscription;
 * `unavailable`: the global source failed or has no data, so comparisons are hidden.
 */
export type GlobalAvailability = 'available' | 'subscription' | 'unavailable' | 'none';

export type WinLoss = { games: number; wins: number };

export type BattlegroundsHeroStats = {
  heroCardId: string;
  games: number;
  netRating: number | null;
  averagePlacement: number;
  placements: number[];
  combat: Array<{ turn: number; winrate: number; rounds: number }>;
  offered: number;
  picked: number;
  global: {
    averagePlacement: number | null;
    pickRatePercent: number | null;
    placementPercent: number[] | null;
    combat: Array<{ turn: number; winrate: number }> | null;
  } | null;
};

export type BattlegroundsStats = {
  mode: 'battlegrounds';
  period: StatsPeriod;
  duos: boolean;
  games: number;
  summary: {
    highestRating: number | null;
    currentRating: number | null;
    ratingChange: number | null;
    averagePlacement: number | null;
    placements: number[];
    top4Rate: number | null;
    firstPlaces: number;
    timePlayedSeconds: number;
  };
  ratingSeries: Array<{
    id: string;
    startedAt: number;
    heroCardId: string;
    placement: number;
    rating: number;
    delta: number | null;
    anomalyCardId: string | null;
    tavernTier: number | null;
    board: BoardMinion[];
  }>;
  heroes: BattlegroundsHeroStats[];
  global: { availability: GlobalAvailability; mmr: GlobalMmrFilter };
  cards: Record<string, string>;
};

export type ConstructedStats = {
  mode: 'standard' | 'wild';
  period: StatsPeriod;
  games: number;
  summary: {
    wins: number;
    losses: number;
    ties: number;
    winrate: number | null;
    rankedGames: number;
    averageDurationSeconds: number | null;
    averageTurns: number | null;
    timePlayedSeconds: number;
    currentRank: LadderRank | null;
    bestRank: LadderRank | null;
    first: WinLoss;
    coin: WinLoss;
  };
  rankSeries: Array<{ id: string; startedAt: number; result: string; playerClass: HearthstoneClass; rank: LadderRank; value: number }>;
  decks: Array<WinLoss & { key: string; deckCode: string | null; deckName: string | null; archetype: string | null; playerClass: HearthstoneClass; lastPlayedAt: number }>;
  archetypes: Array<WinLoss & { archetype: string; playerClass: HearthstoneClass; globalWinrate: number | null }>;
  classes: Array<WinLoss & { playerClass: HearthstoneClass; globalWinrate: number | null }>;
  opponentClasses: Array<WinLoss & { opponentClass: HearthstoneClass }>;
  matchups: Array<WinLoss & { playerClass: HearthstoneClass; opponentClass: HearthstoneClass }>;
  global: { availability: GlobalAvailability };
};

export type ArenaRun = {
  runId: string;
  playerClass: HearthstoneClass;
  wins: number;
  losses: number;
  games: number;
  startedAt: number;
  lastPlayedAt: number;
  complete: boolean;
  underground: boolean;
};

export type ArenaStats = {
  mode: 'arena';
  period: StatsPeriod;
  games: number;
  summary: {
    runs: number;
    averageWins: number | null;
    bestRun: ArenaRun | null;
    twelveWinRuns: number;
    wins: number;
    losses: number;
    gameWinrate: number | null;
    timePlayedSeconds: number;
  };
  runs: ArenaRun[];
  classes: Array<{ playerClass: HearthstoneClass; runs: number; averageWins: number; games: number; wins: number; }>;
  global: { availability: GlobalAvailability };
};

export type PlayerStats = BattlegroundsStats | ConstructedStats | ArenaStats;

export function rate(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : null;
}

export function average(total: number, count: number, digits = 2): number | null {
  if (count <= 0) return null;
  const factor = 10 ** digits;
  return Math.round((total / count) * factor) / factor;
}

/** Start of the period in epoch ms; a ranked season starts on the first day of the month (UTC). */
export function periodStart(period: StatsPeriod, now: number): number | null {
  if (period === 'all') return null;
  if (period === 'season') {
    const date = new Date(now);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  }
  return now - Number(period) * 86_400_000;
}
