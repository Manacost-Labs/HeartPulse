import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { validateIdentityOptions, type BrowserIdentityOptions } from '../server/modules/browserIdentity/configuration.js';

test('production identity accepts only the explicitly enabled exact staging client bridge', () => {
  const database = new DatabaseSync(':memory:');
  const options: BrowserIdentityOptions & { allowStagingClient?: boolean } = {
    issuer: 'https://hearthpulse.net/identity', deployment: 'production', database,
    encryptionKey: Buffer.alloc(32, 1), cookieKeys: ['x'.repeat(43)], signingKeys: { keys: [{ kty: 'RSA' }] },
    clients: [{ id: 'manacost-reader-staging', secret: 's'.repeat(43),
      redirectUri: 'https://test.hs-manacost.ru/reader-auth/callback' }],
    resolveAccount: async () => undefined,
  };
  try {
    assert.throws(() => validateIdentityOptions(options));
    assert.throws(() => validateIdentityOptions({ ...options, allowStagingClient: false }));
    assert.doesNotThrow(() => validateIdentityOptions({ ...options, allowStagingClient: true }));
    assert.throws(() => validateIdentityOptions({ ...options, allowStagingClient: true,
      clients: [{ ...options.clients[0], redirectUri: 'https://hs-manacost.ru/reader-auth/callback' }] }));
    for (const redirectUri of [
      'https://test.hs-manacost.com/reader-auth/callback',
      'https://other.hs-manacost.ru/reader-auth/callback',
      'https://test.hs-manacost.ru:8443/reader-auth/callback',
      'https://test.hs-manacost.ru/reader-auth/callback/',
    ]) assert.throws(() => validateIdentityOptions({ ...options, allowStagingClient: true,
      clients: [{ ...options.clients[0], redirectUri }] }));
    for (const id of ['manacost-reader', 'manacost-reader-production', 'other-staging']) {
      assert.throws(() => validateIdentityOptions({ ...options, allowStagingClient: true,
        clients: [{ ...options.clients[0], id }] }));
    }
    assert.throws(() => validateIdentityOptions({ ...options, allowStagingClient: true,
      deployment: 'staging', issuer: 'https://test.hearthpulse.net/identity' }));
    const productionClient = { ...options.clients[0], id: 'manacost-reader-production',
      redirectUri: 'https://hs-manacost.ru/reader-auth/callback' };
    assert.doesNotThrow(() => validateIdentityOptions({ ...options, allowStagingClient: false,
      clients: [productionClient] }));
    assert.doesNotThrow(() => validateIdentityOptions({ ...options, allowStagingClient: true,
      clients: [productionClient, options.clients[0]] }));
    for (const redirectUri of [
      'https://hs-manacost.com/reader-auth/callback',
      'https://www.hs-manacost.ru/reader-auth/callback',
      'https://hs-manacost.ru/reader-auth/callback/',
    ]) assert.throws(() => validateIdentityOptions({ ...options, allowStagingClient: false,
      clients: [{ ...productionClient, redirectUri }] }));
    assert.throws(() => validateIdentityOptions({ ...options, allowStagingClient: false,
      clients: [{ ...productionClient, id: 'manacost-reader' }] }));
  } finally { database.close(); }
});
