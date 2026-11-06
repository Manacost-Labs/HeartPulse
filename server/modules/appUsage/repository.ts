import type { DatabaseSync } from 'node:sqlite';
import { APP_USAGE_KEEP_DAYS } from './config.js';

/** One row per (account, UTC day, feature, game): a game counts once however often the app asks. No IP, no names. */
export const APP_USAGE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS app_usage_claims (
    user_id TEXT NOT NULL,
    day TEXT NOT NULL,
    feature TEXT NOT NULL,
    game_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, day, feature, game_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_app_usage_claims_time ON app_usage_claims(created_at);
`;

export type AppUsageRepository = {
  /** Games of the feature counted for the account that day. */
  used: (userId: string, day: string, feature: string) => number;
  /** Whether this game was already counted (a repeat never counts again). */
  claimed: (userId: string, day: string, feature: string, gameId: string) => boolean;
  /** Counts the game; false when it already was. */
  claim: (userId: string, day: string, feature: string, gameId: string, now: number) => boolean;
  /**
   * Counts the game only while fewer than `limit` games are counted that day, in one statement inside an immediate
   * transaction, so two requests (or two processes on one file) can never pass the limit together. False: refused.
   */
  claimWithin: (userId: string, day: string, feature: string, gameId: string, limit: number, now: number) => boolean;
  /** The account's claims for its data export, one JSON object each (day, feature, game id, time). */
  exportRows: (userId: string) => Iterable<string>;
  /** Deletes claims older than APP_USAGE_KEEP_DAYS; returns how many. */
  prune: (now: number) => number;
};

export function initializeAppUsageRepository(getDatabase: () => DatabaseSync): void {
  getDatabase().exec(APP_USAGE_TABLES_SQL);
}

export function createSqliteAppUsageRepository(getDatabase: () => DatabaseSync): AppUsageRepository {
  return {
    used(userId, day, feature) {
      return Number((getDatabase().prepare('SELECT COUNT(*) AS n FROM app_usage_claims WHERE user_id = ? AND day = ? AND feature = ?')
        .get(userId, day, feature) as { n: number }).n);
    },
    claimed(userId, day, feature, gameId) {
      return Boolean(getDatabase().prepare('SELECT 1 FROM app_usage_claims WHERE user_id = ? AND day = ? AND feature = ? AND game_id = ?')
        .get(userId, day, feature, gameId));
    },
    claim(userId, day, feature, gameId, now) {
      return Number(getDatabase().prepare(`INSERT OR IGNORE INTO app_usage_claims (user_id, day, feature, game_id, created_at)
        VALUES (?, ?, ?, ?, ?)`).run(userId, day, feature, gameId, now).changes) > 0;
    },
    claimWithin(userId, day, feature, gameId, limit, now) {
      const database = getDatabase();
      database.exec('BEGIN IMMEDIATE');
      try {
        const changes = Number(database.prepare(`INSERT OR IGNORE INTO app_usage_claims (user_id, day, feature, game_id, created_at)
          SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM app_usage_claims WHERE user_id = ? AND day = ? AND feature = ?) < ?`)
          .run(userId, day, feature, gameId, now, userId, day, feature, limit).changes);
        database.exec('COMMIT');
        return changes > 0;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    *exportRows(userId) {
      const rows = getDatabase().prepare('SELECT day, feature, game_id, created_at FROM app_usage_claims WHERE user_id = ? ORDER BY created_at')
        .all(userId) as Array<{ day: string; feature: string; game_id: string; created_at: number }>;
      for (const row of rows) {
        yield JSON.stringify({ day: row.day, feature: row.feature, gameId: row.game_id, at: new Date(row.created_at).toISOString() });
      }
    },
    prune(now) {
      return Number(getDatabase().prepare('DELETE FROM app_usage_claims WHERE created_at < ?')
        .run(now - APP_USAGE_KEEP_DAYS * 86_400_000).changes);
    },
  };
}
