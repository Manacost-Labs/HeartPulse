import type { DatabaseSync } from 'node:sqlite';

export function initializeIdentityStorage(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS browser_identity_models (
      model TEXT NOT NULL, id_hash TEXT NOT NULL, payload TEXT NOT NULL,
      expires_at INTEGER, consumed INTEGER,
      grant_hash TEXT, uid_hash TEXT, user_code_hash TEXT,
      PRIMARY KEY (model, id_hash)
    );
    CREATE INDEX IF NOT EXISTS browser_identity_grants ON browser_identity_models (grant_hash);
    CREATE INDEX IF NOT EXISTS browser_identity_uids ON browser_identity_models (model, uid_hash);
    CREATE INDEX IF NOT EXISTS browser_identity_codes ON browser_identity_models (model, user_code_hash);
    CREATE INDEX IF NOT EXISTS browser_identity_expiry ON browser_identity_models (expires_at);
    CREATE TABLE IF NOT EXISTS browser_identity_revoked_grants (
      grant_hash TEXT PRIMARY KEY, revoked_at INTEGER NOT NULL
    );
  `);
}
