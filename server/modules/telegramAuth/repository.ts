// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import type { DatabaseSync } from 'node:sqlite';
import {
  TelegramAuthIdentityError,
  type TelegramAuthIdentityClaim,
} from './model.js';

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

function conflictFor(claim: TelegramAuthIdentityClaim): TelegramAuthIdentityError {
  if (claim.provider === 'boosty-email') {
    return new TelegramAuthIdentityError(
      'BOOSTY_IDENTITY_CONFLICT',
      'Эта Boosty-почта уже привязана к другому аккаунту',
    );
  }
  return new TelegramAuthIdentityError(
    'TELEGRAM_IDENTITY_CONFLICT',
    'Этот Telegram уже привязан к другому аккаунту',
  );
}

function isTelegramProviderOwnershipConflict(error: unknown): boolean {
  return error instanceof Error
    && /UNIQUE constraint failed: identities\.user_id, identities\.provider/.test(error.message);
}

export function issueTelegramLinkToken(
  database: DatabaseSync,
  input: {
    userId: string;
    sessionTokenHash: string;
    now: number;
    ttlMs: number;
    randomCode: () => string;
  },
): { code: string; expiresAt: number } {
  if (!input.userId || !input.sessionTokenHash) {
    throw new TelegramAuthIdentityError(
      'LINK_TOKEN_INVALID',
      'Сессия Telegram-привязки недействительна',
    );
  }
  const expiresAt = input.now + input.ttlMs;
  database.prepare(`
    DELETE FROM telegram_link_tokens
    WHERE user_id = ? OR expires_at <= ? OR used_at IS NOT NULL
  `).run(input.userId, input.now);
  const insert = database.prepare(`
    INSERT OR IGNORE INTO telegram_link_tokens (
      code, user_id, session_token_hash, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?)
  `);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = input.randomCode();
    const result = insert.run(
      code,
      input.userId,
      input.sessionTokenHash,
      expiresAt,
      new Date(input.now).toISOString(),
    );
    if (Number(result.changes) === 1) return { code, expiresAt };
  }
  throw new Error('Не удалось создать Telegram-код');
}

/**
 * Claims normalized identities inside the caller's existing auth-store
 * transaction. A conflict throws so the caller can roll back user and session
 * mutations together with every claim in this batch.
 */
export function claimTelegramAuthIdentities(
  database: DatabaseSync,
  userId: string,
  claims: readonly TelegramAuthIdentityClaim[],
): void {
  for (const claim of claims) {
    if (claim.provider === 'telegram' || claim.provider === 'telegram_oidc') {
      const otherIdentity = database.prepare(`
        SELECT provider_user_id
        FROM identities
        WHERE user_id = ? AND provider = ? AND provider_user_id <> ?
        LIMIT 1
      `).get(userId, claim.provider, claim.providerUserId) as { provider_user_id?: string } | undefined;
      if (otherIdentity?.provider_user_id) throw conflictFor(claim);
    }

    try {
      database.prepare(`
        INSERT INTO identities (
          user_id, provider, provider_user_id, email, username, photo_url,
          verified_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, provider_user_id) DO NOTHING
      `).run(
        userId,
        claim.provider,
        claim.providerUserId,
        claim.email,
        claim.username,
        claim.photoUrl,
        claim.verifiedAt,
        claim.verifiedAt,
        claim.verifiedAt,
      );
    } catch (error) {
      if ((claim.provider === 'telegram' || claim.provider === 'telegram_oidc')
        && isTelegramProviderOwnershipConflict(error)) {
        throw conflictFor(claim);
      }
      throw error;
    }

    const owner = database.prepare(`
      SELECT user_id
      FROM identities
      WHERE provider = ? AND provider_user_id = ?
    `).get(claim.provider, claim.providerUserId) as { user_id?: string } | undefined;
    if (owner?.user_id !== userId) throw conflictFor(claim);

    database.prepare(`
      UPDATE identities
      SET email = ?, username = ?, photo_url = ?, verified_at = ?, updated_at = ?
      WHERE user_id = ? AND provider = ? AND provider_user_id = ?
    `).run(
      claim.email,
      claim.username,
      claim.photoUrl,
      claim.verifiedAt,
      claim.verifiedAt,
      userId,
      claim.provider,
      claim.providerUserId,
    );
  }
}

export function consumeTelegramLinkToken(
  database: DatabaseSync,
  input: {
    code: string;
    userId: string;
    sessionTokenHash: string;
    telegramId: string;
    usedAt: string;
    now: number;
  },
): boolean {
  if (!input.sessionTokenHash) return false;
  const result = database.prepare(`
    UPDATE telegram_link_tokens
    SET used_at = ?, telegram_id = ?
    WHERE code = ?
      AND user_id = ?
      AND session_token_hash = ?
      AND used_at IS NULL
      AND expires_at > ?
      AND EXISTS (
        SELECT 1
        FROM sessions
        WHERE sessions.token_hash = telegram_link_tokens.session_token_hash
          AND sessions.user_id = telegram_link_tokens.user_id
          AND sessions.expires_at > ?
      )
  `).run(
    input.usedAt,
    input.telegramId,
    input.code,
    input.userId,
    input.sessionTokenHash,
    input.now,
    input.now,
  );
  return Number(result.changes) === 1;
}

export function storeTelegramAuthIntent(
  database: DatabaseSync,
  input: { nonceHash: string; expiresAt: number; createdAt: string; now: number },
): void {
  database.prepare('DELETE FROM telegram_auth_intents WHERE expires_at <= ?').run(input.now);
  database.prepare(`
    INSERT INTO telegram_auth_intents (nonce_hash, expires_at, created_at)
    VALUES (?, ?, ?)
  `).run(input.nonceHash, input.expiresAt, input.createdAt);
}

export function consumeTelegramAuthIntentNonce(
  database: DatabaseSync,
  input: { nonceHash: string; now: number },
): boolean {
  const result = database.prepare(`
    DELETE FROM telegram_auth_intents
    WHERE nonce_hash = ? AND expires_at > ?
  `).run(input.nonceHash, input.now);
  return Number(result.changes) === 1;
}

export function consumeTelegramAuthIntentAndClaimIdentities(
  database: DatabaseSync,
  input: {
    nonceHash: string;
    now: number;
    userId: string;
    claims: readonly TelegramAuthIdentityClaim[];
  },
): void {
  if (!consumeTelegramAuthIntentNonce(database, input)) {
    throw new TelegramAuthIdentityError(
      'AUTH_INTENT_INVALID',
      'Сессия входа через Telegram уже использована или устарела',
    );
  }
  claimTelegramAuthIdentities(database, input.userId, input.claims);
}

/**
 * Runs inside the caller's auth-store transaction so either the bot token and
 * every identity claim commit together, or the caller rolls all of them back.
 * Consumption also requires the exact issuing browser session to remain active
 * for the same user at the transaction's effective time.
 */
export function consumeTelegramLinkTokenAndClaimIdentities(
  database: DatabaseSync,
  input: {
    code: string;
    userId: string;
    sessionTokenHash: string;
    telegramId: string;
    usedAt: string;
    now: number;
    claims: readonly TelegramAuthIdentityClaim[];
  },
): void {
  if (!consumeTelegramLinkToken(database, input)) {
    throw new TelegramAuthIdentityError(
      'LINK_TOKEN_INVALID',
      'Код Telegram уже использован или устарел',
    );
  }
  claimTelegramAuthIdentities(database, input.userId, input.claims);
}
