import type { DatabaseSync } from 'node:sqlite';
import { sessionActivityToRecord, type AccountSessionActivity, type StoredAccountSession } from './model.js';

export type AccountSessionStore = {
  /** The user's unexpired sessions. */
  list: (userId: string, now: number) => StoredAccountSession[];
  /** Deletes one session of this user; false when the user has no such session. */
  revoke: (userId: string, tokenHash: string) => boolean;
  /** Deletes every session of this user except `keepTokenHash`; returns how many. */
  revokeOthers: (userId: string, keepTokenHash: string) => number;
  recordActivity: (tokenHash: string, activity: AccountSessionActivity) => void;
};

/** Additive columns on `sessions`; rows from before them read as never seen, with no device or place. */
export function ensureAccountSessionColumns(database: DatabaseSync): void {
  const columns = new Set((database.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: unknown }>)
    .map(row => String(row.name)));
  if (!columns.has('last_seen_at')) database.exec('ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER');
  if (!columns.has('client')) database.exec("ALTER TABLE sessions ADD COLUMN client TEXT NOT NULL DEFAULT ''");
  if (!columns.has('region')) database.exec("ALTER TABLE sessions ADD COLUMN region TEXT NOT NULL DEFAULT ''");
}

/**
 * Every statement is scoped by `user_id`, so one account can neither read nor
 * end another account's sessions. Deletion is the revocation: each request
 * looks its session up in this table, so a deleted row is refused at once.
 */
export function createSqliteAccountSessionStore(database: () => DatabaseSync): AccountSessionStore {
  return {
    list: (userId, now) => database()
      .prepare('SELECT token_hash, created_at, last_seen_at, client, region FROM sessions WHERE user_id = ? AND expires_at > ?')
      .all(userId, now)
      .map(row => {
        const value = row as Record<string, unknown>;
        return {
          tokenHash: String(value.token_hash),
          createdAt: String(value.created_at ?? ''),
          lastSeenAt: value.last_seen_at === null || value.last_seen_at === undefined ? null : Number(value.last_seen_at),
          client: String(value.client ?? ''),
          region: String(value.region ?? ''),
        };
      }),
    revoke: (userId, tokenHash) => database()
      .prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash = ?').run(userId, tokenHash).changes > 0,
    revokeOthers: (userId, keepTokenHash) => Number(database()
      .prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, keepTokenHash).changes),
    recordActivity: (tokenHash, activity) => {
      database().prepare('UPDATE sessions SET last_seen_at = ?, client = ?, region = ? WHERE token_hash = ?')
        .run(activity.lastSeenAt, activity.client, activity.region, tokenHash);
    },
  };
}

type ActiveSession = { tokenHash: string; lastSeenAt?: number | null; client?: string; region?: string };

/**
 * Records a request on the session when due (at most once per
 * SESSION_ACTIVITY_INTERVAL_MS) and mirrors it on the loaded session, so a
 * later whole-store save in the same request keeps it. A targeted UPDATE: it
 * can never bring back a session revoked since the store was loaded.
 */
export function recordSessionActivity(
  store: Pick<AccountSessionStore, 'recordActivity'>,
  request: { headers: Record<string, unknown> },
  session: ActiveSession,
  now = Date.now(),
): void {
  const activity = sessionActivityToRecord(
    { lastSeenAt: session.lastSeenAt ?? null, client: session.client ?? '', region: session.region ?? '' },
    { userAgent: request.headers['user-agent'], region: request.headers['x-arena-client-region'] },
    now,
  );
  if (!activity) return;
  Object.assign(session, activity);
  try {
    store.recordActivity(session.tokenHash, activity);
  } catch {
    // Activity is display-only; a busy database must not fail the request.
  }
}
