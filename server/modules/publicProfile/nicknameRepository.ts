import type { DatabaseSync } from 'node:sqlite';
import { normalizeStoredPublicId } from './identity.js';

/** How long a changed nickname cannot be changed again. */
export const NICKNAME_CHANGE_COOLDOWN_MS = 30 * 86_400_000;
/** How long a released nickname keeps redirecting to its last owner and stays unavailable to others. */
export const NICKNAME_HOLD_MS = 90 * 86_400_000;

/**
 * Adds the nickname columns and the release history. Idempotent: every run
 * checks the live schema first, so a restart never repeats a change.
 */
export function ensurePublicNicknameSchema(database: DatabaseSync): void {
  const columns = new Set(
    (database.prepare('PRAGMA table_info(users)').all() as Array<{ name?: unknown }>)
      .map(row => String(row.name ?? '')),
  );
  if (!columns.has('nickname')) database.exec('ALTER TABLE users ADD COLUMN nickname TEXT');
  if (!columns.has('nickname_key')) database.exec('ALTER TABLE users ADD COLUMN nickname_key TEXT');
  if (!columns.has('nickname_changed_at')) database.exec('ALTER TABLE users ADD COLUMN nickname_changed_at TEXT');
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname_key ON users(nickname_key);
    CREATE TABLE IF NOT EXISTS public_nickname_history (
      nickname_key TEXT NOT NULL,
      user_id TEXT NOT NULL,
      released_at TEXT NOT NULL,
      PRIMARY KEY (nickname_key, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_public_nickname_history_released
      ON public_nickname_history(released_at);
    -- A deleted account keeps its nickname held for the same 90 days, so an
    -- old shared /u/ link never starts pointing at a stranger. The timestamp
    -- matches Date#toISOString() so the hold comparisons stay lexical.
    CREATE TRIGGER IF NOT EXISTS trg_users_release_nickname_on_delete
      AFTER DELETE ON users
      WHEN OLD.nickname_key IS NOT NULL
    BEGIN
      INSERT INTO public_nickname_history (nickname_key, user_id, released_at)
      VALUES (OLD.nickname_key, OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(nickname_key, user_id) DO UPDATE SET released_at = excluded.released_at;
    END;
  `);
}

/**
 * The public ID behind a nickname key: its current holder, or the last holder
 * while the released nickname is still within its hold period.
 */
export function findPublicProfileIdByNickname(
  database: DatabaseSync,
  nicknameKey: string,
  now: Date,
): string | null {
  const current = database.prepare(`
    SELECT public_numeric_id AS id FROM users
    WHERE nickname_key = ? AND COALESCE(blocked_at, '') = ''
    LIMIT 1
  `).get(nicknameKey) as { id?: unknown } | undefined;
  const released = current ? undefined : database.prepare(`
    SELECT u.public_numeric_id AS id
    FROM public_nickname_history h
    JOIN users u ON u.id = h.user_id
    WHERE h.nickname_key = ? AND h.released_at > ? AND COALESCE(u.blocked_at, '') = ''
    ORDER BY h.released_at DESC
    LIMIT 1
  `).get(nicknameKey, new Date(now.getTime() - NICKNAME_HOLD_MS).toISOString()) as { id?: unknown } | undefined;
  return normalizeStoredPublicId((current ?? released)?.id)?.toString() ?? null;
}

export type OwnPublicIdentity = {
  publicProfileId: string;
  nickname: string | null;
  /** When the nickname may change again; null when it may change now. */
  nicknameChangeAvailableAt: string | null;
};

function ownIdentityFromRow(
  row: { public_numeric_id?: unknown; nickname?: unknown; nickname_changed_at?: unknown },
  now: Date,
): OwnPublicIdentity | null {
  const publicProfileId = normalizeStoredPublicId(row.public_numeric_id);
  if (publicProfileId === null) return null;
  const changedAt = Date.parse(String(row.nickname_changed_at ?? ''));
  const availableAt = Number.isFinite(changedAt) ? changedAt + NICKNAME_CHANGE_COOLDOWN_MS : 0;
  return {
    publicProfileId: String(publicProfileId),
    nickname: row.nickname ? String(row.nickname) : null,
    nicknameChangeAvailableAt: availableAt > now.getTime() ? new Date(availableAt).toISOString() : null,
  };
}

/** The signed-in person's own public ID and nickname state. */
export function readOwnPublicIdentity(
  database: DatabaseSync,
  userId: string,
  now: Date,
): OwnPublicIdentity | null {
  const row = database.prepare(
    'SELECT public_numeric_id, nickname, nickname_changed_at FROM users WHERE id = ?',
  ).get(userId) as Parameters<typeof ownIdentityFromRow>[0] | undefined;
  return row ? ownIdentityFromRow(row, now) : null;
}

export type NicknameClaimResult =
  | { status: 'saved'; identity: OwnPublicIdentity }
  | { status: 'taken' }
  | { status: 'cooldown'; availableAt: string }
  | { status: 'missing' };

/**
 * Sets the person's nickname in one write transaction. `BEGIN IMMEDIATE`
 * serializes concurrent claims across processes, and the unique index on
 * `nickname_key` is the final arbiter: a claim that loses a race reports
 * `taken` instead of failing. A case-only change keeps the key and is free.
 */
export function claimNickname(
  database: DatabaseSync,
  userId: string,
  nickname: { display: string; key: string },
  now: Date,
): NicknameClaimResult {
  const timestamp = now.toISOString();
  const holdStart = new Date(now.getTime() - NICKNAME_HOLD_MS).toISOString();
  database.exec('BEGIN IMMEDIATE');
  try {
    const user = database.prepare(
      'SELECT public_numeric_id, nickname, nickname_key, nickname_changed_at FROM users WHERE id = ?',
    ).get(userId) as { nickname_key?: unknown; nickname_changed_at?: unknown } | undefined;
    if (!user) {
      database.exec('ROLLBACK');
      return { status: 'missing' };
    }
    const currentKey = user.nickname_key ? String(user.nickname_key) : null;
    if (currentKey === nickname.key) {
      database.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname.display, userId);
    } else {
      const changedAt = Date.parse(String(user.nickname_changed_at ?? ''));
      if (currentKey && Number.isFinite(changedAt) && changedAt + NICKNAME_CHANGE_COOLDOWN_MS > now.getTime()) {
        database.exec('ROLLBACK');
        return { status: 'cooldown', availableAt: new Date(changedAt + NICKNAME_CHANGE_COOLDOWN_MS).toISOString() };
      }
      database.prepare('DELETE FROM public_nickname_history WHERE released_at <= ?').run(holdStart);
      const held = database.prepare(`
        SELECT 1 AS held FROM public_nickname_history
        WHERE nickname_key = ? AND user_id <> ?
        UNION ALL
        SELECT 1 FROM users WHERE nickname_key = ? AND id <> ?
        LIMIT 1
      `).get(nickname.key, userId, nickname.key, userId);
      if (held) {
        database.exec('ROLLBACK');
        return { status: 'taken' };
      }
      if (currentKey) {
        database.prepare(`
          INSERT INTO public_nickname_history (nickname_key, user_id, released_at) VALUES (?, ?, ?)
          ON CONFLICT(nickname_key, user_id) DO UPDATE SET released_at = excluded.released_at
        `).run(currentKey, userId, timestamp);
      }
      database.prepare('DELETE FROM public_nickname_history WHERE nickname_key = ? AND user_id = ?')
        .run(nickname.key, userId);
      database.prepare(
        'UPDATE users SET nickname = ?, nickname_key = ?, nickname_changed_at = ? WHERE id = ?',
      ).run(nickname.display, nickname.key, timestamp, userId);
    }
    const identity = readOwnPublicIdentity(database, userId, now);
    database.exec('COMMIT');
    return identity ? { status: 'saved', identity } : { status: 'missing' };
  } catch (error) {
    if (database.isTransaction) database.exec('ROLLBACK');
    if (error instanceof Error && /UNIQUE constraint failed: users\.nickname_key/.test(error.message)) {
      return { status: 'taken' };
    }
    throw error;
  }
}
