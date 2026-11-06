import type { DatabaseSync } from 'node:sqlite';
import { isPublicProfileId } from './identity.js';

/**
 * Whether a person shows their tracker statistics and decks on `/id/<n>/`.
 * It is off for every account until its owner switches it on: the games are
 * personal data the tracker sent for the owner's eyes only.
 */
export function ensurePublicStatsVisibilitySchema(database: DatabaseSync): void {
  const columns = new Set(
    (database.prepare('PRAGMA table_info(users)').all() as Array<{ name?: unknown }>)
      .map(row => String(row.name ?? '')),
  );
  if (!columns.has('public_stats_visible')) {
    database.exec('ALTER TABLE users ADD COLUMN public_stats_visible INTEGER NOT NULL DEFAULT 0');
  }
}

/** Saves the owner's choice; false when the account does not exist. */
export function setPublicStatsVisible(database: DatabaseSync, userId: string, visible: boolean): boolean {
  const result = database.prepare('UPDATE users SET public_stats_visible = ? WHERE id = ?')
    .run(visible ? 1 : 0, userId) as { changes?: number | bigint };
  return Number(result.changes ?? 0) > 0;
}

/**
 * The account behind a public ID, only while it shows its statistics and is
 * not blocked. Every other case is null, so the public statistics routes
 * answer a hidden, blocked and missing profile alike.
 */
export function findPublicStatsOwner(database: DatabaseSync, publicProfileId: string): string | null {
  if (!isPublicProfileId(publicProfileId)) return null;
  const row = database.prepare(`
    SELECT id FROM users
    WHERE public_numeric_id = ? AND public_stats_visible = 1 AND COALESCE(blocked_at, '') = ''
    LIMIT 1
  `).get(Number(publicProfileId)) as { id?: unknown } | undefined;
  return row?.id ? String(row.id) : null;
}

/** Whether the account shows its statistics publicly and is not blocked (chat commands read it by account id). */
export function isPublicStatsVisible(database: DatabaseSync, userId: string): boolean {
  const row = database.prepare(`
    SELECT 1 AS visible FROM users WHERE id = ? AND public_stats_visible = 1 AND COALESCE(blocked_at, '') = '' LIMIT 1
  `).get(userId) as { visible?: unknown } | undefined;
  return row?.visible === 1;
}
