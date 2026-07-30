import type { DatabaseSync } from 'node:sqlite';
import {
  APPLICATION_AUTH_SCOPES,
  type ApplicationAuthRepository,
  type ApplicationAuthScope,
  type ApplicationDeviceAuthorization,
  type ApplicationToken,
} from './model.js';

export const APPLICATION_AUTH_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS application_device_authorizations (
    device_code_hash TEXT PRIMARY KEY,
    user_code_hash TEXT NOT NULL UNIQUE,
    client_id TEXT NOT NULL,
    scopes_json TEXT NOT NULL,
    status TEXT NOT NULL,
    user_id TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    interval_seconds INTEGER NOT NULL,
    last_polled_at INTEGER,
    approved_at INTEGER,
    denied_at INTEGER,
    consumed_at INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_application_device_expiry
    ON application_device_authorizations(expires_at);

  CREATE TABLE IF NOT EXISTS application_tokens (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    scopes_json TEXT NOT NULL,
    access_token_hash TEXT NOT NULL UNIQUE,
    refresh_token_hash TEXT NOT NULL UNIQUE,
    access_expires_at INTEGER NOT NULL,
    refresh_expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    revoked_at INTEGER,
    replaced_by_id TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_application_token_family
    ON application_tokens(family_id);
  CREATE INDEX IF NOT EXISTS idx_application_token_expiry
    ON application_tokens(refresh_expires_at);
`;

type DeviceRow = {
  device_code_hash: string;
  user_code_hash: string;
  client_id: string;
  scopes_json: string;
  status: ApplicationDeviceAuthorization['status'];
  user_id: string | null;
  created_at: number;
  expires_at: number;
  interval_seconds: number;
  last_polled_at: number | null;
  approved_at: number | null;
  denied_at: number | null;
  consumed_at: number | null;
};

type TokenRow = {
  id: string;
  family_id: string;
  client_id: string;
  user_id: string;
  scopes_json: string;
  access_token_hash: string;
  refresh_token_hash: string;
  access_expires_at: number;
  refresh_expires_at: number;
  created_at: number;
  revoked_at: number | null;
  replaced_by_id: string | null;
};

function parseScopes(value: string): ApplicationAuthScope[] {
  try {
    const scopes = JSON.parse(value);
    if (!Array.isArray(scopes)) return [];
    return scopes
      .map(scope => String(scope))
      .filter((scope): scope is ApplicationAuthScope => (
        APPLICATION_AUTH_SCOPES.includes(scope as ApplicationAuthScope)
      ));
  } catch {
    return [];
  }
}

const deviceFromRow = (row: DeviceRow): ApplicationDeviceAuthorization => ({
  deviceCodeHash: row.device_code_hash,
  userCodeHash: row.user_code_hash,
  clientId: row.client_id,
  scopes: parseScopes(row.scopes_json),
  status: row.status,
  userId: row.user_id,
  createdAt: Number(row.created_at),
  expiresAt: Number(row.expires_at),
  intervalSeconds: Number(row.interval_seconds),
  lastPolledAt: row.last_polled_at === null ? null : Number(row.last_polled_at),
  approvedAt: row.approved_at === null ? null : Number(row.approved_at),
  deniedAt: row.denied_at === null ? null : Number(row.denied_at),
  consumedAt: row.consumed_at === null ? null : Number(row.consumed_at),
});

const tokenFromRow = (row: TokenRow): ApplicationToken => ({
  id: row.id,
  familyId: row.family_id,
  clientId: row.client_id,
  userId: row.user_id,
  scopes: parseScopes(row.scopes_json),
  accessTokenHash: row.access_token_hash,
  refreshTokenHash: row.refresh_token_hash,
  accessExpiresAt: Number(row.access_expires_at),
  refreshExpiresAt: Number(row.refresh_expires_at),
  createdAt: Number(row.created_at),
  revokedAt: row.revoked_at === null ? null : Number(row.revoked_at),
  replacedById: row.replaced_by_id,
});

const insertToken = (database: DatabaseSync, token: ApplicationToken) => {
  database.prepare(`
    INSERT INTO application_tokens (
      id, family_id, client_id, user_id, scopes_json, access_token_hash,
      refresh_token_hash, access_expires_at, refresh_expires_at, created_at,
      revoked_at, replaced_by_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    token.id,
    token.familyId,
    token.clientId,
    token.userId,
    JSON.stringify(token.scopes),
    token.accessTokenHash,
    token.refreshTokenHash,
    token.accessExpiresAt,
    token.refreshExpiresAt,
    token.createdAt,
    token.revokedAt,
    token.replacedById,
  );
};

/**
 * SQLite adapter with atomic code consumption and refresh rotation. Concurrent
 * exchanges can therefore issue at most one token pair per authorization.
 */
export function createSqliteApplicationAuthRepository(
  getDatabase: () => DatabaseSync,
): ApplicationAuthRepository {
  return {
    insertDevice(record) {
      const result = getDatabase().prepare(`
        INSERT OR IGNORE INTO application_device_authorizations (
          device_code_hash, user_code_hash, client_id, scopes_json, status,
          user_id, created_at, expires_at, interval_seconds, last_polled_at,
          approved_at, denied_at, consumed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.deviceCodeHash,
        record.userCodeHash,
        record.clientId,
        JSON.stringify(record.scopes),
        record.status,
        record.userId,
        record.createdAt,
        record.expiresAt,
        record.intervalSeconds,
        record.lastPolledAt,
        record.approvedAt,
        record.deniedAt,
        record.consumedAt,
      );
      return Number(result.changes) === 1;
    },

    findDeviceByHash(hash) {
      const row = getDatabase().prepare(`
        SELECT * FROM application_device_authorizations WHERE device_code_hash = ? LIMIT 1
      `).get(hash) as DeviceRow | undefined;
      return row ? deviceFromRow(row) : null;
    },

    findDeviceByUserCodeHash(hash) {
      const row = getDatabase().prepare(`
        SELECT * FROM application_device_authorizations WHERE user_code_hash = ? LIMIT 1
      `).get(hash) as DeviceRow | undefined;
      return row ? deviceFromRow(row) : null;
    },

    approveDevice(hash, userId, approvedAt) {
      const result = getDatabase().prepare(`
        UPDATE application_device_authorizations
        SET status = 'APPROVED', user_id = ?, approved_at = ?
        WHERE device_code_hash = ? AND status = 'PENDING' AND expires_at > ?
      `).run(userId, approvedAt, hash, approvedAt);
      return Number(result.changes) === 1;
    },

    denyDevice(hash, deniedAt) {
      const result = getDatabase().prepare(`
        UPDATE application_device_authorizations
        SET status = 'DENIED', denied_at = ?
        WHERE device_code_hash = ? AND status = 'PENDING' AND expires_at > ?
      `).run(deniedAt, hash, deniedAt);
      return Number(result.changes) === 1;
    },

    recordDevicePoll(hash, polledAt, intervalSeconds) {
      const result = getDatabase().prepare(`
        UPDATE application_device_authorizations
        SET last_polled_at = ?, interval_seconds = ?
        WHERE device_code_hash = ?
      `).run(polledAt, intervalSeconds, hash);
      return Number(result.changes) === 1;
    },

    issueDeviceTokens(hash, token, consumedAt) {
      const database = getDatabase();
      database.exec('BEGIN IMMEDIATE');
      try {
        const result = database.prepare(`
          UPDATE application_device_authorizations
          SET status = 'CONSUMED', consumed_at = ?
          WHERE device_code_hash = ? AND status = 'APPROVED' AND expires_at > ?
        `).run(consumedAt, hash, consumedAt);
        if (Number(result.changes) !== 1) {
          database.exec('ROLLBACK');
          return false;
        }
        insertToken(database, token);
        database.exec('COMMIT');
        return true;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },

    findTokenByAccessHash(hash) {
      const row = getDatabase().prepare(`
        SELECT * FROM application_tokens WHERE access_token_hash = ? LIMIT 1
      `).get(hash) as TokenRow | undefined;
      return row ? tokenFromRow(row) : null;
    },

    findTokenByRefreshHash(hash) {
      const row = getDatabase().prepare(`
        SELECT * FROM application_tokens WHERE refresh_token_hash = ? LIMIT 1
      `).get(hash) as TokenRow | undefined;
      return row ? tokenFromRow(row) : null;
    },

    rotateRefreshToken(oldRefreshHash, next, revokedAt) {
      const database = getDatabase();
      database.exec('BEGIN IMMEDIATE');
      try {
        const result = database.prepare(`
          UPDATE application_tokens
          SET revoked_at = ?, replaced_by_id = ?
          WHERE refresh_token_hash = ?
            AND revoked_at IS NULL
            AND refresh_expires_at > ?
        `).run(revokedAt, next.id, oldRefreshHash, revokedAt);
        if (Number(result.changes) !== 1) {
          database.exec('ROLLBACK');
          return false;
        }
        insertToken(database, next);
        database.exec('COMMIT');
        return true;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },

    revokeTokenFamily(familyId, revokedAt) {
      getDatabase().prepare(`
        UPDATE application_tokens
        SET revoked_at = COALESCE(revoked_at, ?)
        WHERE family_id = ?
      `).run(revokedAt, familyId);
    },

    revokeByRefreshHash(hash, revokedAt) {
      const database = getDatabase();
      const row = database.prepare(`
        SELECT family_id FROM application_tokens WHERE refresh_token_hash = ? LIMIT 1
      `).get(hash) as { family_id: string } | undefined;
      if (!row) return false;
      database.prepare(`
        UPDATE application_tokens
        SET revoked_at = COALESCE(revoked_at, ?)
        WHERE family_id = ?
      `).run(revokedAt, row.family_id);
      return true;
    },
  };
}

export function initializeApplicationAuthRepository(getDatabase: () => DatabaseSync): void {
  const database = getDatabase();
  database.exec(APPLICATION_AUTH_TABLES_SQL);
  const currentTime = Date.now();
  database.prepare('DELETE FROM application_device_authorizations WHERE expires_at <= ?').run(currentTime);
  database.prepare('DELETE FROM application_tokens WHERE refresh_expires_at <= ?').run(currentTime);
}
