import { randomBytes } from 'node:crypto';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import type { DatabaseSync } from 'node:sqlite';

const PUBLIC_PROFILE_ID_PATTERN = /^p_[A-Za-z0-9_-]{22}$/;
const PUBLIC_PROFILE_ID_ATTEMPTS = 100;

export function createPublicProfileId(): string {
  return `p_${randomBytes(16).toString('base64url')}`;
}

export function isPublicProfileId(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_PROFILE_ID_PATTERN.test(value);
}

function allocatePublicProfileId(
  database: DatabaseSync,
  generate: () => string,
  reserved: Set<string> = new Set(),
): string {
  for (let attempt = 0; attempt < PUBLIC_PROFILE_ID_ATTEMPTS; attempt += 1) {
    const candidate = generate();
    if (!isPublicProfileId(candidate) || reserved.has(candidate)) continue;
    const existing = database.prepare(
      'SELECT 1 FROM users WHERE public_profile_id = ? LIMIT 1',
    ).get(candidate);
    if (!existing) return candidate;
  }
  throw new Error('Не удалось создать уникальный публичный ID профиля');
}

export function ensurePublicProfileIds(
  database: DatabaseSync,
  generate: () => string = createPublicProfileId,
): void {
  const columns = new Set(
    (database.prepare('PRAGMA table_info(users)').all() as Array<{ name?: unknown }>)
      .map(row => String(row.name ?? '')),
  );
  if (!columns.has('public_profile_id')) {
    database.exec('ALTER TABLE users ADD COLUMN public_profile_id TEXT');
  }

  const users = database.prepare(
    'SELECT id, public_profile_id FROM users ORDER BY id',
  ).all() as Array<{ id: string; public_profile_id?: string | null }>;
  const reserved = new Set<string>();

  try {
    database.exec('BEGIN IMMEDIATE');
    const update = database.prepare(
      'UPDATE users SET public_profile_id = ? WHERE id = ?',
    );
    for (const user of users) {
      const current = String(user.public_profile_id ?? '');
      if (isPublicProfileId(current) && !reserved.has(current)) {
        reserved.add(current);
        continue;
      }
      const publicProfileId = allocatePublicProfileId(database, generate, reserved);
      update.run(publicProfileId, user.id);
      reserved.add(publicProfileId);
    }
    database.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_profile_id ON users(public_profile_id)',
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
  generate: () => string = createPublicProfileId,
): string {
  const stored = database.prepare(
    'SELECT public_profile_id FROM users WHERE id = ?',
  ).get(user.id) as { public_profile_id?: string | null } | undefined;
  const storedId = String(stored?.public_profile_id ?? '');
  if (isPublicProfileId(storedId)) return storedId;

  const requestedId = String(user.publicProfileId ?? '');
  if (isPublicProfileId(requestedId)) {
    const owner = database.prepare(
      'SELECT id FROM users WHERE public_profile_id = ? LIMIT 1',
    ).get(requestedId) as { id?: string } | undefined;
    if (!owner?.id || owner.id === user.id) return requestedId;
  }

  return allocatePublicProfileId(database, generate);
}
