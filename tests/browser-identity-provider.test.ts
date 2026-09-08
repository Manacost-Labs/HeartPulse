import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import express from 'express';
import { createBrowserIdentityProvider, createIdentityAdapter } from '../server/modules/browserIdentity/public.ts';

const issuer = 'https://identity.example.test/identity';
const redirectUri = 'https://manacost.example.test/reader-auth/callback';
const secret = randomBytes(32).toString('base64url');
const jwk = { ...generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'jwk' }),
  kid: 'test-key', use: 'sig', alg: 'RS256' };

function options(database: DatabaseSync) {
  return { issuer, deployment: 'test' as const, database, encryptionKey: randomBytes(32),
    cookieKeys: [randomBytes(32).toString('base64url')], signingKeys: { keys: [jwk] },
    clients: [{ id: 'manacost-test', secret, redirectUri }],
    resolveAccount: async (subject: string) => subject === 'reader' ? { subject, displayName: 'Reader' } : undefined };
}

async function fixture(isActive: () => boolean = () => true) {
  const database = new DatabaseSync(':memory:');
  const config = options(database);
  const resolve = config.resolveAccount;
  config.resolveAccount = async (subject) => isActive() ? resolve(subject) : undefined;
  config.clients.push({ id: 'another-client', secret, redirectUri: 'https://other.example.test/reader-auth/callback' });
  const provider = createBrowserIdentityProvider(config);
  // Synthetic loopback transport only; production proxy trust is a separate release gate.
  provider.proxy = true;
  const app = express();
  app.use('/identity', provider.callback());
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test port');
  const request = (path: string, init: RequestInit = {}) => fetch(`http://127.0.0.1:${address.port}/identity${path}`, {
    ...init, redirect: 'manual', headers: { 'x-forwarded-proto': 'https', ...init.headers },
  });
  const close = async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    database.close();
  };
  return { provider, request, close };
}

test('configuration rejects unsafe redirects, missing key material and mixed staging/production', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const base = options(db);
    assert.throws(() => createBrowserIdentityProvider({ ...base, cookieKeys: [] }));
    for (const redirect of ['http://manacost.test/callback', 'https://evil.test/*', `${redirectUri}#fragment`]) {
      assert.throws(() => createBrowserIdentityProvider({ ...base, clients: [{ id: 'x', secret, redirectUri: redirect }] }));
    }
    assert.throws(() => createBrowserIdentityProvider({ ...base, issuer: 'https://hearthpulse.net/identity' }));
    assert.throws(() => createBrowserIdentityProvider({ ...base, deployment: 'staging',
      issuer: 'https://hearthpulse.net:8443/identity' }));
    assert.throws(() => createBrowserIdentityProvider({ ...base, clients: [{ id: 'x', secret,
      redirectUri: 'https://hs-manacost.ru/reader-auth/callback' }] }));
  } finally { db.close(); }
});

test('discovery exposes code-only S256 and no dynamic registration', async () => {
  const f = await fixture();
  try {
    const response = await f.request('/.well-known/openid-configuration');
    assert.equal(response.status, 200);
    const discovery = await response.json();
    assert.equal(discovery.issuer, issuer);
    assert.deepEqual(discovery.response_types_supported, ['code']);
    assert.deepEqual(discovery.code_challenge_methods_supported, ['S256']);
    assert.equal(discovery.registration_endpoint, undefined);
    assert.ok(!discovery.claims_supported.includes('email'));
  } finally { await f.close(); }
});

test('authorization rejects missing PKCE, plain PKCE and an unregistered callback', async () => {
  const f = await fixture();
  try {
    const query = new URLSearchParams({ client_id: 'manacost-test', response_type: 'code',
      scope: 'openid', redirect_uri: redirectUri, state: 'state', nonce: 'nonce' });
    for (const method of ['', 'plain']) {
      const params = new URLSearchParams(query);
      if (method) { params.set('code_challenge', 'x'.repeat(43)); params.set('code_challenge_method', method); }
      const response = await f.request(`/auth?${params}`);
      assert.equal(new URL(response.headers.get('location')!).searchParams.get('error'), 'invalid_request');
    }
    query.set('redirect_uri', 'https://attacker.test/callback');
    const rejected = await f.request(`/auth?${query}`);
    assert.equal(rejected.status, 400);
    assert.equal(rejected.headers.get('location'), null);
  } finally { await f.close(); }
});

test('actual token endpoint checks verifier and makes authorization code one-use', async () => {
  const f = await fixture();
  try {
    const client = await f.provider.Client.find('manacost-test');
    const grant = new f.provider.Grant({ accountId: 'reader', clientId: 'manacost-test' });
    grant.addOIDCScope('openid profile');
    const grantId = await grant.save();
    const verifier = randomBytes(32).toString('base64url');
    const code = new f.provider.AuthorizationCode({ accountId: 'reader', client, grantId,
      scope: 'openid profile', nonce: 'nonce', redirectUri, gty: 'authorization_code', codeChallengeMethod: 'S256',
      codeChallenge: createHash('sha256').update(verifier).digest('base64url') });
    const value = await code.save();
    const exchange = (codeVerifier: string) => f.request('/token', { method: 'POST', headers: {
      authorization: `Basic ${Buffer.from(`manacost-test:${secret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    }, body: new URLSearchParams({ grant_type: 'authorization_code', code: value,
      redirect_uri: redirectUri, code_verifier: codeVerifier }).toString() });
    const wrong = await exchange(randomBytes(32).toString('base64url'));
    assert.equal(wrong.status, 400);
    assert.equal((await wrong.json()).error, 'invalid_grant');
    const valid = await exchange(verifier);
    assert.equal(valid.status, 200);
    assert.match(valid.headers.get('cache-control')!, /no-store/);
    const tokens = await valid.json();
    assert.equal(typeof tokens.id_token, 'string');
    assert.equal(typeof tokens.access_token, 'string');
    const replay = await exchange(verifier);
    assert.equal(replay.status, 400);
    assert.equal((await replay.json()).error, 'invalid_grant');
    assert.equal(await f.provider.AccessToken.find(tokens.access_token), undefined);
  } finally { await f.close(); }
});

test('refresh rotates every time and reuse revokes both replacement refresh and access tokens', async () => {
  const f = await fixture();
  try {
    const client = await f.provider.Client.find('manacost-test');
    const grant = new f.provider.Grant({ accountId: 'reader', clientId: 'manacost-test' });
    grant.addOIDCScope('openid offline_access');
    const grantId = await grant.save();
    const refresh = new f.provider.RefreshToken({ accountId: 'reader', client, grantId,
      scope: 'openid offline_access', gty: 'authorization_code' });
    const original = await refresh.save();
    const exchange = (value: string) => f.request('/token', { method: 'POST', headers: {
      authorization: `Basic ${Buffer.from(`manacost-test:${secret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: value }).toString() });
    const response = await exchange(original);
    assert.equal(response.status, 200);
    const replacement = await response.json();
    assert.equal(typeof replacement.refresh_token, 'string');
    assert.notEqual(replacement.refresh_token, original);
    assert.ok(await f.provider.AccessToken.find(replacement.access_token));
    const replay = await exchange(original);
    assert.equal(replay.status, 400);
    assert.equal((await replay.json()).error, 'invalid_grant');
    assert.equal(await f.provider.RefreshToken.find(replacement.refresh_token), undefined);
    assert.equal(await f.provider.AccessToken.find(replacement.access_token), undefined);
  } finally { await f.close(); }
});

test('actual Grant model cannot survive replay or be resurrected after direct destruction', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    const config = options(database);
    const provider = createBrowserIdentityProvider(config);
    const Adapter = createIdentityAdapter(database, config.encryptionKey);
    for (const mode of ['replay', 'destroy']) {
      const grant = new provider.Grant({ accountId: 'reader', clientId: 'manacost-test' });
      grant.addOIDCScope('openid');
      const grantId = await grant.save();
      const refresh = new Adapter('RefreshToken');
      await refresh.upsert(mode, { grantId }, 600);
      if (mode === 'destroy') await grant.destroy();
      else { await refresh.consume(mode); await assert.rejects(refresh.consume(mode)); }
      assert.equal(await provider.Grant.find(grantId), undefined);
      assert.equal(await refresh.find(mode), undefined);
      await assert.rejects(grant.save());
      await assert.rejects(refresh.upsert(`replacement-${mode}`, { grantId }, 600));
    }
  } finally { database.close(); }
});

test('access-token revocation explicitly removes the entire consent grant', async () => {
  const f = await fixture();
  try {
    const client = await f.provider.Client.find('manacost-test');
    const grant = new f.provider.Grant({ accountId: 'reader', clientId: 'manacost-test' });
    grant.addOIDCScope('openid');
    const grantId = await grant.save();
    const token = new f.provider.AccessToken({ accountId: 'reader', client, grantId,
      scope: 'openid', gty: 'authorization_code' });
    const value = await token.save();
    const response = await f.request('/token/revocation', { method: 'POST', headers: {
      authorization: `Basic ${Buffer.from(`manacost-test:${secret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    }, body: new URLSearchParams({ token: value }).toString() });
    assert.equal(response.status, 200);
    assert.equal(await f.provider.Grant.find(grantId), undefined);
    assert.equal(await f.provider.AccessToken.find(value), undefined);
    await assert.rejects(grant.save());
  } finally { await f.close(); }
});

test('introspection rejects other clients and rechecks authoritative account status', async () => {
  let active = true;
  const f = await fixture(() => active);
  try {
    const client = await f.provider.Client.find('manacost-test');
    const grant = new f.provider.Grant({ accountId: 'reader', clientId: 'manacost-test' });
    grant.addOIDCScope('openid');
    const grantId = await grant.save();
    const token = await new f.provider.AccessToken({ accountId: 'reader', client, grantId,
      scope: 'openid', gty: 'authorization_code' }).save();
    const inspect = async (id: string) => {
      const response = await f.request('/token/introspection', { method: 'POST', headers: {
        authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      }, body: new URLSearchParams({ token }).toString() });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control')!, /no-store/);
      return response.json();
    };
    assert.equal((await inspect('manacost-test')).active, true);
    assert.deepEqual(await inspect('another-client'), { active: false });
    active = false;
    assert.deepEqual(await inspect('manacost-test'), { active: false });
  } finally { await f.close(); }
});
