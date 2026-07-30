import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const PUBLIC_API_SCOPES = ['catalog.read', 'images.read', 'statistics.read'] as const;
export type PublicApiScope = typeof PUBLIC_API_SCOPES[number];

export type ApiKeyRecord = {
  id: string;
  name: string;
  prefix: string;
  keyHash: string;
  scopes: PublicApiScope[];
  createdAt: string;
  createdBy: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type PublicApiKey = Omit<ApiKeyRecord, 'keyHash'> & {
  status: 'ACTIVE' | 'REVOKED';
};

export type ApiKeyRepository = {
  insert: (record: ApiKeyRecord) => void;
  list: () => ApiKeyRecord[];
  findByPrefix: (prefix: string) => ApiKeyRecord | null;
  revoke: (id: string, revokedAt: string) => ApiKeyRecord | null;
  touch: (id: string, lastUsedAt: string) => void;
};

type ApiKeyManagerDependencies = {
  repository: ApiKeyRepository;
  now?: () => string;
  randomId?: () => string;
  randomPrefix?: () => string;
  randomSecret?: () => string;
};

export type ApiKeyManager = {
  create: (input: { name: unknown; scopes: unknown; createdBy: string }) => {
    apiKey: string;
    key: PublicApiKey;
  };
  list: () => PublicApiKey[];
  authenticate: (apiKey: unknown, requiredScope: PublicApiScope) => PublicApiKey | null | 'FORBIDDEN';
  revoke: (id: string) => PublicApiKey | null;
};

export class ApiKeyValidationError extends Error {
  constructor() {
    super('Invalid API key request');
    this.name = 'ApiKeyValidationError';
  }
}

const API_KEY_PATTERN = /^(mca_live_[a-z0-9]{12})_([A-Za-z0-9_-]{32,})$/;
const digest = (value: string) => createHash('sha256').update(value).digest();

function publicKey(record: ApiKeyRecord): PublicApiKey {
  const { keyHash: _keyHash, ...safe } = record;
  return { ...safe, scopes: [...safe.scopes], status: safe.revokedAt ? 'REVOKED' : 'ACTIVE' };
}

function normalizeCreateInput(nameValue: unknown, scopesValue: unknown) {
  const name = String(nameValue ?? '').trim();
  if (name.length < 3 || name.length > 80) throw new ApiKeyValidationError();
  if (!Array.isArray(scopesValue) || scopesValue.length < 1 || scopesValue.length > PUBLIC_API_SCOPES.length) {
    throw new ApiKeyValidationError();
  }
  const scopes = [...new Set(scopesValue.map(value => String(value)))] as PublicApiScope[];
  if (scopes.some(scope => !PUBLIC_API_SCOPES.includes(scope))) throw new ApiKeyValidationError();
  return { name, scopes };
}

/**
 * Owns credential generation and verification without depending on Express or
 * SQLite. Raw secrets leave this boundary only in the create result.
 */
export function createApiKeyManager(dependencies: ApiKeyManagerDependencies): ApiKeyManager {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const randomId = dependencies.randomId ?? (() => `api_key_${randomBytes(12).toString('hex')}`);
  const randomPrefix = dependencies.randomPrefix ?? (() => randomBytes(6).toString('hex'));
  const randomSecret = dependencies.randomSecret ?? (() => randomBytes(32).toString('base64url'));

  return {
    create(input) {
      const normalized = normalizeCreateInput(input.name, input.scopes);
      const prefix = `mca_live_${randomPrefix()}`;
      const apiKey = `${prefix}_${randomSecret()}`;
      const record: ApiKeyRecord = {
        id: randomId(),
        name: normalized.name,
        prefix,
        keyHash: digest(apiKey).toString('hex'),
        scopes: normalized.scopes,
        createdAt: now(),
        createdBy: input.createdBy,
        lastUsedAt: null,
        revokedAt: null,
      };
      dependencies.repository.insert(record);
      return { apiKey, key: publicKey(record) };
    },

    list() {
      return dependencies.repository.list().map(publicKey);
    },

    authenticate(apiKeyValue, requiredScope) {
      const apiKey = typeof apiKeyValue === 'string' ? apiKeyValue.trim() : '';
      const match = API_KEY_PATTERN.exec(apiKey);
      if (!match) return null;
      const record = dependencies.repository.findByPrefix(match[1]);
      if (!record || record.revokedAt) return null;
      const actual = digest(apiKey);
      const expected = Buffer.from(record.keyHash, 'hex');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
      if (!record.scopes.includes(requiredScope)) return 'FORBIDDEN';
      const lastUsedAt = now();
      dependencies.repository.touch(record.id, lastUsedAt);
      return publicKey({ ...record, lastUsedAt });
    },

    revoke(id) {
      const normalizedId = String(id ?? '').trim();
      if (!/^api_key_[a-z0-9_-]{3,80}$/i.test(normalizedId)) return null;
      const record = dependencies.repository.revoke(normalizedId, now());
      return record ? publicKey(record) : null;
    },
  };
}
