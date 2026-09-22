import type { DatabaseSync } from 'node:sqlite';
import { TelegramAuthIdentityError } from './model.js';

export function assertActiveTelegramLinkSession(
  database: DatabaseSync,
  input: { userId: string; sessionTokenHash: string; now: number },
): void {
  const session = input.userId && input.sessionTokenHash
    ? database.prepare(`
      SELECT 1 AS active
      FROM sessions
      WHERE token_hash = ? AND user_id = ? AND expires_at > ?
      LIMIT 1
    `).get(input.sessionTokenHash, input.userId, input.now) as { active?: number } | undefined
    : undefined;
  if (!session?.active) {
    throw new TelegramAuthIdentityError(
      'LINK_SESSION_INVALID',
      'Сессия привязки Telegram завершена. Войдите и начните привязку заново.',
    );
  }
}

export function ensureTelegramLinkTokenSessionBinding(database: DatabaseSync): void {
  const columns = new Set(
    (database.prepare('PRAGMA table_info(telegram_link_tokens)').all() as Array<{ name?: unknown }>)
      .map(row => String(row.name ?? '')),
  );
  if (!columns.has('session_token_hash')) {
    database.exec("ALTER TABLE telegram_link_tokens ADD COLUMN session_token_hash TEXT NOT NULL DEFAULT ''");
  }
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_session
    ON telegram_link_tokens(session_token_hash, user_id, expires_at)
  `);
}

export function ensureTelegramIdentityOwnershipConstraint(database: DatabaseSync): void {
  const audit = database.prepare(`
    SELECT
      (
        SELECT COUNT(*)
        FROM (
          SELECT 1
          FROM identities
          WHERE provider IN ('telegram', 'telegram_oidc')
          GROUP BY user_id, provider
          HAVING COUNT(*) > 1
        )
      ) AS duplicate_groups,
      (
        SELECT COUNT(*)
        FROM identities AS identity
        LEFT JOIN users AS owner ON owner.id = identity.user_id
        WHERE identity.provider IN ('telegram', 'telegram_oidc')
          AND owner.id IS NULL
      ) AS orphan_rows
  `).get() as { duplicate_groups?: number; orphan_rows?: number } | undefined;
  const duplicateGroups = Number(audit?.duplicate_groups ?? 0);
  const orphanRows = Number(audit?.orphan_rows ?? 0);
  if (duplicateGroups > 0 || orphanRows > 0) {
    throw new Error(
      `Telegram identity ownership audit failed: duplicate_groups=${duplicateGroups}, orphan_rows=${orphanRows}`,
    );
  }
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_identities_user_telegram_provider
    ON identities(user_id, provider)
    WHERE provider IN ('telegram', 'telegram_oidc')
  `);
}

export function ensureTelegramAuthDatabaseConstraints(database: DatabaseSync): void {
  ensureTelegramIdentityOwnershipConstraint(database);
  ensureTelegramLinkTokenSessionBinding(database);
}
