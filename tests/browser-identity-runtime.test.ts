import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import express from 'express';
import { createBrowserIdentityRuntime } from '../server/modules/browserIdentity/runtime.js';

test('real consent -> authorization code -> profile, then canonical parent logout revokes token', async () => {
  const issuer = 'https://identity.example.test/identity';
  const redirectUri = 'https://manacost.example.test/reader-auth/callback';
  const secret = randomBytes(32).toString('base64url');
  const token = randomBytes(32).toString('hex');
  const database = new DatabaseSync(':memory:');
  database.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, blocked_at TEXT);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER);
    INSERT INTO users VALUES ('reader', 'Читатель', NULL);`);
  database.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(createHash('sha256').update(token).digest('hex'), 'reader', Date.now() + 600_000);
  const runtime = createBrowserIdentityRuntime({ issuer, deployment: 'test', database, encryptionKey: randomBytes(32),
    authCookieName: 'hp_test_login', trustedProxy: true, cookieKeys: [randomBytes(32).toString('base64url')],
    signingKeys: { keys: [{ ...generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'jwk' }), kid: 'test', use: 'sig', alg: 'RS256' }] },
    clients: [{ id: 'test-reader', secret, redirectUri }] });
  const app = express(); app.set('trust proxy', 'loopback'); app.use('/identity', runtime.router);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing port');
  const cookies = new Map<string, string>();
  const request = async (url: URL | string, init: RequestInit = {}) => {
    const path = new URL(url, issuer);
    const result = await fetch(`http://127.0.0.1:${address.port}${path.pathname}${path.search}`, { ...init, redirect: 'manual',
      headers: { host: 'identity.example.test', 'x-forwarded-proto': 'https', cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), ...init.headers } });
    for (const cookie of result.headers.getSetCookie()) {
      const [pair] = cookie.split(';'); const index = pair.indexOf('='); cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return result;
  };
  try {
    const verifier = randomBytes(32).toString('base64url');
    const params = new URLSearchParams({ client_id: 'test-reader', redirect_uri: redirectUri, response_type: 'code',
      scope: 'openid profile', prompt: 'login consent', state: 'state', nonce: 'nonce',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    let response = await request(`${issuer}/auth?${params}`);
    assert.equal(response.status, 303);
    const interactionUrl = new URL(response.headers.get('location')!, issuer);
    response = await request(interactionUrl);
    assert.equal(response.status, 303);
    const login = new URL(response.headers.get('location')!, issuer);
    assert.equal(login.search, '?login', 'continuation must never enter root-page query logs');
    assert.match(login.hash, /^#reader_interaction=[A-Za-z0-9_-]{20,128}$/);
    cookies.set('hp_test_login', token);
    response = await request(interactionUrl);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control')!, /no-store/);
    assert.equal(response.headers.get('referrer-policy'), 'same-origin', 'native consent form must keep its same-origin POST Origin');
    assert.ok(response.headers.get('content-security-policy')?.includes(`form-action 'self' ${redirectUri};`),
      'native form redirects must allow exactly the registered reader callback');
    const csrf = (await response.text()).match(/name="csrf" value="([^"]+)"/)![1];
    const body = new URLSearchParams({ csrf, decision: 'continue' });
    response = await request(interactionUrl, { method: 'POST', headers: { origin: 'https://evil.test' }, body });
    assert.equal(response.status, 403);
    response = await request(interactionUrl, { method: 'POST', headers: { origin: 'null' }, body });
    assert.equal(response.status, 403, 'opaque-origin submissions remain denied');
    response = await request(interactionUrl, { method: 'POST', headers: { origin: 'https://identity.example.test' }, body });
    assert.equal(response.status, 303);
    response = await request(response.headers.get('location')!);
    assert.equal(response.status, 303);
    const callback = new URL(response.headers.get('location')!);
    assert.equal(callback.origin, new URL(redirectUri).origin);
    assert.equal(callback.searchParams.get('error'), null);
    assert.ok(callback.searchParams.get('code'));
    const basic = `Basic ${Buffer.from(`test-reader:${secret}`).toString('base64')}`;
    response = await request(`${issuer}/token`, { method: 'POST', headers: { authorization: basic },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: callback.searchParams.get('code')!, redirect_uri: redirectUri, code_verifier: verifier }) });
    assert.equal(response.status, 200);
    const tokens = await response.json();
    assert.equal(tokens.refresh_token, undefined);
    response = await request(`${issuer}/me`, { headers: { authorization: `Bearer ${tokens.access_token}` } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { sub: 'reader', name: 'Читатель' });
    database.exec('DELETE FROM sessions');
    response = await request(`${issuer}/token/introspection`, { method: 'POST', headers: { authorization: basic }, body: new URLSearchParams({ token: tokens.access_token }) });
    assert.deepEqual(await response.json(), { active: false });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); database.close();
  }
});
