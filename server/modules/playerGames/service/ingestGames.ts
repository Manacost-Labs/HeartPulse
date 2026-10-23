import { MAX_GAMES_PER_ACCOUNT, type IngestResult, type PlayerGame } from '../model/game.js';
import type { PlayerGameStore } from '../repository/gameStore.js';
import { validatePlayerGame } from '../schema/gameSchema.js';

/**
 * Validates each item independently, so one bad game never blocks the rest of
 * the batch, then stores the valid ones in one transaction. Results keep the
 * input order. The account quota counts only games that would be new.
 */
export function ingestGameBatch(
  store: PlayerGameStore,
  userId: string,
  items: readonly unknown[],
  now: number,
): IngestResult[] {
  const results: Array<IngestResult | null> = [];
  const valid: Array<{ index: number; game: PlayerGame }> = [];
  const seen = new Set<string>();
  for (const item of items) {
    const validation = validatePlayerGame(item, now);
    if (validation.ok !== true) {
      results.push({ id: validation.id ?? '', status: 'rejected', code: validation.code,
        ...(validation.field ? { field: validation.field } : {}) });
      continue;
    }
    if (seen.has(validation.game.id)) {
      results.push({ id: validation.game.id, status: 'rejected', code: 'DUPLICATE_ID' });
      continue;
    }
    seen.add(validation.game.id);
    valid.push({ index: results.length, game: validation.game });
    results.push(null);
  }

  const room = Math.max(0, MAX_GAMES_PER_ACCOUNT - store.countGames(userId));
  const accepted = valid.length <= room ? valid : valid.slice(0, room);
  const statuses = store.upsertGames(userId, accepted.map(entry => entry.game), now);
  accepted.forEach((entry, position) => {
    results[entry.index] = { id: entry.game.id, status: statuses[position] };
  });
  for (const entry of valid.slice(accepted.length)) {
    results[entry.index] = { id: entry.game.id, status: 'rejected', code: 'QUOTA_EXCEEDED' };
  }
  return results as IngestResult[];
}
