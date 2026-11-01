import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import type { ReplayKind } from './sanitize.js';

/** Shared replays are kept this long, then deleted (privacy policy, "Реплеи"). */
export const REPLAY_KEEP_DAYS = 180;
/** Replays one account may keep at once. */
export const REPLAY_MAX_PER_ACCOUNT = 200;

export const REPLAY_SHARE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS replay_shares (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    header_json TEXT NOT NULL,
    body_gzip BLOB NOT NULL,
    delete_token_hash TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_replay_shares_user_time ON replay_shares(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_replay_shares_time ON replay_shares(created_at);
`;

export type StoredReplay = { id: string; kind: ReplayKind; createdAt: number; header: Record<string, unknown> };

export type ReplayShareRepository = {
  /** Stores a sanitized replay; null when the account already keeps REPLAY_MAX_PER_ACCOUNT. Old replays go first. */
  store: (userId: string, kind: ReplayKind, header: Record<string, unknown>, text: string, now: number) => { id: string; deleteToken: string } | null;
  /** The stored file (gzip) and its header, or null. */
  read: (id: string, now: number) => { header: Record<string, unknown>; kind: ReplayKind; createdAt: number; gzip: Buffer } | null;
  /** The account's replays, newest first (no files). */
  list: (userId: string, now: number) => StoredReplay[];
  /** Deletes by the token handed out at upload ("delete by link"). */
  deleteWithToken: (id: string, token: string) => boolean;
  /** Deletes a replay of this account (the app's own token, or the account page). */
  deleteOwned: (userId: string, id: string) => boolean;
  /** Deletes replays older than REPLAY_KEEP_DAYS; returns how many. */
  prune: (now: number) => number;
};

const DAY = 86_400_000;
const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function newReplayId(): string {
  return [...randomBytes(10)].map(byte => ID_ALPHABET[byte % ID_ALPHABET.length]).join('');
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function initializeReplayShareRepository(getDatabase: () => DatabaseSync): void {
  getDatabase().exec(REPLAY_SHARE_TABLES_SQL);
}

export function createSqliteReplayShareRepository(getDatabase: () => DatabaseSync): ReplayShareRepository {
  const since = (now: number) => now - REPLAY_KEEP_DAYS * DAY;
  return {
    store(userId, kind, header, text, now) {
      const database = getDatabase();
      const count = Number((database.prepare('SELECT COUNT(*) AS n FROM replay_shares WHERE user_id = ? AND created_at >= ?')
        .get(userId, since(now)) as { n: number }).n);
      if (count >= REPLAY_MAX_PER_ACCOUNT) return null;
      const id = newReplayId();
      const deleteToken = randomBytes(24).toString('base64url');
      database.prepare(`INSERT INTO replay_shares (id, user_id, kind, created_at, header_json, body_gzip, delete_token_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, userId, kind, now, JSON.stringify(header), gzipSync(text), hashToken(deleteToken));
      return { id, deleteToken };
    },
    read(id, now) {
      const row = getDatabase().prepare('SELECT kind, created_at, header_json, body_gzip FROM replay_shares WHERE id = ? AND created_at >= ?')
        .get(id, since(now)) as { kind: ReplayKind; created_at: number; header_json: string; body_gzip: Uint8Array } | undefined;
      return row ? { kind: row.kind, createdAt: row.created_at, header: JSON.parse(row.header_json), gzip: Buffer.from(row.body_gzip) } : null;
    },
    list(userId, now) {
      const rows = getDatabase().prepare(`SELECT id, kind, created_at, header_json FROM replay_shares
        WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?`).all(userId, since(now), REPLAY_MAX_PER_ACCOUNT) as
        Array<{ id: string; kind: ReplayKind; created_at: number; header_json: string }>;
      return rows.map(row => ({ id: row.id, kind: row.kind, createdAt: row.created_at, header: JSON.parse(row.header_json) }));
    },
    deleteWithToken(id, token) {
      return Number(getDatabase().prepare('DELETE FROM replay_shares WHERE id = ? AND delete_token_hash = ?')
        .run(id, hashToken(token)).changes) > 0;
    },
    deleteOwned(userId, id) {
      return Number(getDatabase().prepare('DELETE FROM replay_shares WHERE id = ? AND user_id = ?').run(id, userId).changes) > 0;
    },
    prune(now) {
      return Number(getDatabase().prepare('DELETE FROM replay_shares WHERE created_at < ?').run(since(now)).changes);
    },
  };
}
