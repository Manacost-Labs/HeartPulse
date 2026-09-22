import type { DatabaseSync } from 'node:sqlite';
import type { CredentialAccount, CredentialCode, CredentialRepository, NewCredentialAccount } from './model.js';

type RepositoryDependencies = {
  database: () => DatabaseSync;
  now: () => number;
  insertAccount: (database: DatabaseSync, account: NewCredentialAccount) => void;
};

/** The insert adapter preserves existing profile-ID, email-identity and mailing-contact creation. */
export function createCredentialRepository(dependencies: RepositoryDependencies): CredentialRepository {
  const findAccount = (email: string): CredentialAccount | null => {
    const row = dependencies.database().prepare(`
      SELECT id, email, password_hash, blocked_at FROM users WHERE email = ?
    `).get(email);
    return row ? {
      id: String(row.id), email: String(row.email),
      passwordHash: String(row.password_hash), blockedAt: String(row.blocked_at ?? ''),
    } : null;
  };
  const transaction = (operation: (database: DatabaseSync) => boolean): boolean => {
    const database = dependencies.database();
    database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation(database);
      database.exec('COMMIT');
      return result;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  };
  const saveCode = (database: DatabaseSync, code: CredentialCode) => {
    database.prepare(`
      INSERT INTO pending_codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        attempts = CASE WHEN pending_codes.expires_at > ?
          THEN MAX(pending_codes.attempts, excluded.attempts) ELSE excluded.attempts END
    `).run(code.email, code.codeHash, code.expiresAt, code.attempts, dependencies.now());
  };
  return {
    findAccount,
    findCode(email) {
      const row = dependencies.database().prepare(`
        SELECT email, code_hash, expires_at, attempts FROM pending_codes WHERE email = ?
      `).get(email);
      return row ? {
        email: String(row.email), codeHash: String(row.code_hash),
        expiresAt: Number(row.expires_at), attempts: Number(row.attempts),
      } : null;
    },
    register(account, code) {
      return transaction(database => {
        if (database.prepare('SELECT id FROM users WHERE id = ? OR email = ?').get(account.id, account.email)) return false;
        dependencies.insertAccount(database, account);
        saveCode(database, code);
        return true;
      });
    },
    saveLoginCode(account, code) {
      return transaction(database => {
        const current = findAccount(account.email);
        if (!current || current.id !== account.id || current.blockedAt || current.passwordHash !== account.passwordHash) return false;
        saveCode(database, code);
        return true;
      });
    },
  };
}
