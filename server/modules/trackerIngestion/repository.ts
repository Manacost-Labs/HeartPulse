import type { DatabaseSync } from 'node:sqlite';
import type { TrackerEventType, TrackerProfileEvent, TrackerSchemaVersion } from './model.js';

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
  CREATE INDEX IF NOT EXISTS idx_tracker_profile_events_user_type_time
    ON tracker_profile_events(user_id, event_type, occurred_at DESC);
`;

export type TrackerEventQuery = {
  types: readonly TrackerEventType[];
  since: string | null;
  limit: number;
  /** Only events of this schema version or newer; older ones are not even read. */
  minSchemaVersion?: number;
};

/** Where the next export page starts: after this event in export order. */
export type TrackerExportCursor = { occurredAt: string; rowId: number };
export type TrackerExportPage = {
  /** Each event as one JSON object, the payload exactly as stored. */
  rows: string[];
  /** Null once the account has no more events. */
  next: TrackerExportCursor | null;
};

export type TrackerEventRepository = {
  /**
   * Stores new events in one transaction and returns the ids refused because the
   * account already holds `maxEvents`; an id that is already stored is a replay,
   * never refused. Without `maxEvents` nothing is refused.
   */
  acknowledge: (userId: string, events: readonly TrackerProfileEvent[], receivedAt: number, maxEvents?: number) => string[];
  /** The account's newest events of the given types, newest first; payloads come back parsed. */
  listEvents: (userId: string, query: TrackerEventQuery) => TrackerProfileEvent[];
  /** Stored events per type from `minSchemaVersion` on, without reading any payload. */
  countEvents: (userId: string, types: readonly TrackerEventType[], minSchemaVersion: number) => Partial<Record<TrackerEventType, number>>;
  /** What the account page tells the player about the stored events. */
  summarize: (userId: string) => { events: number; firstOccurredAt: string | null; lastOccurredAt: string | null };
  /**
   * One page of the account's events, oldest first, for a streamed export: at
   * most `maxRows` events, and no more once `maxBytes` are reached (always at
   * least one). Pass the previous page's `next`; null starts at the beginning.
   */
  exportPage: (userId: string, after: TrackerExportCursor | null, maxRows: number, maxBytes: number) => TrackerExportPage;
  /** Deletes every stored event of the account and returns how many there were. */
  deleteAll: (userId: string) => number;
};

export function createSqliteTrackerEventRepository(
  getDatabase: () => DatabaseSync,
): TrackerEventRepository {
  return {
    acknowledge(userId, events, receivedAt, maxEvents) {
      const database = getDatabase();
      const stored = database.prepare('SELECT 1 FROM tracker_profile_events WHERE user_id = ? AND event_id = ?');
      const count = database.prepare('SELECT COUNT(*) AS count FROM tracker_profile_events WHERE user_id = ?');
      const refused: string[] = [];
      const insert = database.prepare(`
        INSERT OR IGNORE INTO tracker_profile_events (
          user_id, event_id, event_type, schema_version, occurred_at, payload_json, received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      database.exec('BEGIN IMMEDIATE');
      try {
        let total = maxEvents === undefined ? 0 : Number(count.get(userId)?.count ?? 0);
        for (const event of events) {
          if (maxEvents !== undefined && !stored.get(userId, event.eventId)) {
            if (total >= maxEvents) {
              refused.push(event.eventId);
              continue;
            }
            total += 1;
          }
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
      return refused;
    },
    summarize(userId) {
      const row = getDatabase().prepare(`SELECT COUNT(*) AS events, MIN(occurred_at) AS first, MAX(occurred_at) AS last
        FROM tracker_profile_events WHERE user_id = ?`).get(userId);
      return {
        events: Number(row?.events ?? 0),
        firstOccurredAt: row?.first ? String(row.first) : null,
        lastOccurredAt: row?.last ? String(row.last) : null,
      };
    },
    exportPage(userId, after, maxRows, maxBytes) {
      // Keyset paging in the order of idx_tracker_profile_events_user_time
      // (time ascending, rowid descending within one time), so no page sorts.
      const rows = getDatabase().prepare(`SELECT rowid AS row_id, event_id, event_type, schema_version, occurred_at,
          payload_json, received_at
        FROM tracker_profile_events
        WHERE user_id = ? AND occurred_at >= ? AND (occurred_at > ? OR rowid < ?)
        ORDER BY occurred_at, rowid DESC LIMIT ?`).iterate(userId, after?.occurredAt ?? '', after?.occurredAt ?? '', after?.rowId ?? 0, maxRows + 1);
      const page: string[] = [];
      let bytes = 0;
      let last: TrackerExportCursor | null = null;
      for (const row of rows) {
        if (page.length === maxRows || (page.length && bytes >= maxBytes)) return { rows: page, next: last };
        const payload = String(row.payload_json);
        bytes += payload.length;
        page.push(`{"eventId":${JSON.stringify(String(row.event_id))},"type":${JSON.stringify(String(row.event_type))},`
          + `"schemaVersion":${Number(row.schema_version)},"occurredAt":${JSON.stringify(String(row.occurred_at))},`
          + `"payload":${payload},"receivedAt":${Number(row.received_at)}}`);
        last = { occurredAt: String(row.occurred_at), rowId: Number(row.row_id) };
      }
      return { rows: page, next: null };
    },
    deleteAll(userId) {
      return Number(getDatabase().prepare('DELETE FROM tracker_profile_events WHERE user_id = ?').run(userId).changes);
    },
    countEvents(userId, types, minSchemaVersion) {
      if (!types.length) return {};
      const rows = getDatabase().prepare(`SELECT event_type, COUNT(*) AS count FROM tracker_profile_events
        WHERE user_id = ? AND event_type IN (${types.map(() => '?').join(', ')}) AND schema_version >= ?
        GROUP BY event_type`).all(userId, ...types, minSchemaVersion);
      return Object.fromEntries(rows.map(row => [String(row.event_type), Number(row.count)]));
    },
    listEvents(userId, query) {
      if (!query.types.length) return [];
      const rows = getDatabase().prepare(`SELECT event_id, event_type, schema_version, occurred_at, payload_json
        FROM tracker_profile_events
        WHERE user_id = ? AND event_type IN (${query.types.map(() => '?').join(', ')}) AND occurred_at >= ?
          AND schema_version >= ?
        ORDER BY occurred_at DESC LIMIT ?`).all(userId, ...query.types, query.since ?? '', query.minSchemaVersion ?? 1, query.limit);
      return rows.map(row => ({
        eventId: String(row.event_id),
        type: String(row.event_type) as TrackerEventType,
        schemaVersion: Number(row.schema_version) as TrackerSchemaVersion,
        occurredAt: String(row.occurred_at),
        payload: JSON.parse(String(row.payload_json)) as Record<string, unknown>,
      }));
    },
  };
}

export function initializeTrackerEventRepository(getDatabase: () => DatabaseSync): void {
  getDatabase().exec(TRACKER_EVENT_TABLES_SQL);
}
