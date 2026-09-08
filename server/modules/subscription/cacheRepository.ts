import type { DatabaseSync } from 'node:sqlite';

export interface SubscriptionCacheRow {
  userId: string;
  hasAccess: boolean;
  source: string;
  message: string;
  checkedAt: string | null;
  stale: boolean;
  boosty: Record<string, unknown>;
  telegram: Record<string, unknown>;
  patreon: Record<string, unknown>;
  updatedAt: string;
}

/** Canonical subscription cache writer shared by production composition and synthetic route tests. */
export function writeSubscriptionCacheRow(database: DatabaseSync, row: SubscriptionCacheRow): void {
  database.prepare(`INSERT INTO subscriptions (
    user_id, has_access, source, message, checked_at, stale, boosty_json, telegram_json, patreon_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    has_access = excluded.has_access, source = excluded.source, message = excluded.message,
    checked_at = excluded.checked_at, stale = excluded.stale, boosty_json = excluded.boosty_json,
    telegram_json = excluded.telegram_json, patreon_json = excluded.patreon_json, updated_at = excluded.updated_at`).run(
    row.userId, row.hasAccess ? 1 : 0, row.source, row.message, row.checkedAt, row.stale ? 1 : 0,
    JSON.stringify(row.boosty), JSON.stringify(row.telegram), JSON.stringify(row.patreon), row.updatedAt,
  );
}
