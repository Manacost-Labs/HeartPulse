export type StandardMatchupsFormat = 'standard' | 'wild';

/** HSGuru /matchups ranks in its menu order. */
export const STANDARD_MATCHUPS_RANKS = [
  'all', 'top_legend', 'top_5k', 'legend', 'diamond_to_legend', 'diamond_4to1', 'bronze_plat',
] as const;
export type StandardMatchupsRank = typeof STANDARD_MATCHUPS_RANKS[number];
/** HSGuru's «Min Matchup Games» menu. */
export const STANDARD_MATCHUPS_MIN_GAMES = [1, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000] as const;

/** The slice a reader picks; `period: null` opens the source's default, the Bans window. */
export interface StandardMatchupsSlice {
  format: StandardMatchupsFormat;
  rank: StandardMatchupsRank;
  period: string | null;
  minGames: number;
}

export const DEFAULT_STANDARD_MATCHUPS_SLICE: StandardMatchupsSlice = {
  format: 'standard', rank: 'legend', period: null, minGames: 25,
};

export interface StandardMatchupsAvailable {
  ranks: StandardMatchupsRank[];
  periods: string[];
  currentPeriod: string | null;
  defaultPeriod: string | null;
  minGames: number[];
}

/** Hero class inferred from the archetype name; null when the name names none. */
export type StandardMatchupsClassKey = 'deathknight' | 'demonhunter' | 'druid' | 'hunter' | 'mage' | 'paladin'
  | 'priest' | 'rogue' | 'shaman' | 'warlock' | 'warrior';

export interface StandardMatchupsColumn {
  name: string;
  label?: string;
  classKey?: StandardMatchupsClassKey | null;
  /** Share of the source's games, as published: "9.6%". */
  popularity: string | null;
  games?: number;
}

export interface StandardMatchupsCell {
  opponent: string;
  opponentLabel?: string;
  /** Percent; null when the pair is below the slice's minimum games. */
  winrate: number | null;
  /** Games of the pair; absent in payloads cached before the field existed. */
  games?: number;
}

export interface StandardMatchupsRow {
  archetype: string;
  archetypeLabel?: string;
  classKey?: StandardMatchupsClassKey | null;
  winrate: number | null;
  games?: number;
  cells: StandardMatchupsCell[];
}

export interface StandardMatchupsData {
  format: StandardMatchupsFormat;
  formatLabel: string;
  rank: StandardMatchupsRank;
  rankLabel: string;
  /** The window served; null only in payloads without slices. */
  period?: string | null;
  minGames?: number;
  totalGames?: number;
  available?: StandardMatchupsAvailable;
  source: string;
  sourceId?: string;
  sourceUrl?: string;
  updatedAt: string | null;
  columns: StandardMatchupsColumn[];
  rows: StandardMatchupsRow[];
  warning?: string;
}
