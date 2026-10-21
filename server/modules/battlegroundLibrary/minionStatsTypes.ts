/**
 * Response of `GET /api/bg/library/minions/:dbfId/stats`: HSReplay statistics of one Battlegrounds minion for one stored slice
 * (docs/specs/battleground-minion-stats.md). hs-data-api publishes the
 * upstream numbers unchanged; a null always means "below the sample threshold"
 * (30 games/combats/offers, 200 board occurrences), never zero.
 * Percentages are 0–100; placements are 1–8; impact is in places, positive is better.
 */
export type BattlegroundMinionStatsTotals = {
  impact: number | null;
  combatWinrate: number | null;
  popularity: number | null;
  gamesWith: number;
  placementWith: number | null;
  placementWithout: number | null;
  wins: number;
  losses: number;
};

export type BattlegroundMinionRoundStat = {
  impact: number | null;
  combatWinrate: number | null;
  popularity: number | null;
  wins: number;
  losses: number;
};

export type BattlegroundMinionRound = {
  round: number;
  normal: BattlegroundMinionRoundStat | null;
  golden: BattlegroundMinionRoundStat | null;
  /** Median stats of the minion on boards in this combat round. */
  median: { normal: [number, number] | null; golden: [number, number] | null };
};

export type BattlegroundMinionPurchase = {
  round: number;
  /** Purchase rate of the k-th copy among shop offers, percent. */
  copies: [number | null, number | null, number | null];
  /** Pick rate of the k-th copy among discover offers, percent. */
  discover: [number | null, number | null, number | null];
};

export type BattlegroundMinionBoardSlot = {
  position: number;
  popularity: number | null;
  impact: number | null;
  occurrences: number;
};

export type BattlegroundMinionBoard = { occurrences: number; slots: BattlegroundMinionBoardSlot[] };

export type BattlegroundMinionStats = {
  minion: {
    dbfId: number;
    cardId: string;
    nameRu: string | null;
    tavernTier: number | null;
    attack: number | null;
    health: number | null;
    images: { card: string | null; cardGolden: string | null; art: string | null };
  };
  slice: { mmr: string; period: string; fetchedAt: string | null; updatedAt: string | null };
  normal: BattlegroundMinionStatsTotals | null;
  golden: BattlegroundMinionStatsTotals | null;
  rounds: BattlegroundMinionRound[];
  purchases: BattlegroundMinionPurchase[];
  positions: {
    compositionId: number;
    defaultBoard: 'normal' | 'taunt';
    normal: BattlegroundMinionBoard | null;
    taunt: BattlegroundMinionBoard | null;
    compositions: Array<{ id: number; name: string }>;
  };
};
