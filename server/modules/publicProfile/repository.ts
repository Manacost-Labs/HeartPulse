import type { DatabaseSync } from 'node:sqlite';
import { isPublicProfileId, MAX_PUBLIC_PROFILE_ID } from './identity.js';
import type { PublicProfileCandidate } from './model.js';

export type PublicProfileIdentityOptions = {
  /** Existing owner accounts that should receive the first available IDs. */
  preferredUserIds?: readonly string[];
};

function normalizeStoredPublicId(value: unknown): number | null {
  const normalized = String(value ?? '');
  return isPublicProfileId(normalized) ? Number(normalized) : null;
}

function nextAvailablePublicId(reserved: Set<number>): number {
  for (let candidate = 1; candidate <= MAX_PUBLIC_PROFILE_ID; candidate += 1) {
    if (!reserved.has(candidate)) return candidate;
  }
  throw new Error('Закончился диапазон публичных ID профилей');
}

/**
 * Adds stable numeric profile IDs without replacing internal user IDs or the
 * former opaque public IDs. Existing assignments are immutable; only missing
 * or invalid values are filled. This keeps future deck ownership tied to the
 * internal user ID while exposing a short, safe URL identifier.
 */
export function ensurePublicProfileIds(
  database: DatabaseSync,
  options: PublicProfileIdentityOptions = {},
): void {
  const columns = new Set(
    (database.prepare('PRAGMA table_info(users)').all() as Array<{ name?: unknown }>)
      .map(row => String(row.name ?? '')),
  );
  if (!columns.has('public_numeric_id')) {
    database.exec('ALTER TABLE users ADD COLUMN public_numeric_id INTEGER');
  }

  const users = database.prepare(
    'SELECT id, public_numeric_id FROM users ORDER BY rowid',
  ).all() as Array<{ id: string; public_numeric_id?: number | string | null }>;
  const preferredOrder = new Map(
    (options.preferredUserIds ?? []).map((id, index) => [String(id), index]),
  );
  const orderedUsers = users
    .map((user, index) => ({ user, index }))
    .sort((left, right) => {
      const leftPriority = preferredOrder.get(left.user.id) ?? Number.MAX_SAFE_INTEGER;
      const rightPriority = preferredOrder.get(right.user.id) ?? Number.MAX_SAFE_INTEGER;
      return leftPriority - rightPriority || left.index - right.index;
    })
    .map(item => item.user);

  const reserved = new Set<number>();
  const retainedByUser = new Map<string, number>();
  try {
    database.exec('BEGIN IMMEDIATE');
    const update = database.prepare(
      'UPDATE users SET public_numeric_id = ? WHERE id = ?',
    );

    for (const user of users) {
      const current = normalizeStoredPublicId(user.public_numeric_id);
      if (current !== null && !reserved.has(current)) {
        reserved.add(current);
        retainedByUser.set(user.id, current);
      }
    }
    for (const user of orderedUsers) {
      if (retainedByUser.has(user.id)) continue;
      const publicProfileId = nextAvailablePublicId(reserved);
      update.run(publicProfileId, user.id);
      reserved.add(publicProfileId);
    }
    database.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_numeric_id ON users(public_numeric_id)',
    );
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function resolveUserPublicProfileId(
  database: DatabaseSync,
  user: { id: string; publicProfileId?: string },
): string {
  const stored = database.prepare(
    'SELECT public_numeric_id FROM users WHERE id = ?',
  ).get(user.id) as { public_numeric_id?: number | string | null } | undefined;
  const storedId = normalizeStoredPublicId(stored?.public_numeric_id);
  if (storedId !== null) return String(storedId);

  const requestedId = String(user.publicProfileId ?? '');
  if (isPublicProfileId(requestedId)) {
    const owner = database.prepare(
      'SELECT id FROM users WHERE public_numeric_id = ? LIMIT 1',
    ).get(Number(requestedId)) as { id?: string } | undefined;
    if (!owner?.id || owner.id === user.id) return requestedId;
  }

  const maximum = database.prepare(
    'SELECT COALESCE(MAX(public_numeric_id), 0) AS maximum FROM users',
  ).get() as { maximum?: number | string } | undefined;
  const candidate = Number(maximum?.maximum ?? 0) + 1;
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > MAX_PUBLIC_PROFILE_ID) {
    throw new Error('Не удалось создать публичный ID профиля');
  }
  return String(candidate);
}

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
  `);
}

/** Runs every public-profile migration in order; each one is idempotent. */
export function ensurePublicProfileSchema(
  database: DatabaseSync,
  options: PublicProfileIdentityOptions = {},
): void {
  ensurePublicProfileIds(database, options);
  ensurePublicNicknameSchema(database);
}

/**
 * Reads only the columns the public projection needs. Blocked accounts are
 * filtered here, so they are indistinguishable from missing ones.
 */
export function findPublicProfile(
  database: DatabaseSync,
  publicProfileId: string,
): PublicProfileCandidate | null {
  if (!isPublicProfileId(publicProfileId)) return null;
  return (database.prepare(`
    SELECT
      u.public_numeric_id AS publicNumericId,
      u.nickname AS nickname,
      u.created_at AS createdAt,
      COALESCE(s.has_access, 0) AS hasSubscription
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    WHERE u.public_numeric_id = ? AND COALESCE(u.blocked_at, '') = ''
    LIMIT 1
  `).get(Number(publicProfileId)) as PublicProfileCandidate | undefined) ?? null;
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
