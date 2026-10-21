import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';

/**
 * Browser side of `GET /api/bg/library/minions/:dbfId/stats`
 * (docs/specs/battleground-minion-stats.md). Express validates the hs-data-api
 * answer (`server/modules/battlegroundLibrary/minionStatsContract.ts`); these
 * types mirror its output. A null is always "below the sample threshold", never zero.
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

export type BattlegroundMinionBoard = {
  occurrences: number;
  slots: Array<{ position: number; popularity: number | null; impact: number | null; occurrences: number }>;
};

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
  rounds: Array<{
    round: number;
    normal: BattlegroundMinionRoundStat | null;
    golden: BattlegroundMinionRoundStat | null;
    median: { normal: [number, number] | null; golden: [number, number] | null };
  }>;
  purchases: Array<{
    round: number;
    copies: [number | null, number | null, number | null];
    discover: [number | null, number | null, number | null];
  }>;
  positions: {
    compositionId: number;
    defaultBoard: 'normal' | 'taunt';
    normal: BattlegroundMinionBoard | null;
    taunt: BattlegroundMinionBoard | null;
    compositions: Array<{ id: number; name: string }>;
  };
};

function isStats(value: unknown, dbfId: number): value is BattlegroundMinionStats {
  const stats = value as BattlegroundMinionStats | null;
  return Boolean(stats && typeof stats === 'object' && stats.minion?.dbfId === dbfId
    && Array.isArray(stats.rounds) && Array.isArray(stats.purchases)
    && stats.positions && Array.isArray(stats.positions.compositions));
}

/** Same-origin statistics of one minion; `null` when the slice has no games (404). Rejects on other failures. */
export async function fetchBattlegroundMinionStats(dbfId: number, composition = 0, signal?: AbortSignal): Promise<BattlegroundMinionStats | null> {
  const query = composition ? `?composition=${composition}` : '';
  const response = await fetchWithDeadline(`/api/bg/library/minions/${dbfId}/stats${query}`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!isStats(payload, dbfId)) throw new Error('Invalid minion statistics');
  return payload;
}
