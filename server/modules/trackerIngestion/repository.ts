import type { DatabaseSync } from 'node:sqlite';
import type { TrackerProfileEvent } from './model.js';

export const TRACKER_EVENT_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS tracker_profile_events (
    user_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    occurred_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, event_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_tracker_profile_events_user_time
    ON tracker_profile_events(user_id, occurred_at DESC);
`;

export type TrackerEventRepository = {
  acknowledge: (userId: string, events: readonly TrackerProfileEvent[], receivedAt: number) => void;
};

export function createSqliteTrackerEventRepository(
  getDatabase: () => DatabaseSync,
): TrackerEventRepository {
  return {
    acknowledge(userId, events, receivedAt) {
      const database = getDatabase();
      const insert = database.prepare(`
        INSERT OR IGNORE INTO tracker_profile_events (
          user_id, event_id, event_type, schema_version, occurred_at, payload_json, received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      database.exec('BEGIN IMMEDIATE');
      try {
        for (const event of events) {
          insert.run(
            userId,
            event.eventId,
            event.type,
            event.schemaVersion,
            event.occurredAt,
            JSON.stringify(event.payload),
            receivedAt,
          );
        }
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

export function initializeTrackerEventRepository(getDatabase: () => DatabaseSync): void {
  getDatabase().exec(TRACKER_EVENT_TABLES_SQL);
}
