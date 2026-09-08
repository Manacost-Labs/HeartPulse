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
    for (const redirectUri of [
      'https://test.hs-manacost.com/reader-auth/callback',
      'https://other.hs-manacost.ru/reader-auth/callback',
      'https://test.hs-manacost.ru:8443/reader-auth/callback',
      'https://test.hs-manacost.ru/reader-auth/callback/',
    ]) assert.throws(() => validateIdentityOptions({ ...options, allowStagingClient: true,
      clients: [{ ...options.clients[0], redirectUri }] }));
    for (const id of ['manacost-reader', 'other-staging']) {
      assert.throws(() => validateIdentityOptions({ ...options, allowStagingClient: true,
        clients: [{ ...options.clients[0], id }] }));
    }
    assert.throws(() => validateIdentityOptions({ ...options, allowStagingClient: true,
      deployment: 'staging', issuer: 'https://test.hearthpulse.net/identity' }));
    assert.doesNotThrow(() => validateIdentityOptions({ ...options,
      clients: [{ ...options.clients[0], id: 'manacost-reader',
        redirectUri: 'https://hs-manacost.ru/reader-auth/callback' }] }));
  } finally { database.close(); }
});
