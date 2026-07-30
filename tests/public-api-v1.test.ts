import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import express from 'express';
import { createCardImageResponder } from '../server/cardImageRoutes.js';
import {
  createAdminApiKeyRouter,
  createApiKeyManager,
  createPublicApiRouter,
  createSqliteApiKeyRepository,
  PUBLIC_API_KEYS_TABLE_SQL,
  type ApiKeyRecord,
  type ApiKeyRepository,
} from '../server/modules/publicApi/public.js';

const records = new Map<string, ApiKeyRecord>();
const repository: ApiKeyRepository = {
  insert: record => {
    records.set(record.id, { ...record, scopes: [...record.scopes] });
  },
  list: () => [...records.values()].map(record => ({ ...record, scopes: [...record.scopes] })),
  findByPrefix: prefix => {
    const record = [...records.values()].find(item => item.prefix === prefix);
    return record ? { ...record, scopes: [...record.scopes] } : null;
  },
  revoke: (id, revokedAt) => {
    const record = records.get(id);
    if (!record) return null;
    record.revokedAt ??= revokedAt;
    return { ...record, scopes: [...record.scopes] };
  },
  touch: (id, lastUsedAt) => {
    const record = records.get(id);
    if (record) record.lastUsedAt = lastUsedAt;
  },
};

let tick = 0;
let generatedKey = 0;
const now = () => new Date(Date.UTC(2026, 6, 29, 12, 0, tick++)).toISOString();
const manager = createApiKeyManager({
  repository,
  now,
  randomId: () => `api_key_test_${++generatedKey}`,
  randomPrefix: () => generatedKey === 0 ? 'abc123def456' : 'fed654cba321',
  randomSecret: () => 'test-secret-with-at-least-thirty-two-random-characters',
});

const app = express();
app.use(express.json());
const requestedImages: Array<{ cardId: string; variant: string }> = [];
let imageResolutionFails = false;
const cardImageResponder = createCardImageResponder({
  ensureImage: async (cardId, variant) => {
    requestedImages.push({ cardId, variant });
    if (imageResolutionFails) throw new Error('upstream detail must not leak');
    return { path: '/safe/card.webp', source: 'blizzard' };
  },
  isAllowedPath: path => path.startsWith('/safe/'),
  statFile: () => ({ mtimeMs: 1_234, size: 4 }),
  openStream: () => Readable.from(Buffer.from('webp')),
});
app.use('/api/v1', createPublicApiRouter({
  apiKeys: manager,
  now,
  accessTokens: {
    authenticate: (token, scopes) => {
      if (token === 'mca_access_forbidden-application-token-with-sufficient-length') {
        return 'FORBIDDEN';
      }
      return token === 'mca_access_valid-application-token-with-sufficient-length'
        && scopes.every(scope => ['catalog.read', 'images.read'].includes(scope))
        ? { userId: 'user-1' }
        : null;
    },
  },
  cardImages: { respond: cardImageResponder },
}));
app.use('/api', createAdminApiKeyRouter({
  apiKeys: manager,
  adminAuth: request => request.headers['x-admin'] === 'yes' ? { id: 'admin-1' } : null,
  adminId: admin => String((admin as { id: string }).id),
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  recordAudit: () => {},
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;

try {
  const openapi = await fetch(`${origin}/api/v1/openapi.json`);
  assert.equal(openapi.status, 200);
  const openapiPayload = await openapi.json() as Record<string, any>;
  assert.equal(openapiPayload.openapi, '3.1.0');
  assert.equal(openapiPayload.components.securitySchemes.ApiKeyAuth.name, 'X-API-Key');
  assert.equal(openapiPayload.components.securitySchemes.ApplicationBearer.scheme, 'bearer');
  assert.ok(openapiPayload.paths['/api/v1/oauth/device/code']);
  assert.ok(openapiPayload.paths['/api/v1/oauth/token']);
  assert.ok(openapiPayload.paths['/api/v1/oauth/revoke']);
  assert.ok(openapiPayload.paths['/api/v1/me']);
  assert.ok(openapiPayload.paths['/api/v1/catalog/manifest']);
  assert.ok(openapiPayload.paths['/api/v1/cards/{cardId}/images/{variant}.webp']);
  assert.ok(openapiPayload.paths['/api/admin/api-keys']);

  const unauthenticatedAdmin = await fetch(`${origin}/api/admin/api-keys`);
  assert.equal(unauthenticatedAdmin.status, 403);
  assert.equal(unauthenticatedAdmin.headers.get('cache-control'), 'private, no-store');

  const invalidCreate = await fetch(`${origin}/api/admin/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin': 'yes' },
    body: JSON.stringify({ name: 'x', scopes: ['unknown.read'] }),
  });
  assert.equal(invalidCreate.status, 400);
  assert.deepEqual(await invalidCreate.json(), {
    error: { code: 'VALIDATION_ERROR', message: 'Invalid API key request' },
  });

  const createdResponse = await fetch(`${origin}/api/admin/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin': 'yes' },
    body: JSON.stringify({ name: 'Desktop tracker', scopes: ['catalog.read', 'images.read'] }),
  });
  assert.equal(createdResponse.status, 201);
  assert.equal(createdResponse.headers.get('cache-control'), 'private, no-store');
  const created = await createdResponse.json() as {
    apiKey: string;
    key: { id: string; prefix: string; keyHash?: string; scopes: string[] };
  };
  assert.match(created.apiKey, /^mca_live_abc123def456_/);
  assert.equal(created.key.id, 'api_key_test_1');
  assert.deepEqual(created.key.scopes, ['catalog.read', 'images.read']);
  assert.equal('keyHash' in created.key, false);

  const stored = records.get(created.key.id);
  assert.ok(stored);
  assert.equal(stored.keyHash.includes('test-secret'), false);
  assert.notEqual(stored.keyHash, created.apiKey);

  const listedResponse = await fetch(`${origin}/api/admin/api-keys`, {
    headers: { 'X-Admin': 'yes' },
  });
  assert.equal(listedResponse.status, 200);
  const listed = await listedResponse.json() as { keys: Array<Record<string, unknown>> };
  assert.equal(listed.keys.length, 1);
  assert.equal('apiKey' in listed.keys[0], false);
  assert.equal('keyHash' in listed.keys[0], false);
  assert.equal(listed.keys[0].status, 'ACTIVE');

  const missingKey = await fetch(`${origin}/api/v1/catalog/manifest`);
  assert.equal(missingKey.status, 401);
  assert.deepEqual(await missingKey.json(), {
    error: { code: 'INVALID_API_KEY', message: 'API key is missing or invalid' },
  });

  const wrongKey = await fetch(`${origin}/api/v1/catalog/manifest`, {
    headers: { 'X-API-Key': `${created.apiKey.slice(0, -4)}nope` },
  });
  assert.equal(wrongKey.status, 401);

  const manifestResponse = await fetch(`${origin}/api/v1/catalog/manifest`, {
    headers: { 'X-API-Key': created.apiKey },
  });
  assert.equal(manifestResponse.status, 200);
  assert.match(String(manifestResponse.headers.get('etag')), /^"/);
  const manifest = await manifestResponse.json() as Record<string, any>;
  assert.equal(manifest.apiVersion, 'v1');
  assert.equal(manifest.schemaVersion, '2026-07-29');
  assert.ok(Array.isArray(manifest.resources));
  assert.equal(records.get(created.key.id)?.lastUsedAt, '2026-07-29T12:00:02.000Z');

  const bearerManifest = await fetch(`${origin}/api/v1/catalog/manifest`, {
    headers: {
      Authorization: 'Bearer mca_access_valid-application-token-with-sufficient-length',
    },
  });
  assert.equal(bearerManifest.status, 200);
  assert.match(String(bearerManifest.headers.get('vary')), /Authorization/);

  const invalidBearerManifest = await fetch(`${origin}/api/v1/catalog/manifest`, {
    headers: { Authorization: 'Bearer mca_access_invalid-token-with-sufficient-length' },
  });
  assert.equal(invalidBearerManifest.status, 401);
  assert.match(String(invalidBearerManifest.headers.get('www-authenticate')), /Bearer/);
  assert.deepEqual(await invalidBearerManifest.json(), {
    error: { code: 'INVALID_ACCESS_TOKEN', message: 'Access token is invalid or expired' },
  });

  const forbiddenBearerManifest = await fetch(`${origin}/api/v1/catalog/manifest`, {
    headers: { Authorization: 'Bearer mca_access_forbidden-application-token-with-sufficient-length' },
  });
  assert.equal(forbiddenBearerManifest.status, 403);
  assert.deepEqual(await forbiddenBearerManifest.json(), {
    error: { code: 'INSUFFICIENT_SCOPE', message: 'Access token does not grant this scope' },
  });

  const unchangedManifest = await fetch(`${origin}/api/v1/catalog/manifest`, {
    headers: {
      'X-API-Key': created.apiKey,
      'If-None-Match': String(manifestResponse.headers.get('etag')),
    },
  });
  assert.equal(unchangedManifest.status, 304);
  assert.equal(await unchangedManifest.text(), '');

  const missingImageKey = await fetch(`${origin}/api/v1/cards/EX1_001/images/full.webp`);
  assert.equal(missingImageKey.status, 401);

  const invalidImageRequest = await fetch(`${origin}/api/v1/cards/..%2Fsecret/images/full.webp`, {
    headers: { 'X-API-Key': created.apiKey },
  });
  assert.equal(invalidImageRequest.status, 400);
  assert.deepEqual(await invalidImageRequest.json(), {
    error: { code: 'INVALID_CARD_IMAGE_REQUEST', message: 'Card id or image variant is invalid' },
  });
  assert.deepEqual(requestedImages, []);

  const cardImage = await fetch(`${origin}/api/v1/cards/EX1_001/images/full.webp`, {
    headers: { 'X-API-Key': created.apiKey },
  });
  assert.equal(cardImage.status, 200);
  assert.equal(cardImage.headers.get('content-type'), 'image/webp');
  assert.match(String(cardImage.headers.get('etag')), /^"/);
  assert.match(String(cardImage.headers.get('cache-control')), /^private,/);
  assert.match(String(cardImage.headers.get('vary')), /X-API-Key/);
  assert.match(String(cardImage.headers.get('vary')), /Authorization/);
  assert.equal(Buffer.from(await cardImage.arrayBuffer()).toString(), 'webp');
  assert.deepEqual(requestedImages, [{ cardId: 'EX1_001', variant: 'full' }]);

  const unchangedImage = await fetch(`${origin}/api/v1/cards/EX1_001/images/full.webp`, {
    headers: {
      'X-API-Key': created.apiKey,
      'If-None-Match': String(cardImage.headers.get('etag')),
    },
  });
  assert.equal(unchangedImage.status, 304);
  assert.equal(await unchangedImage.text(), '');

  imageResolutionFails = true;
  const unavailableImage = await fetch(`${origin}/api/v1/cards/EX1_001/images/tile.webp`, {
    headers: { 'X-API-Key': created.apiKey },
  });
  assert.equal(unavailableImage.status, 502);
  assert.equal(unavailableImage.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await unavailableImage.json(), {
    error: { code: 'CARD_IMAGE_UNAVAILABLE', message: 'Card image is unavailable' },
  });
  imageResolutionFails = false;

  const catalogOnlyResponse = await fetch(`${origin}/api/admin/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin': 'yes' },
    body: JSON.stringify({ name: 'Catalog-only integration', scopes: ['catalog.read'] }),
  });
  assert.equal(catalogOnlyResponse.status, 201);
  const catalogOnly = await catalogOnlyResponse.json() as { apiKey: string };
  const forbiddenImage = await fetch(`${origin}/api/v1/cards/EX1_001/images/thumb.webp`, {
    headers: { 'X-API-Key': catalogOnly.apiKey },
  });
  assert.equal(forbiddenImage.status, 403);
  assert.deepEqual(await forbiddenImage.json(), {
    error: { code: 'INSUFFICIENT_SCOPE', message: 'API key does not grant this scope' },
  });

  const revoke = await fetch(`${origin}/api/admin/api-keys/${created.key.id}`, {
    method: 'DELETE',
    headers: { 'X-Admin': 'yes' },
  });
  assert.equal(revoke.status, 204);
  assert.ok(records.get(created.key.id)?.revokedAt);

  const revokedKey = await fetch(`${origin}/api/v1/catalog/manifest`, {
    headers: { 'X-API-Key': created.apiKey },
  });
  assert.equal(revokedKey.status, 401);
  assert.deepEqual(await revokedKey.json(), {
    error: { code: 'INVALID_API_KEY', message: 'API key is missing or invalid' },
  });

  const revokeAgain = await fetch(`${origin}/api/admin/api-keys/${created.key.id}`, {
    method: 'DELETE',
    headers: { 'X-Admin': 'yes' },
  });
  assert.equal(revokeAgain.status, 204);
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

console.log('public API v1 contract tests passed');

const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY);');
database.exec(PUBLIC_API_KEYS_TABLE_SQL);
database.prepare('INSERT INTO users (id) VALUES (?)').run('admin-1');
const sqliteRepository = createSqliteApiKeyRepository(() => database);
sqliteRepository.insert({
  id: 'api_key_sqlite_1',
  name: 'SQLite key',
  prefix: 'mca_live_0123456789ab',
  keyHash: 'ab'.repeat(32),
  scopes: ['catalog.read'],
  createdAt: '2026-07-29T12:00:00.000Z',
  createdBy: 'admin-1',
  lastUsedAt: null,
  revokedAt: null,
});
assert.equal(sqliteRepository.list()[0].name, 'SQLite key');
assert.deepEqual(sqliteRepository.findByPrefix('mca_live_0123456789ab')?.scopes, ['catalog.read']);
sqliteRepository.touch('api_key_sqlite_1', '2026-07-29T12:01:00.000Z');
assert.equal(sqliteRepository.list()[0].lastUsedAt, '2026-07-29T12:01:00.000Z');
assert.equal(
  sqliteRepository.revoke('api_key_sqlite_1', '2026-07-29T12:02:00.000Z')?.revokedAt,
  '2026-07-29T12:02:00.000Z',
);
database.close();

console.log('public API SQLite repository tests passed');
