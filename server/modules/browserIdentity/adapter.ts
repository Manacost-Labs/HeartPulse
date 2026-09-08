import type { DatabaseSync } from 'node:sqlite';
import { errors, type AdapterPayload } from 'oidc-provider';
import { IdentityStorage } from './storage.js';

class IdentityAdapter {
  constructor(private readonly storage: IdentityStorage, private readonly model: string) {}

  async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
    this.storage.upsert(this.model, id, payload, expiresIn);
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    return this.storage.find(this.model, 'id_hash', id);
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    return this.storage.find(this.model, 'uid_hash', uid);
  }

  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    return this.storage.find(this.model, 'user_code_hash', userCode);
  }

  async consume(id: string): Promise<void> {
    if (!this.storage.consume(this.model, id)) {
      throw new errors.InvalidGrant('Identity artifact unavailable or already consumed');
    }
  }
  async destroy(id: string): Promise<void> { this.storage.destroy(this.model, id); }
  async revokeByGrantId(grantId: string): Promise<void> { this.storage.revokeGrant(grantId); }
}

export function createIdentityAdapter(
  database: DatabaseSync,
  encryptionKey: Uint8Array,
  now: () => number = () => Math.floor(Date.now() / 1000),
) {
  const storage = new IdentityStorage(database, encryptionKey, now);
  return class extends IdentityAdapter {
    constructor(model: string) { super(storage, model); }
  };
}
