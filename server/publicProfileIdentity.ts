// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import type { DatabaseSync } from 'node:sqlite';

const PUBLIC_PROFILE_ID_PATTERN = /^[1-9][0-9]{0,9}$/;
const LEGACY_PUBLIC_PROFILE_ID_PATTERN = /^p_[A-Za-z0-9_-]{22}$/;
const MAX_PUBLIC_PROFILE_ID = 2_147_483_647;

export type PublicProfileIdentityOptions = {
  /** Existing owner accounts that should receive the first available IDs. */
  preferredUserIds?: readonly string[];
};

export function isPublicProfileId(value: unknown): value is string {
  if (typeof value !== 'string' || !PUBLIC_PROFILE_ID_PATTERN.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= MAX_PUBLIC_PROFILE_ID;
}

export function isLegacyPublicProfileId(value: unknown): value is string {
  return typeof value === 'string' && LEGACY_PUBLIC_PROFILE_ID_PATTERN.test(value);
}

export function isPublicProfileLookupId(value: unknown): value is string {
  return isPublicProfileId(value) || isLegacyPublicProfileId(value);
}

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
