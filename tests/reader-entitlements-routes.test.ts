import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import express from 'express';
import { createReaderEntitlementsRouter, normalizeBoostyPaymentDates } from '../server/modules/readerEntitlements/public.js';
import { writeSubscriptionCacheRow } from '../server/modules/subscription/public.js';
import { registerBrowserIdentity } from '../server/app/registerBrowserIdentity.js';

const client = { id: 'manacost-reader-staging', secret: 's'.repeat(43), redirectUri: 'https://test.hs-manacost.ru/reader-auth/callback' };
const now = Date.parse('2026-09-08T12:00:00.000Z');

function fixture() {
  const database = new DatabaseSync(':memory:');
  database.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, blocked_at TEXT);
    CREATE TABLE subscriptions (user_id TEXT PRIMARY KEY, has_access INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'none', message TEXT NOT NULL DEFAULT '', checked_at TEXT, stale INTEGER, boosty_json TEXT, telegram_json TEXT, patreon_json TEXT, updated_at TEXT NOT NULL DEFAULT '');
    CREATE TABLE manual_subscription_grants (user_id TEXT PRIMARY KEY, active INTEGER);
    INSERT INTO users VALUES ('boosty-paid', NULL), ('patreon-paid', NULL), ('telegram-only', NULL), ('stale-paid', NULL), ('expired-paid', NULL),
      ('boosty-expired-patreon-paid', NULL), ('invalid-date-paid', NULL), ('invalid-date-patreon-paid', NULL),
      ('malformed-paid', NULL), ('blocked-paid', '2026-09-01'), ('free', NULL);
  `);
  const insert = database.prepare('INSERT INTO subscriptions (user_id, checked_at, stale, boosty_json, telegram_json, patreon_json) VALUES (?, ?, ?, ?, ?, ?)');
  const fresh = new Date(now - 60_000).toISOString();
  const producerDates = normalizeBoostyPaymentDates({ dates: { nextPaymentAt: new Date(now + 10 * 60_000).toISOString() } });
  assert.ok('dates' in producerDates);
  writeSubscriptionCacheRow(database, { userId: 'boosty-paid', hasAccess: true, source: 'boosty', message: '', checkedAt: fresh, stale: false,
    boosty: { configured: true, checked: true, found: true, hasAccess: true, entitlements: { arena: true }, ...producerDates },
    telegram: {}, patreon: {}, updatedAt: fresh });
  const stored = database.prepare("SELECT boosty_json FROM subscriptions WHERE user_id = 'boosty-paid'").get() as { boosty_json: string };
  assert.deepEqual(JSON.parse(stored.boosty_json).dates, producerDates.dates);
  insert.run('patreon-paid', fresh, 1, JSON.stringify({ checked: false, stale: true, providerUnavailable: true }), '{}', JSON.stringify({ configured: true, checked: true, connected: true, hasAccess: true, tierTitles: ['Алмаз'], highestTierAmountCents: 499, entitlements: { guidesArchive: true } }));
  insert.run('telegram-only', fresh, 0, '{}', JSON.stringify({ hasAccess: true }), '{}');
  insert.run('stale-paid', new Date(now - 30 * 60_000 - 1).toISOString(), 0, JSON.stringify({ checked: true, found: true, hasAccess: true, entitlements: { arena: true } }), '{}', '{}');
  insert.run('expired-paid', fresh, 0, JSON.stringify({ checked: true, found: true, hasAccess: true, entitlements: { arena: true }, dates: { nextPaymentAt: new Date(now - 1).toISOString() } }), '{}', '{}');
  insert.run('boosty-expired-patreon-paid', fresh, 0, JSON.stringify({ checked: true, found: true, hasAccess: true, entitlements: { arena: true }, dates: { nextPaymentAt: new Date(now - 1).toISOString() } }), '{}', JSON.stringify({ configured: true, checked: true, connected: true, hasAccess: true, tierTitles: ['Алмаз'], highestTierAmountCents: 499, entitlements: { guidesArchive: true } }));
  insert.run('invalid-date-paid', fresh, 0, JSON.stringify({ checked: true, found: true, hasAccess: true, entitlements: { arena: true }, dates: { nextPaymentAt: null } }), '{}', '{}');
  insert.run('invalid-date-patreon-paid', fresh, 0, JSON.stringify({ checked: true, found: true, hasAccess: true, entitlements: { arena: true }, dates: { nextPaymentAt: null } }), '{}', JSON.stringify({ configured: true, checked: true, connected: true, hasAccess: true, entitlements: { guidesArchive: true } }));
  insert.run('malformed-paid', fresh, 0, JSON.stringify({ checked: true, found: true, hasAccess: 'yes', entitlements: { arena: 'yes', invented: true } }), '{}', '{}');
  insert.run('blocked-paid', fresh, 0, JSON.stringify({ checked: true, found: true, hasAccess: true, entitlements: { arena: true } }), '{}', '{}');
  insert.run('free', fresh, 0, '{}', '{}', '{}');
  database.exec("INSERT INTO manual_subscription_grants VALUES ('free', 1)");
  const app = express();
  app.use('/identity', createReaderEntitlementsRouter({ database, clients: [client], allowedSources: ['boosty', 'patreon'], now: () => now }));
  const server = createServer(app);
  return { database, server };
}

async function withServer(run: (origin: string) => Promise<void>) {
  const { database, server } = fixture();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test port');
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); database.close(); }
}

const basic = (secret = client.secret, id = client.id) => `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;

test('Boosty producer preserves only its documented parseable next payment date', () => {
  const date = '2026-09-08T12:10:00.000Z';
  assert.deepEqual(normalizeBoostyPaymentDates({ dates: { nextPaymentAt: date } }), { dates: { nextPaymentAt: date } });
  for (const value of [123, true, 'not-a-date', {}, null]) {
    assert.deepEqual(normalizeBoostyPaymentDates({ dates: { nextPaymentAt: value } }), { dates: { nextPaymentAt: null } });
  }
  assert.deepEqual(normalizeBoostyPaymentDates({}), {});
  const productionComposition = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
  assert.match(productionComposition, /const paymentDates = normalizeBoostyPaymentDates\(subscriber\);/);
  assert.match(productionComposition, /\.\.\.paymentDates,/);
  assert.match(productionComposition, /writeSubscriptionCacheRow\(db\(\),/);
});

test('confidential batch endpoint proves only fresh Boosty or Patreon payment', async () => withServer(async origin => {
  const subjects = ['boosty-paid', 'patreon-paid', 'telegram-only', 'stale-paid', 'expired-paid', 'boosty-expired-patreon-paid',
    'invalid-date-paid', 'invalid-date-patreon-paid', 'malformed-paid', 'blocked-paid', 'free', 'missing'];
  const response = await fetch(`${origin}/identity/reader-entitlements`, { method: 'POST', headers: { authorization: basic(), 'content-type': 'application/json' }, body: JSON.stringify({ subjects }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.deepEqual((await response.json()).entitlements.map((item: { subject: string; paid: boolean }) => [item.subject, item.paid]), [
    ['boosty-paid', true], ['patreon-paid', true], ['telegram-only', false], ['stale-paid', false],
    ['expired-paid', false], ['boosty-expired-patreon-paid', true], ['invalid-date-paid', false],
    ['invalid-date-patreon-paid', true], ['malformed-paid', false],
    ['blocked-paid', false], ['free', false], ['missing', false],
  ]);
}));

test('confidential batch endpoint rejects unauthenticated, wrong-client and cross-site requests', async () => withServer(async origin => {
  const body = JSON.stringify({ subjects: ['boosty-paid'] });
  for (const authorization of [undefined, basic('wrong'), basic(client.secret, 'other-reader')]) {
    const response = await fetch(`${origin}/identity/reader-entitlements`, { method: 'POST', headers: { ...(authorization ? { authorization } : {}), 'content-type': 'application/json' }, body });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  }
  const oversized = await fetch(`${origin}/identity/reader-entitlements`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(5000) });
  assert.equal(oversized.status, 401, 'authentication must run before parsing an untrusted body');
  for (const headers of [{ origin: 'https://test.hs-manacost.ru' }, { 'sec-fetch-site': 'cross-site' }]) {
    const response = await fetch(`${origin}/identity/reader-entitlements`, { method: 'POST', headers: { authorization: basic(), 'content-type': 'application/json', ...headers }, body });
    assert.equal(response.status, 403);
  }
}));

test('failed authentication cannot consume the confidential client quota', async () => withServer(async origin => {
  const body = JSON.stringify({ subjects: ['boosty-paid'] });
  for (let attempt = 0; attempt < 121; attempt += 1) {
    const rejected = await fetch(`${origin}/identity/reader-entitlements`, { method: 'POST', headers: { authorization: basic(`wrong-${attempt}`), 'content-type': 'application/json' }, body });
    assert.equal(rejected.status, 401);
  }
  const accepted = await fetch(`${origin}/identity/reader-entitlements`, { method: 'POST', headers: { authorization: basic(), 'content-type': 'application/json' }, body });
  assert.equal(accepted.status, 200);
}));

test('confidential batch endpoint enforces exact bounded unique subjects and body size', async () => withServer(async origin => {
  for (const body of [JSON.stringify({}), JSON.stringify({ subjects: [] }), JSON.stringify({ subjects: ['x', 'x'] }),
    JSON.stringify({ subjects: Array.from({ length: 21 }, (_, index) => `u-${index}`) }), JSON.stringify({ subjects: ['bad subject'] })]) {
    const response = await fetch(`${origin}/identity/reader-entitlements`, { method: 'POST', headers: { authorization: basic(), 'content-type': 'application/json' }, body });
    assert.equal(response.status, 400);
  }
  const response = await fetch(`${origin}/identity/reader-entitlements`, { method: 'POST', headers: { authorization: basic(), 'content-type': 'application/json' }, body: JSON.stringify({ subjects: ['x'.repeat(5000)] }) });
  assert.equal(response.status, 413);
  const wrongType = await fetch(`${origin}/identity/reader-entitlements`, { method: 'POST', headers: { authorization: basic(), 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(wrongType.status, 415); assert.deepEqual(await wrongType.json(), { error: 'invalid_request' });
  const badEncoding = await fetch(`${origin}/identity/reader-entitlements`, { method: 'POST', headers: { authorization: basic(), 'content-type': 'application/json', 'content-encoding': 'gzip' }, body: '{}' });
  assert.equal(badEncoding.status, 400); assert.deepEqual(await badEncoding.json(), { error: 'invalid_request' });
}));

test('reader-only middleware leaves discovery and login routes untouched', async () => {
  const database = new DatabaseSync(':memory:');
  const app = express(); app.use('/identity', createReaderEntitlementsRouter({ database, clients: [client] }));
  app.get('/identity/.well-known/openid-configuration', (_request, response) => response.json({ issuer: 'unchanged' }));
  app.get('/identity/auth', (_request, response) => response.redirect(303, '/identity/interaction/test'));
  const server = createServer(app); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test port');
  try {
    for (const path of ['/.well-known/openid-configuration', '/auth']) {
      const response = await fetch(`http://127.0.0.1:${address.port}/identity${path}`, { redirect: 'manual' });
      assert.equal(response.headers.get('cache-control'), null); assert.equal(response.headers.get('ratelimit-policy'), null);
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); database.close(); }
});

test('cache read failure returns a generic fail-closed response', async () => {
  const database = new DatabaseSync(':memory:');
  const app = express(); app.use('/identity', createReaderEntitlementsRouter({ database, clients: [client], now: () => now }));
  const server = createServer(app); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test port');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/identity/reader-entitlements`, { method: 'POST', headers: { authorization: basic(), 'content-type': 'application/json' }, body: JSON.stringify({ subjects: ['reader'] }) });
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'unavailable' });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); database.close(); }
});

test('reader entitlement route is absent while its independent feature flag is off', () => {
  const app = express(); let opened = false;
  const result = registerBrowserIdentity({ app, getDatabase: () => { opened = true; throw new Error('must stay closed'); }, authCookieName: 'login', environment: {} });
  assert.equal(result, undefined); assert.equal(opened, false);
});
