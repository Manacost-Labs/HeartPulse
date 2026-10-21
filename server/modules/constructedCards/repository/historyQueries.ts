import type { DatabaseSync } from 'node:sqlite';
import type {
  ConstructedCardFormat,
  ConstructedCardHistoryAveragePoint,
  ConstructedCardPeriod,
  ConstructedCardRank,
} from '../serviceContracts.js';

type Slice = { format: ConstructedCardFormat; period: ConstructedCardPeriod; rank: ConstructedCardRank };

/** Earliest snapshot of one validated, upper-case card ID; a primary-key prefix seek. */
export function readTrackedSince(database: DatabaseSync, { format, period, rank }: Slice, cardId: string): string | null {
  const row = database.prepare(`
    SELECT MIN(recorded_at) AS first FROM card_stat_history
    WHERE format = ? AND rank = ? AND period = ? AND card_id = ?
  `).get(format, rank, period, cardId) as { first: string | null } | undefined;
  return row?.first ?? null;
}

/**
 * Play-weighted average winrates of sampled cards (with a deck winrate) per snapshot since `since`,
 * of the validated `cardIds` or of every card when null. Snapshots with fewer than `minimumCards`
 * sampled cards are left out; cards without a played winrate do not dilute that average.
 */
export function readPlayWeightedAverages(
  database: DatabaseSync,
  { format, period, rank }: Slice,
  cardIds: string[] | null,
  since: string,
  minimumCards: number,
): ConstructedCardHistoryAveragePoint[] {
  const rows = database.prepare(`
    SELECT
      recorded_at AS recordedAt,
      SUM(deck_winrate * times_played) / SUM(times_played) AS deckWinrate,
      SUM(winrate_when_played * times_played) / SUM(CASE WHEN winrate_when_played IS NULL THEN 0 ELSE times_played END)
        AS winrateWhenPlayed
    FROM card_stat_history
    WHERE format = ? AND rank = ? AND period = ? AND recorded_at >= ?
      AND deck_winrate IS NOT NULL AND times_played > 0
      ${cardIds ? `AND card_id IN (${cardIds.map(() => '?').join(',')})` : ''}
    GROUP BY recorded_at
    HAVING COUNT(*) >= ?
    ORDER BY recorded_at ASC
  `).all(format, rank, period, since, ...(cardIds ?? []), minimumCards) as ConstructedCardHistoryAveragePoint[];
  return rows.map(row => ({ ...row }));
}
