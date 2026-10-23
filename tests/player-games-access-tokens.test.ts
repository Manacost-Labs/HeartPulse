import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createBrowserIdentityAccessTokens } from '../server/app/browserIdentityAccessTokens.js';
import { createBrowserIdentityRuntime } from '../server/modules/browserIdentity/public.js';

const database = new DatabaseSync(':memory:');
database.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, blocked_at TEXT);
  CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER);
  INSERT INTO users VALUES ('player', 'Игрок', NULL);`);
const sessionHash = createHash('sha256').update(randomBytes(32).toString('hex')).digest('hex');
database.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(sessionHash, 'player', Date.now() + 600_000);

const runtime = createBrowserIdentityRuntime({
  issuer: 'https://identity.example.test/identity', deployment: 'test', database, encryptionKey: randomBytes(32),
  authCookieName: '__Host-hp_test_login', trustedProxy: true, cookieKeys: [randomBytes(32).toString('base64url')],
  signingKeys: { keys: [{ ...generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'jwk' }),
    kid: 'test', use: 'sig', alg: 'RS256' }] },
  clients: [{ id: 'test-reader', secret: randomBytes(32).toString('base64url'),
    redirectUri: 'https://manacost.example.test/reader-auth/callback' }],
});
const accessTokens = createBrowserIdentityAccessTokens(runtime);
const { provider } = runtime;

async function issue(options: { expiresIn?: number } = {}) {
  const grant = new provider.Grant({ accountId: 'player', clientId: 'test-reader' });
  grant.addOIDCScope('openid profile');
  const grantId = await grant.save();
  runtime.bindings.bind(grantId, 'player', sessionHash);
  const client = await provider.Client.find('test-reader');
  const token = new provider.AccessToken({ accountId: 'player', client, grantId, scope: 'openid profile', gty: 'authorization_code' });
  // The lifetime is a runtime model field that the provider typings leave out.
  if (options.expiresIn !== undefined) (token as unknown as { expiresIn: number }).expiresIn = options.expiresIn;
  return token.save();
}

const value = await issue();
assert.deepEqual(await accessTokens.verify(value), { userId: 'player', clientId: 'test-reader', scopes: ['openid', 'profile'] });
assert.equal(await accessTokens.verify('not-a-token'), null);
assert.equal(await accessTokens.verify(`${value}x`), null);

const shortLived = await issue({ expiresIn: 1 });
await new Promise(resolve => setTimeout(resolve, 2_100));
assert.equal(await accessTokens.verify(shortLived), null, 'an expired token is refused');

// Ending the parent browser session revokes the token, as it does for the provider.
database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sessionHash);
assert.equal(await accessTokens.verify(value), null);

console.log('player games access tokens: ok');
