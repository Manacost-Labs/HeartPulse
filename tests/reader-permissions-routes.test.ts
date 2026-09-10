import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import express from 'express';
import { createReaderPermissionsRouter } from '../server/modules/readerPermissions/public.js';
import { registerBrowserIdentity } from '../server/app/registerBrowserIdentity.js';

const client = { id: 'manacost-reader-staging', secret: 's'.repeat(43), redirectUri: 'https://test.hs-manacost.ru/reader-auth/callback' };
const basic = (secret = client.secret, id = client.id) => `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;

function validIdentityEnvironment(clients: unknown): NodeJS.ProcessEnv {
  const signingKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'jwk' });
  return {
    BROWSER_IDENTITY_ENABLED: '1', BROWSER_IDENTITY_DEPLOYMENT: 'production', BROWSER_IDENTITY_ISSUER: 'https://hearthpulse.net/identity',
    BROWSER_IDENTITY_ENCRYPTION_KEY: randomBytes(32).toString('base64url'), BROWSER_IDENTITY_COOKIE_KEYS: JSON.stringify(['k'.repeat(43)]),
    BROWSER_IDENTITY_JWKS: JSON.stringify({ keys: [signingKey] }), BROWSER_IDENTITY_CLIENTS: JSON.stringify(clients),
    BROWSER_IDENTITY_ALLOW_STAGING_CLIENT: '1', READER_PERMISSIONS_ENABLED: '1',
  };
}

function fixture() {
  const database = new DatabaseSync(':memory:');
  database.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, role TEXT, blocked_at TEXT);
    INSERT INTO users VALUES ('administrator', 'admin', NULL), ('member', 'user', NULL), ('demoted', 'user', NULL), ('blocked-admin', 'admin', '2026-09-01');`);
  const app = express();
  app.use('/identity', createReaderPermissionsRouter({ database, clients: [client] }));
  const server = createServer(app);
  return { database, server };
}

async function withServer(run: (origin: string, database: DatabaseSync) => Promise<void>) {
  const { database, server } = fixture();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test port');
  try { await run(`http://127.0.0.1:${address.port}`, database); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); database.close(); }
}

test('returns fresh unblocked admin permission in request order and never caches it', async () => withServer(async (origin, database) => {
  const request = async () => fetch(`${origin}/identity/reader-permissions`, { method: 'POST', headers: { authorization: basic(), 'content-type': 'application/json' }, body: JSON.stringify({ subjects: ['member', 'administrator', 'missing', 'blocked-admin'] }) });
  const first = await request();
  assert.equal(first.status, 200);
  assert.match(first.headers.get('cache-control') ?? '', /no-store/);
  assert.deepEqual(await first.json(), { permissions: [
    { subject: 'member', canModerateComments: false }, { subject: 'administrator', canModerateComments: true },
    { subject: 'missing', canModerateComments: false }, { subject: 'blocked-admin', canModerateComments: false },
  ] });
  database.exec("UPDATE users SET role = 'user' WHERE id = 'administrator'");
  const demoted = await request();
  assert.deepEqual(await demoted.json(), { permissions: [
    { subject: 'member', canModerateComments: false }, { subject: 'administrator', canModerateComments: false },
    { subject: 'missing', canModerateComments: false }, { subject: 'blocked-admin', canModerateComments: false },
  ] });
}));

test('rejects browser, unauthorized, malformed and duplicate inputs before permission lookup', async () => withServer(async origin => {
  const post = (body: string, headers: Record<string, string> = {}) => fetch(`${origin}/identity/reader-permissions`, { method: 'POST', headers: { authorization: basic(), 'content-type': 'application/json', ...headers }, body });
  for (const headers of [{ origin: 'https://test.hs-manacost.ru' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await post(JSON.stringify({ subjects: ['administrator'] }), headers)).status, 403);
  assert.equal((await fetch(`${origin}/identity/reader-permissions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(5000) })).status, 401);
  assert.equal((await post(JSON.stringify({ subjects: ['administrator', 'administrator'] }))).status, 400);
  assert.equal((await post(JSON.stringify({ subjects: ['bad subject'] }))).status, 400);
  assert.equal((await post(JSON.stringify({ subjects: [] }))).status, 400);
  assert.equal((await post(JSON.stringify({ subjects: ['administrator'], extra: true }))).status, 400);
  assert.equal((await post('x'.repeat(5000))).status, 413);
  assert.equal((await post('{}', { 'content-type': 'text/plain' })).status, 415);
}));

test('fails closed with 503 when the canonical users role query cannot run', async () => {
  const database = new DatabaseSync(':memory:');
  const app = express(); app.use('/identity', createReaderPermissionsRouter({ database, clients: [client] }));
  const server = createServer(app); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test port');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/identity/reader-permissions`, { method: 'POST', headers: { authorization: basic(), 'content-type': 'application/json' }, body: JSON.stringify({ subjects: ['administrator'] }) });
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'unavailable' });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); database.close(); }
});

test('authenticated client quota is bounded independently of rejected credentials', async () => withServer(async origin => {
  const body = JSON.stringify({ subjects: ['administrator'] });
  for (let attempt = 0; attempt < 125; attempt += 1) {
    const rejected = await fetch(`${origin}/identity/reader-permissions`, { method: 'POST', headers: { authorization: basic('wrong-secret'), 'content-type': 'application/json' }, body });
    assert.equal(rejected.status, 401);
    await rejected.text();
  }
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const accepted = await fetch(`${origin}/identity/reader-permissions`, { method: 'POST', headers: { authorization: basic(), 'content-type': 'application/json' }, body });
    assert.equal(accepted.status, 200);
    await accepted.text();
  }
  const limited = await fetch(`${origin}/identity/reader-permissions`, { method: 'POST', headers: { authorization: basic(), 'content-type': 'application/json' }, body });
  assert.equal(limited.status, 429);
}));

test('pre-auth ceiling bounds rejected requests and both quotas recover after the window', async context => {
  context.mock.timers.enable({ apis: ['Date', 'setInterval'] });
  await withServer(async origin => {
    const post = (secret: string) => fetch(`${origin}/identity/reader-permissions`, { method: 'POST', headers: { authorization: basic(secret), 'content-type': 'application/json' }, body: JSON.stringify({ subjects: ['administrator'] }) });
    for (let attempt = 0; attempt < 1200; attempt += 1) {
      const response = await post('wrong-secret'); assert.equal(response.status, 401); await response.text();
    }
    const preAuthLimited = await post(client.secret);
    assert.equal(preAuthLimited.status, 429); await preAuthLimited.text();
    context.mock.timers.tick(60_001);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const response = await post(client.secret); assert.equal(response.status, 200); await response.text();
    }
    const clientLimited = await post(client.secret);
    assert.equal(clientLimited.status, 429); await clientLimited.text();
    context.mock.timers.tick(60_001);
    const recovered = await post(client.secret);
    assert.equal(recovered.status, 200); await recovered.text();
  });
});

test('runtime permissions route needs both identity and permissions opt-ins', async () => {
  const productionClient = { id: 'manacost-reader', secret: 'p'.repeat(43), redirectUri: 'https://hs-manacost.ru/reader-auth/callback' };
  for (const flags of [
    { BROWSER_IDENTITY_ENABLED: undefined, READER_PERMISSIONS_ENABLED: '1', expected: 404 },
    { BROWSER_IDENTITY_ENABLED: '1', READER_PERMISSIONS_ENABLED: undefined, expected: 404 },
    { BROWSER_IDENTITY_ENABLED: '1', READER_PERMISSIONS_ENABLED: '1', expected: 200 },
  ]) {
    const database = new DatabaseSync(':memory:');
    database.exec("CREATE TABLE users (id TEXT PRIMARY KEY, role TEXT, blocked_at TEXT); CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER); INSERT INTO users VALUES ('administrator','admin',NULL);");
    const app = express();
    const environment = { ...validIdentityEnvironment([productionClient, client]), BROWSER_IDENTITY_ENABLED: flags.BROWSER_IDENTITY_ENABLED, READER_PERMISSIONS_ENABLED: flags.READER_PERMISSIONS_ENABLED };
    const runtime = registerBrowserIdentity({ app, getDatabase: () => database, authCookieName: 'login', environment });
    const server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test port');
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/identity/reader-permissions`, { method: 'POST', headers: { authorization: basic(), 'content-type': 'application/json' }, body: JSON.stringify({ subjects: ['administrator'] }) });
      assert.equal(response.status, flags.expected);
      if (flags.expected === 200) assert.deepEqual(await response.json(), { permissions: [{ subject: 'administrator', canModerateComments: true }] });
      else await response.text();
    } finally { runtime?.stop(); await new Promise<void>(resolve => server.close(() => resolve())); database.close(); }
  }
});

test('permissions flag fails closed at startup without an exact valid staging client', () => {
  const database = new DatabaseSync(':memory:');
  database.exec('CREATE TABLE users (id TEXT PRIMARY KEY, blocked_at TEXT); CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER);');
  const productionClient = { id: 'manacost-reader', secret: 'p'.repeat(43), redirectUri: 'https://hs-manacost.ru/reader-auth/callback' };
  const invalidStagingClients = [
    [productionClient],
    [productionClient, { ...client, secret: 'short' }],
    [productionClient, { ...client, redirectUri: 'https://test.hs-manacost.ru/reader-auth/callback/' }],
  ];
  try {
    for (const clients of invalidStagingClients) {
      assert.throws(() => registerBrowserIdentity({ app: express(), getDatabase: () => database, authCookieName: 'login', environment: validIdentityEnvironment(clients) }), /Browser identity configuration invalid/);
    }
  } finally { database.close(); }
});

test('permissions bridge accepts only the existing exact staging-client deployment shape', () => {
  const database = new DatabaseSync(':memory:');
  database.exec('CREATE TABLE users (id TEXT PRIMARY KEY, blocked_at TEXT); CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER);');
  const productionClient = { id: 'manacost-reader', secret: 'p'.repeat(43), redirectUri: 'https://hs-manacost.ru/reader-auth/callback' };
  try {
    const result = registerBrowserIdentity({ app: express(), getDatabase: () => database, authCookieName: 'login', environment: validIdentityEnvironment([productionClient, client]) });
    assert.ok(result); result.stop();
  } finally { database.close(); }
});
