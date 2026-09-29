import assert from 'node:assert/strict';
import express from 'express';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import { DatabaseSync } from 'node:sqlite';
import { createReferralRedirectHandler, createReferralRouter } from '../server/referralRoutes.js';
import {
  REFERRAL_ATTRIBUTION_SCHEMA_SQL,
  REFERRAL_COOKIE,
  createReferralAttributionMiddleware,
  parseReferralCookie,
} from '../server/referralAttribution.js';

const database = new DatabaseSync(':memory:');
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
  CREATE TABLE subscriptions (user_id TEXT PRIMARY KEY, has_access INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE manual_subscription_grants (user_id TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 1, expires_at TEXT);
  CREATE TABLE referral_links (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, label TEXT NOT NULL, campaign TEXT NOT NULL DEFAULT '',
    target_path TEXT NOT NULL DEFAULT '/', status TEXT NOT NULL DEFAULT 'active', created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE referral_clicks (id INTEGER PRIMARY KEY AUTOINCREMENT, referral_id TEXT NOT NULL, clicked_at TEXT NOT NULL, ip_hash TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '', referrer TEXT NOT NULL DEFAULT '', landing_path TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(referral_id) REFERENCES referral_links(id) ON DELETE CASCADE);
`);
database.exec(REFERRAL_ATTRIBUTION_SCHEMA_SQL);
database.exec(REFERRAL_ATTRIBUTION_SCHEMA_SQL); // idempotent start-up

const clickTime = new Date('2026-09-20T12:00:00.000Z');
database.prepare(`INSERT INTO referral_links (id, slug, label, created_by, created_at, updated_at) VALUES ('ref_yt', 'youtube', 'YouTube сентябрь', 'admin', ?, ?)`)
  .run(clickTime.toISOString(), clickTime.toISOString());

const users = new Map<string, { id: string; createdAt: string }>();
const addUser = (id: string, createdAt: string) => {
  database.prepare('INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)').run(id, id, createdAt);
  users.set(id, { id, createdAt });
};

const dependencies = {
  getDatabase: () => database,
  adminGuard: ((request, response, next) => (request.headers['x-test-user'] === 'admin' ? next() : response.status(401).json({}))) as express.RequestHandler,
  adminAuth: (request: express.Request) => (request.headers['x-test-user'] === 'admin' ? { id: 'admin' } : null),
  appUrl: 'https://hearthpulse.net',
  clientIp: () => '203.0.113.12',
  ipHashSalt: 'salt',
  now: () => clickTime,
};

const app = express();
app.use(express.json());
app.use('/api', createReferralAttributionMiddleware(() => ({
  getDatabase: () => database,
  userAuth: request => users.get(String(request.headers['x-user'] || '')) ?? null,
  cookieSecure: () => true,
})));
app.get('/r/:slug', createReferralRedirectHandler(dependencies));
app.use('/api', createReferralRouter(dependencies));
app.get('/api/ping', (_request, response) => response.json({ ok: true }));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}`;
const cookieOf = (response: Response) => response.headers.getSetCookie().find(value => value.startsWith(`${REFERRAL_COOKIE}=`)) ?? '';

try {
  // A click remembers the campaign for 30 days in a first-party, script-inaccessible cookie.
  const redirect = await fetch(`${base}/r/youtube`, { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  const set = cookieOf(redirect);
  assert.match(set, /^hp_ref=ref_yt\.1\.\d+;/);
  for (const attribute of ['Path=/', 'Max-Age=2592000', 'HttpOnly', 'SameSite=Lax', 'Secure']) assert.ok(set.includes(attribute), attribute);
  const cookie = set.split(';')[0];
  assert.deepEqual(parseReferralCookie(cookie.split('=')[1]), { referralId: 'ref_yt', clickId: 1, clickedAt: clickTime.getTime() });
  assert.equal(parseReferralCookie('garbage'), null);
  assert.equal(parseReferralCookie('ref.x.1'), null);

  const tracked = await fetch(`${base}/api/referrals/track/youtube`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.match(cookieOf(tracked), /^hp_ref=ref_yt\.2\./);

  // Anonymous visitors keep the cookie until they sign in.
  const anonymous = await fetch(`${base}/api/ping`, { headers: { Cookie: cookie } });
  assert.equal(cookieOf(anonymous), '');

  // An account created long before the click is not a registration from this campaign.
  addUser('old-user', '2026-01-01T00:00:00.000Z');
  const old = await fetch(`${base}/api/ping`, { headers: { Cookie: cookie, 'X-User': 'old-user' } });
  assert.match(cookieOf(old), /Max-Age=0/);
  assert.equal((database.prepare('SELECT COUNT(*) AS count FROM user_referrals').get() as { count: number }).count, 0);

  // A new account is attributed once and the cookie is cleared.
  addUser('new-user', '2026-09-20T12:03:00.000Z');
  const fresh = await fetch(`${base}/api/ping`, { headers: { Cookie: cookie, 'X-User': 'new-user' } });
  assert.equal(fresh.status, 200);
  assert.match(cookieOf(fresh), /Max-Age=0/);
  const row = database.prepare('SELECT * FROM user_referrals WHERE user_id = ?').get('new-user') as Record<string, unknown>;
  assert.equal(row.referral_id, 'ref_yt');
  assert.equal(row.click_id, 1);
  assert.equal(row.clicked_at, clickTime.toISOString());

  // A later click from another campaign does not overwrite the first attribution.
  database.prepare(`INSERT INTO referral_links (id, slug, label, created_by, created_at, updated_at) VALUES ('ref_tw', 'twitch', 'Twitch', 'admin', ?, ?)`).run(clickTime.toISOString(), clickTime.toISOString());
  await fetch(`${base}/api/ping`, { headers: { Cookie: `hp_ref=ref_tw.9.${clickTime.getTime()}`, 'X-User': 'new-user' } });
  assert.equal((database.prepare('SELECT referral_id FROM user_referrals WHERE user_id = ?').get('new-user') as { referral_id: string }).referral_id, 'ref_yt');

  // Unknown campaigns and malformed values are dropped without failing the request.
  addUser('third-user', '2026-09-20T12:05:00.000Z');
  const unknown = await fetch(`${base}/api/ping`, { headers: { Cookie: `hp_ref=ref_gone.1.${clickTime.getTime()}`, 'X-User': 'third-user' } });
  assert.equal(unknown.status, 200);
  assert.match(cookieOf(unknown), /Max-Age=0/);
  assert.equal(database.prepare('SELECT 1 FROM user_referrals WHERE user_id = ?').get('third-user'), undefined);

  // The campaign list reports registrations and people with access next to clicks.
  database.prepare('INSERT INTO subscriptions (user_id, has_access) VALUES (?, 1)').run('new-user');
  const list = await fetch(`${base}/api/admin/referrals`, { headers: { 'X-Test-User': 'admin' } });
  const payload = await list.json() as { referrals: Array<{ id: string; clicks: number; registrations: number; payingNow: number }> };
  const youtube = payload.referrals.find(item => item.id === 'ref_yt');
  assert.deepEqual({ clicks: youtube?.clicks, registrations: youtube?.registrations, payingNow: youtube?.payingNow }, { clicks: 2, registrations: 1, payingNow: 1 });
  assert.equal(payload.referrals.find(item => item.id === 'ref_tw')?.registrations, 0);
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
}

console.log('referral attribution: ok');
