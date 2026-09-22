import type { DatabaseSync } from 'node:sqlite';
import type { AdapterPayload } from 'oidc-provider';
import { createPayloadCipher, hashIdentifier } from './encryption.js';
import { initializeIdentityStorage } from './schema.js';

type LookupColumn = 'id_hash' | 'uid_hash' | 'user_code_hash';
type StoredPayload = { id_hash: string; payload: string; consumed: number | null };

export class IdentityStorage {
  private readonly cipher: ReturnType<typeof createPayloadCipher>;

  constructor(
    private readonly database: DatabaseSync,
    key: Uint8Array,
    private readonly now: () => number,
  ) {
    this.cipher = createPayloadCipher(key);
    initializeIdentityStorage(database);
  }

  upsert(model: string, id: string, payload: AdapterPayload, expiresIn?: number): void {
    if (expiresIn !== undefined && (!Number.isSafeInteger(expiresIn) || expiresIn <= 0)) {
      throw new Error('Invalid identity lifetime');
    }
    const idHash = hashIdentifier(id);
    const hashOptional = (value?: string) => value ? hashIdentifier(value) : null;
    // oidc-provider Grant payloads have no grantId: their own ID identifies the family.
    const grantHash = model === 'Grant' ? idHash : hashOptional(payload.grantId);
    const result = this.database.prepare(`
      INSERT INTO browser_identity_models
        (model, id_hash, payload, expires_at, grant_hash, uid_hash, user_code_hash)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS
        (SELECT 1 FROM browser_identity_revoked_grants WHERE grant_hash = ?)
      ON CONFLICT(model, id_hash) DO UPDATE SET payload = excluded.payload,
        expires_at = excluded.expires_at, grant_hash = excluded.grant_hash,
        uid_hash = excluded.uid_hash, user_code_hash = excluded.user_code_hash
    `).run(model, idHash, this.cipher.encrypt(payload, `${model}:${idHash}`),
      expiresIn === undefined ? null : this.now() + expiresIn, grantHash,
      hashOptional(payload.uid), hashOptional(payload.userCode), grantHash);
    if (result.changes !== 1) throw new Error('Identity grant revoked');
  }

  find(model: string, column: LookupColumn, value: string): AdapterPayload | undefined {
    const row = this.database.prepare(`
      SELECT id_hash, payload, consumed FROM browser_identity_models
      WHERE model = ? AND ${column} = ? AND (expires_at IS NULL OR expires_at > ?)
      AND NOT EXISTS (SELECT 1 FROM browser_identity_revoked_grants r
        WHERE r.grant_hash = browser_identity_models.grant_hash)
    `).get(model, hashIdentifier(value), this.now()) as StoredPayload | undefined;
    if (!row) return undefined;
    const payload = this.cipher.decrypt(row.payload, `${model}:${row.id_hash}`) as AdapterPayload;
    return row.consumed === null ? payload : { ...payload, consumed: row.consumed };
  }

  consume(model: string, id: string): boolean {
    const now = this.now();
    const result = this.database.prepare(`
      UPDATE browser_identity_models SET consumed = ?
      WHERE model = ? AND id_hash = ? AND consumed IS NULL
      AND (expires_at IS NULL OR expires_at > ?)
      AND NOT EXISTS (SELECT 1 FROM browser_identity_revoked_grants r
        WHERE r.grant_hash = browser_identity_models.grant_hash)
    `).run(now, model, hashIdentifier(id), now);
    if (result.changes === 1) return true;
    // Both protocol requests may have read an unconsumed snapshot before the CAS.
    const replay = this.database.prepare(`SELECT grant_hash FROM browser_identity_models
      WHERE model = ? AND id_hash = ? AND consumed IS NOT NULL`)
      .get(model, hashIdentifier(id)) as { grant_hash: string | null } | undefined;
    if (replay?.grant_hash) this.revokeGrantHash(replay.grant_hash);
    return false;
  }

  destroy(model: string, id: string): void {
    if (model === 'Grant') {
      this.revokeGrant(id);
      return;
    }
    this.database.prepare('DELETE FROM browser_identity_models WHERE model = ? AND id_hash = ?')
      .run(model, hashIdentifier(id));
  }

  revokeGrant(grantId: string): void {
    this.revokeGrantHash(hashIdentifier(grantId));
  }

  private revokeGrantHash(hash: string): void {
    // Persist denial before deletion: even a crash cannot resurrect grant tokens.
    this.database.prepare(`INSERT OR IGNORE INTO browser_identity_revoked_grants
      (grant_hash, revoked_at) VALUES (?, ?)`).run(hash, this.now());
    this.database.prepare('DELETE FROM browser_identity_models WHERE grant_hash = ?').run(hash);
  }
}
