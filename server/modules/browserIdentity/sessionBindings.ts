import type { DatabaseSync } from 'node:sqlite';
import { createPayloadCipher, hashIdentifier } from './encryption.js';
import type { ReaderIdentity } from './configuration.js';
import { cleanupIdentityStorage } from './cleanup.js';
import { initializeIdentityStorage } from './schema.js';

const DEFAULT_BINDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BINDING_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Bind consent to an existing browser session; reset/block/logout revoke it without a second user store. */
export function createSessionBindings(database: DatabaseSync, key: Uint8Array, now = Date.now) {
  const cipher = createPayloadCipher(key);
  initializeIdentityStorage(database);
  const parent = (subject: string, sessionHash: string): ReaderIdentity | undefined => {
    const row = database.prepare(`SELECT u.id, u.name FROM users u JOIN sessions s ON s.user_id = u.id
      WHERE u.id = ? AND s.token_hash = ? AND s.expires_at > ?
      AND (u.blocked_at IS NULL OR u.blocked_at = '')`).get(subject, sessionHash, now());
    return row ? { subject: String(row.id), displayName: String(row.name ?? '') } : undefined;
  };
  return {
    parent,
    bind(grantId: string, subject: string, sessionHash: string, ttlMs = DEFAULT_BINDING_TTL_MS): void {
      if (!parent(subject, sessionHash)) throw new Error('Inactive parent session');
      if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new Error('Invalid binding lifetime');
      const id = hashIdentifier(grantId);
      database.prepare('INSERT INTO browser_identity_session_bindings VALUES (?, ?, ?)').run(
        id, cipher.encrypt({ subject, sessionHash }, id), now() + Math.min(ttlMs, MAX_BINDING_TTL_MS),
      );
    },
    resolve(subject: string, grantId?: string): ReaderIdentity | undefined {
      if (!grantId) return undefined;
      const id = hashIdentifier(grantId);
      const row = database.prepare('SELECT payload FROM browser_identity_session_bindings WHERE grant_hash = ? AND expires_at > ?').get(id, now());
      if (!row) return undefined;
      try {
        const binding = cipher.decrypt(String(row.payload), id) as { subject: string; sessionHash: string };
        if (binding.subject !== subject || typeof binding.sessionHash !== 'string') return undefined;
        return parent(subject, binding.sessionHash);
      } catch { return undefined; }
    },
    cleanup(): { models: number; bindings: number } {
      return cleanupIdentityStorage(database, now());
    },
  };
}
