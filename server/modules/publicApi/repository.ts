import type { DatabaseSync } from 'node:sqlite';
import {
  PUBLIC_API_SCOPES,
  type ApiKeyRecord,
  type ApiKeyRepository,
  type PublicApiScope,
} from './model.js';

export const PUBLIC_API_KEYS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS public_api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL UNIQUE,
    key_hash TEXT NOT NULL,
    scopes_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    last_used_at TEXT,
    revoked_at TEXT,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT
  );
  CREATE INDEX IF NOT EXISTS idx_public_api_keys_created
    ON public_api_keys(created_at DESC);
`;

export function initializePublicApiKeyRepository(getDatabase: () => DatabaseSync): void {
  getDatabase().exec(PUBLIC_API_KEYS_TABLE_SQL);
}

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  key_hash: string;
  scopes_json: string;
  created_at: string;
  created_by: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

function parseScopes(value: string): PublicApiScope[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(scope => String(scope))
      .filter((scope): scope is PublicApiScope => PUBLIC_API_SCOPES.includes(scope as PublicApiScope));
  } catch {
    return [];
  }
}

const recordFromRow = (row: ApiKeyRow): ApiKeyRecord => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  keyHash: row.key_hash,
  scopes: parseScopes(row.scopes_json),
  createdAt: row.created_at,
  createdBy: row.created_by,
  lastUsedAt: row.last_used_at,
  revokedAt: row.revoked_at,
});

/**
 * Persistence adapter for the public API domain. Database acquisition stays
 * lazy so importing the module never opens production state during tests.
 */
export function createSqliteApiKeyRepository(getDatabase: () => DatabaseSync): ApiKeyRepository {
  return {
    insert(record) {
      getDatabase().prepare(`
        INSERT INTO public_api_keys (
          id, name, prefix, key_hash, scopes_json, created_at, created_by, last_used_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.name,
        record.prefix,
        record.keyHash,
        JSON.stringify(record.scopes),
        record.createdAt,
        record.createdBy,
        record.lastUsedAt,
        record.revokedAt,
      );
    },

    list() {
      const rows = getDatabase().prepare(`
        SELECT id, name, prefix, key_hash, scopes_json, created_at, created_by, last_used_at, revoked_at
        FROM public_api_keys
        ORDER BY created_at DESC, id DESC
      `).all() as unknown as ApiKeyRow[];
      return rows.map(recordFromRow);
    },

    findByPrefix(prefix) {
      const row = getDatabase().prepare(`
        SELECT id, name, prefix, key_hash, scopes_json, created_at, created_by, last_used_at, revoked_at
        FROM public_api_keys
        WHERE prefix = ?
        LIMIT 1
      `).get(prefix) as ApiKeyRow | undefined;
      return row ? recordFromRow(row) : null;
    },

    revoke(id, revokedAt) {
      const database = getDatabase();
      database.prepare(`
        UPDATE public_api_keys
        SET revoked_at = COALESCE(revoked_at, ?)
        WHERE id = ?
      `).run(revokedAt, id);
      const row = database.prepare(`
        SELECT id, name, prefix, key_hash, scopes_json, created_at, created_by, last_used_at, revoked_at
        FROM public_api_keys
        WHERE id = ?
        LIMIT 1
      `).get(id) as ApiKeyRow | undefined;
      return row ? recordFromRow(row) : null;
    },

    touch(id, lastUsedAt) {
      getDatabase().prepare(`
        UPDATE public_api_keys
        SET last_used_at = ?
        WHERE id = ? AND revoked_at IS NULL
      `).run(lastUsedAt, id);
    },
  };
}
