import type { DatabaseSync } from 'node:sqlite';

/** Backfill optional account columns on databases created by earlier releases. */
export function ensureAccountColumns(database: DatabaseSync): void {
  const userColumns = new Set(database.prepare('PRAGMA table_info(users)').all().map(row => String(row.name)));
  for (const column of ['contact_vk_url', 'contact_telegram', 'contact_email', 'blocked_at']) {
    if (!userColumns.has(column)) database.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT`);
  }
  const subscriptionColumns = new Set(database.prepare('PRAGMA table_info(subscriptions)').all().map(row => String(row.name)));
  if (!subscriptionColumns.has('patreon_json')) {
    database.exec("ALTER TABLE subscriptions ADD COLUMN patreon_json TEXT NOT NULL DEFAULT '{}'");
  }
}
