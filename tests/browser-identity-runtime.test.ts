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
    authCookieName: '__Host-hp_test_login', legacyAuthCookieName: 'hp_test_login', trustedProxy: true, cookieKeys: [randomBytes(32).toString('base64url')],
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

test('eligible reader offline consent issues a refresh token capped at its original 30-day deadline', async () => {
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
    clients: [{ id: 'manacost-reader-staging', secret, redirectUri }] });
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
    const params = new URLSearchParams({ client_id: 'manacost-reader-staging', redirect_uri: redirectUri, response_type: 'code',
      scope: 'openid profile offline_access', prompt: 'login consent', state: 'state', nonce: 'nonce',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    let response = await request(`${issuer}/auth?${params}`);
    const interactionUrl = new URL(response.headers.get('location')!, issuer);
    response = await request(interactionUrl);
    cookies.set('hp_test_login', token);
    response = await request(interactionUrl);
    const consent = await response.text();
    assert.match(consent, /до 30 дней с момента согласия/, 'the consent view discloses the remembered-login limit');
    const csrf = consent.match(/name="csrf" value="([^"]+)"/)![1];
    response = await request(interactionUrl, { method: 'POST', headers: { origin: 'https://identity.example.test' },
      body: new URLSearchParams({ csrf, decision: 'continue' }) });
    response = await request(response.headers.get('location')!);
    const callback = new URL(response.headers.get('location')!);
    const basic = `Basic ${Buffer.from(`manacost-reader-staging:${secret}`).toString('base64')}`;
    response = await request(`${issuer}/token`, { method: 'POST', headers: { authorization: basic },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: callback.searchParams.get('code')!, redirect_uri: redirectUri, code_verifier: verifier }) });
    const first = await response.json();
    assert.equal(typeof first.refresh_token, 'string');
    const original = await runtime.provider.RefreshToken.find(first.refresh_token);
    assert.ok(original);
    response = await request(`${issuer}/token`, { method: 'POST', headers: { authorization: basic },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: first.refresh_token }) });
    const rotated = await response.json();
    const replacement = await runtime.provider.RefreshToken.find(rotated.refresh_token);
    assert.ok(replacement);
    assert.equal(replacement.exp, original.exp, 'rotation must retain the original absolute deadline');
    database.prepare("UPDATE browser_identity_models SET expires_at = 0 WHERE model = 'Grant'").run();
    response = await request(`${issuer}/token`, { method: 'POST', headers: { authorization: basic },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rotated.refresh_token }) });
    assert.equal((await response.json()).error, 'invalid_grant', 'the expired grant blocks refresh before another rotation');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); database.close();
  }
});

test('ineligible offline_access request ends in one explicit callback error instead of another consent loop', async () => {
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
      scope: 'openid profile offline_access', prompt: 'login consent', state: 'state', nonce: 'nonce',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    let response = await request(`${issuer}/auth?${params}`);
    const interactionUrl = new URL(response.headers.get('location')!, issuer);
    await request(interactionUrl);
    cookies.set('hp_test_login', token);
    response = await request(interactionUrl);
    const csrf = (await response.text()).match(/name="csrf" value="([^"]+)"/)![1];
    response = await request(interactionUrl, { method: 'POST', headers: { origin: 'https://identity.example.test' },
      body: new URLSearchParams({ csrf, decision: 'continue' }) });
    assert.equal(response.status, 303);
    response = await request(response.headers.get('location')!);
    const callback = new URL(response.headers.get('location')!);
    assert.equal(callback.searchParams.get('error'), 'invalid_scope');
    assert.equal(callback.searchParams.get('code'), null);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); database.close();
  }
});

// --- Consent page branding and the guest-readable client context (E20 S1) ---

const DEFAULT_HEADERS = {
  'cache-control': 'private, no-store',
  pragma: 'no-cache',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

async function startConsentHarness(config: {
  deployment: 'production' | 'test'; issuer: string; clientId: string; redirectUri: string; userName?: string;
  stagingBridge?: boolean;
}) {
  const secret = randomBytes(32).toString('base64url');
  const token = randomBytes(32).toString('hex');
  const database = new DatabaseSync(':memory:');
  database.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, blocked_at TEXT);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER);`);
  database.prepare('INSERT INTO users VALUES (?, ?, NULL)').run('reader', config.userName ?? 'Читатель');
  database.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(createHash('sha256').update(token).digest('hex'), 'reader', Date.now() + 600_000);
  // The production bridge registers the production reader first and the staging reader second.
  const clients = [{ id: config.clientId, secret, redirectUri: config.redirectUri }];
  if (config.stagingBridge) clients.unshift({ id: 'manacost-reader-production', secret, redirectUri: PRODUCTION_CALLBACK });
  const runtime = createBrowserIdentityRuntime({ issuer: config.issuer, deployment: config.deployment, database,
    encryptionKey: randomBytes(32), authCookieName: 'hp_test_login', trustedProxy: true, cookieKeys: [randomBytes(32).toString('base64url')],
    signingKeys: { keys: [{ ...generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'jwk' }), kid: 'test', use: 'sig', alg: 'RS256' }] },
    allowStagingClient: config.stagingBridge,
    clients });
  const app = express(); app.set('trust proxy', 'loopback'); app.use('/identity', runtime.router);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing port');
  const issuerUrl = new URL(config.issuer);
  const cookies = new Map<string, string>();
  const setCookies: string[] = [];
  const request = async (url: URL | string, init: RequestInit = {}) => {
    const path = new URL(url, config.issuer);
    const result = await fetch(`http://127.0.0.1:${address.port}${path.pathname}${path.search}`, { ...init, redirect: 'manual',
      headers: { host: issuerUrl.host, 'x-forwarded-proto': 'https', cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), ...init.headers } });
    for (const cookie of result.headers.getSetCookie()) {
      setCookies.push(cookie);
      const [pair] = cookie.split(';'); const index = pair.indexOf('='); cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return result;
  };
  const startInteraction = async () => {
    const verifier = randomBytes(32).toString('base64url');
    const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code',
      scope: 'openid profile', prompt: 'login consent', state: 'state', nonce: 'nonce',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    const response = await request(`${config.issuer}/auth?${params}`);
    return new URL(response.headers.get('location')!, config.issuer);
  };
  const login = () => cookies.set('hp_test_login', token);
  const logout = () => cookies.delete('hp_test_login');
  const close = async () => { await new Promise<void>(resolve => server.close(() => resolve())); database.close(); };
  return { request, startInteraction, login, logout, close, database, cookies, setCookies, origin: issuerUrl.origin };
}

const visibleText = (html: string) => html.replace(/<style>[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '');

const PRODUCTION_ISSUER = 'https://hearthpulse.net/identity';
const PRODUCTION_CALLBACK = 'https://hs-manacost.ru/reader-auth/callback';
const STAGING_CALLBACK = 'https://test.hs-manacost.ru/reader-auth/callback';

test('consent page for the production Manacost reader names hearthpulse.net and the destination site', async () => {
  const harness = await startConsentHarness({ deployment: 'production', issuer: PRODUCTION_ISSUER,
    clientId: 'manacost-reader-production', redirectUri: PRODUCTION_CALLBACK, userName: '<script>alert(1)</script>' });
  try {
    const interactionUrl = await harness.startInteraction();
    harness.login();
    const response = await harness.request(interactionUrl);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<html lang="ru">/);
    assert.ok(html.includes('Вход через hearthpulse.net'));
    assert.ok(visibleText(html).includes('в Манакост (hs-manacost.ru)'));
    assert.ok(html.includes('<svg'), 'the HearthPulse mark is inline because the page CSP blocks every image');
    assert.ok(html.includes('Пароль, почта и платёжные данные не передаются'));
    assert.ok(!html.includes('<script>'), 'the profile name must be escaped');
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!/(?:src|href)=|@import|url\((?!#)/i.test(html), 'the page loads no external or embedded resource');
    assert.ok(html.includes('name="decision" value="continue"') && html.includes('name="decision" value="deny"'));
  } finally { await harness.close(); }
});

test('consent page for the staging Manacost reader shows the test host', async () => {
  const harness = await startConsentHarness({ deployment: 'test', issuer: 'https://identity.example.test/identity',
    clientId: 'manacost-reader-staging', redirectUri: STAGING_CALLBACK });
  try {
    const interactionUrl = await harness.startInteraction();
    harness.login();
    const html = await (await harness.request(interactionUrl)).text();
    assert.ok(html.includes('Вход через hearthpulse.net'));
    assert.ok(visibleText(html).includes('в Манакост (тест) (test.hs-manacost.ru)'));
  } finally { await harness.close(); }
});

test('consent page for a client without a reserved presentation falls back to its callback host', async () => {
  const harness = await startConsentHarness({ deployment: 'test', issuer: 'https://identity.example.test/identity',
    clientId: 'test-reader', redirectUri: 'https://partner.example.test/reader-auth/callback' });
  try {
    const interactionUrl = await harness.startInteraction();
    harness.login();
    const html = await (await harness.request(interactionUrl)).text();
    assert.ok(visibleText(html).includes('в partner.example.test (partner.example.test)'));
    assert.ok(!html.includes('Манакост'));
  } finally { await harness.close(); }
});

test('consent, decision and expired-login responses keep their exact security headers', async () => {
  const harness = await startConsentHarness({ deployment: 'production', issuer: PRODUCTION_ISSUER,
    clientId: 'manacost-reader-production', redirectUri: PRODUCTION_CALLBACK });
  try {
    const headersOf = (response: Response) => Object.fromEntries(Object.keys(DEFAULT_HEADERS)
      .map(name => [name, response.headers.get(name)]));
    const interactionUrl = await harness.startInteraction();
    harness.login();
    let response = await harness.request(interactionUrl);
    assert.deepEqual(headersOf(response), { ...DEFAULT_HEADERS, 'referrer-policy': 'same-origin',
      'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${PRODUCTION_CALLBACK}; frame-ancestors 'none'; base-uri 'none'` });
    const csrf = (await response.text()).match(/name="csrf" value="([^"]+)"/)![1];
    response = await harness.request(interactionUrl, { method: 'POST', headers: { origin: 'https://evil.test' },
      body: new URLSearchParams({ csrf, decision: 'continue' }) });
    assert.equal(response.status, 403);
    assert.deepEqual(headersOf(response), DEFAULT_HEADERS);
    response = await harness.request(interactionUrl, { method: 'POST', headers: { origin: harness.origin },
      body: new URLSearchParams({ csrf, decision: 'deny' }) });
    assert.equal(response.status, 303);
    assert.deepEqual(headersOf(response), DEFAULT_HEADERS);
    harness.cookies.clear();
    response = await harness.request(interactionUrl);
    assert.equal(response.status, 400);
    assert.deepEqual(headersOf(response), DEFAULT_HEADERS);
    assert.equal(await response.text(), 'Вход истёк. Вернитесь на сайт, с которого начали вход, и начните заново.');
  } finally { await harness.close(); }
});

test('denying and continuing from the branded page still end in the expected callback outcome', async () => {
  for (const decision of ['deny', 'continue'] as const) {
    const harness = await startConsentHarness({ deployment: 'production', issuer: PRODUCTION_ISSUER,
      clientId: 'manacost-reader-production', redirectUri: PRODUCTION_CALLBACK });
    try {
      const interactionUrl = await harness.startInteraction();
      harness.login();
      const csrf = (await (await harness.request(interactionUrl)).text()).match(/name="csrf" value="([^"]+)"/)![1];
      let response = await harness.request(interactionUrl, { method: 'POST', headers: { origin: harness.origin },
        body: new URLSearchParams({ csrf, decision }) });
      assert.equal(response.status, 303);
      response = await harness.request(response.headers.get('location')!);
      const callback = new URL(response.headers.get('location')!);
      assert.equal(callback.origin, 'https://hs-manacost.ru');
      if (decision === 'deny') assert.equal(callback.searchParams.get('error'), 'access_denied');
      else assert.ok(callback.searchParams.get('code'));
    } finally { await harness.close(); }
  }
});

test('GET interaction client context returns only name and host for a live interaction of this browser', async () => {
  const harness = await startConsentHarness({ deployment: 'production', issuer: PRODUCTION_ISSUER,
    clientId: 'manacost-reader-production', redirectUri: PRODUCTION_CALLBACK });
  try {
    const interactionUrl = await harness.startInteraction();
    const contextUrl = `${interactionUrl.pathname}/client`;
    // The guest has no HearthPulse session yet: this is exactly when the login card needs the context.
    const response = await harness.request(contextUrl);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type')!, /^application\/json/);
    assert.equal(await response.text(), '{"name":"Манакост","host":"hs-manacost.ru"}');
    for (const name of ['cache-control', 'pragma', 'referrer-policy', 'x-robots-tag', 'x-content-type-options', 'content-security-policy']) {
      assert.equal(response.headers.get(name), DEFAULT_HEADERS[name as keyof typeof DEFAULT_HEADERS], name);
    }
    assert.deepEqual([...response.headers.keys()].filter(name => name.startsWith('access-control-')), [], 'no CORS');
    assert.equal(response.headers.get('set-cookie'), null);
    // A logged-in user gets the very same body, with no account data mixed in.
    harness.login();
    assert.equal(await (await harness.request(contextUrl)).text(), '{"name":"Манакост","host":"hs-manacost.ru"}');
    const interactionCookie = harness.setCookies.find(cookie => cookie.startsWith('__Secure-hp_interaction=') && !cookie.startsWith('__Secure-hp_interaction=;'));
    const path = interactionCookie?.match(/;\s*path=([^;]+)/i)?.[1];
    assert.ok(path && contextUrl.startsWith(`${path}/`), 'the interaction cookie must reach the client sub-path');
  } finally { await harness.close(); }
});

test('with the staging bridge both clients are named by their own interaction', async () => {
  const harness = await startConsentHarness({ deployment: 'production', issuer: PRODUCTION_ISSUER, stagingBridge: true,
    clientId: 'manacost-reader-staging', redirectUri: STAGING_CALLBACK });
  try {
    const interactionUrl = await harness.startInteraction();
    assert.equal(await (await harness.request(`${interactionUrl.pathname}/client`)).text(),
      '{"name":"Манакост (тест)","host":"test.hs-manacost.ru"}');
    harness.login();
    assert.ok(visibleText(await (await harness.request(interactionUrl)).text()).includes('в Манакост (тест) (test.hs-manacost.ru)'));
  } finally { await harness.close(); }
});

test('consent page escapes every special character of the profile name and names a nameless reader', async () => {
  const special = await startConsentHarness({ deployment: 'production', issuer: PRODUCTION_ISSUER,
    clientId: 'manacost-reader-production', redirectUri: PRODUCTION_CALLBACK, userName: `A&B "q" 'z' <i>` });
  try {
    const interactionUrl = await special.startInteraction();
    special.login();
    const html = await (await special.request(interactionUrl)).text();
    assert.ok(html.includes('<strong>A&amp;B &quot;q&quot; &#39;z&#39; &lt;i&gt;</strong>'));
    assert.ok(!html.includes('до 30 дней'), 'a plain sign-in does not mention remembered login');
  } finally { await special.close(); }
  const nameless = await startConsentHarness({ deployment: 'production', issuer: PRODUCTION_ISSUER,
    clientId: 'manacost-reader-production', redirectUri: PRODUCTION_CALLBACK, userName: '' });
  try {
    const interactionUrl = await nameless.startInteraction();
    nameless.login();
    assert.ok((await (await nameless.request(interactionUrl)).text()).includes('Вы вошли как <strong>Читатель</strong>'));
  } finally { await nameless.close(); }
});

test('client context of the staging and unreserved clients', async () => {
  const staging = await startConsentHarness({ deployment: 'test', issuer: 'https://identity.example.test/identity',
    clientId: 'manacost-reader-staging', redirectUri: STAGING_CALLBACK });
  try {
    const interactionUrl = await staging.startInteraction();
    assert.equal(await (await staging.request(`${interactionUrl.pathname}/client`)).text(),
      '{"name":"Манакост (тест)","host":"test.hs-manacost.ru"}');
  } finally { await staging.close(); }
  const other = await startConsentHarness({ deployment: 'test', issuer: 'https://identity.example.test/identity',
    clientId: 'test-reader', redirectUri: 'https://partner.example.test/reader-auth/callback' });
  try {
    const interactionUrl = await other.startInteraction();
    assert.equal(await (await other.request(`${interactionUrl.pathname}/client`)).text(),
      '{"name":"partner.example.test","host":"partner.example.test"}');
  } finally { await other.close(); }
});

test('client context is hidden without this browser live interaction', async () => {
  const harness = await startConsentHarness({ deployment: 'production', issuer: PRODUCTION_ISSUER,
    clientId: 'manacost-reader-production', redirectUri: PRODUCTION_CALLBACK });
  try {
    const interactionUrl = await harness.startInteraction();
    const contextUrl = `${interactionUrl.pathname}/client`;
    const interactionCookies = new Map(harness.cookies);
    const expectEmpty404 = async (response: Response, label: string) => {
      assert.equal(response.status, 404, label);
      assert.equal(await response.text(), '', label);
      assert.equal(response.headers.get('content-type'), null, label);
      assert.equal(response.headers.get('cache-control'), 'private, no-store', label);
    };
    // Another interaction id with this browser's valid cookie.
    await expectEmpty404(await harness.request(`${interactionUrl.pathname}x/client`), 'foreign uid');
    await expectEmpty404(await harness.request('/identity/interaction/AAAAAAAAAAAAAAAAAAAAA/client'), 'unknown uid');
    // No cookie at all.
    harness.cookies.clear();
    await expectEmpty404(await harness.request(contextUrl), 'no cookie');
    // Methods other than GET.
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      for (const [key, value] of interactionCookies) harness.cookies.set(key, value);
      const response = await harness.request(contextUrl, { method, headers: { origin: harness.origin } });
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.get('allow'), 'GET', method);
      assert.ok(!(await response.text()).includes('Манакост'), method);
    }
    // Expired interaction.
    for (const [key, value] of interactionCookies) harness.cookies.set(key, value);
    assert.equal((await harness.request(contextUrl)).status, 200);
    harness.database.prepare("UPDATE browser_identity_models SET expires_at = 0 WHERE model = 'Interaction'").run();
    await expectEmpty404(await harness.request(contextUrl), 'expired interaction');
  } finally { await harness.close(); }
});

test('client context disappears once the interaction is finished', async () => {
  const harness = await startConsentHarness({ deployment: 'production', issuer: PRODUCTION_ISSUER,
    clientId: 'manacost-reader-production', redirectUri: PRODUCTION_CALLBACK });
  try {
    const interactionUrl = await harness.startInteraction();
    const contextUrl = `${interactionUrl.pathname}/client`;
    harness.login();
    const csrf = (await (await harness.request(interactionUrl)).text()).match(/name="csrf" value="([^"]+)"/)![1];
    let response = await harness.request(interactionUrl, { method: 'POST', headers: { origin: harness.origin },
      body: new URLSearchParams({ csrf, decision: 'continue' }) });
    assert.equal(response.status, 303);
    const resume = response.headers.get('location')!;
    response = await harness.request(contextUrl);
    assert.equal(response.status, 404, 'a decided interaction no longer needs a client card');
    assert.equal(await response.text(), '');
    assert.equal((await harness.request(resume)).status, 303);
    response = await harness.request(contextUrl);
    assert.equal(response.status, 404, 'a consumed interaction stays hidden');
    assert.equal(await response.text(), '');
  } finally { await harness.close(); }
});
