import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import { DatabaseSync } from 'node:sqlite';
import express, { type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { csrfRequestAllowed } from '../server/csrf.js';
import {
  PUBLIC_PROFILE_FIELDS,
  claimNickname,
  createPublicProfileRouter,
  ensurePublicNicknameSchema,
  findPublicProfile,
  findPublicProfileIdByNickname,
  readOwnPublicIdentity,
} from '../server/modules/publicProfile/public.js';

const boundaries = JSON.parse(readFileSync(new URL('../config/module-boundaries.json', import.meta.url), 'utf8')) as {
  modules: Array<{ id: string; root: string; publicEntry: string; focusedTests: string[] }>;
};
const boundary = boundaries.modules.find(({ id }) => id === 'server.publicProfile');
assert.ok(boundary, 'server.publicProfile must be registered in the module inventory');
assert.deepEqual(boundary.focusedTests, ['npm run test:public-profiles']);
const composition = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
assert.match(composition, /createPublicProfileRouter\(\{/, 'the server must mount the public profile router');
assert.match(composition, /ensurePublicProfileSchema\(ecosystemDb,/, 'the public ID and nickname migrations must run at start');

const database = new DatabaseSync(':memory:');
database.exec(`
  CREATE TABLE users (
    id TEXT PRIMARY KEY, public_numeric_id INTEGER UNIQUE, email TEXT NOT NULL, name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user', contact_telegram TEXT, avatar_initials TEXT,
    blocked_at TEXT, password_hash TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
  );
  CREATE TABLE subscriptions (user_id TEXT PRIMARY KEY, has_access INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'none', boosty_json TEXT NOT NULL DEFAULT '{}');
  INSERT INTO users (id, public_numeric_id, email, name, role, contact_telegram, created_at, blocked_at) VALUES
    ('user_alpha', 1, 'alpha@example.com', 'alpha.discord', 'admin', '@alpha_tg', '2026-02-03T04:05:06.000Z', NULL),
    ('user_beta', 2, 'beta@example.com', 'Beta Real Name', 'user', NULL, '2026-05-01T00:00:00.000Z', NULL),
    ('user_blocked', 3, 'blocked@example.com', 'Blocked', 'user', NULL, '2026-05-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');
  INSERT INTO subscriptions (user_id, has_access, source, boosty_json) VALUES
    ('user_alpha', 1, 'boosty', '{"price":300,"levelName":"Мастер арены"}');
`);
ensurePublicNicknameSchema(database);
ensurePublicNicknameSchema(database);
assert.ok((database.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).some(column => column.name === 'nickname_key'),
  'the migration adds the nickname columns once and is idempotent');

let clock = new Date('2026-10-23T12:00:00.000Z');
const daysLater = (days: number) => { clock = new Date(clock.getTime() + days * 86_400_000); };
const APP_URL = 'https://hearthpulse.net';

function sessionUser(request: Request): { id: string } | null {
  const match = /(?:^|;\s*)hp_session=([^;]+)/.exec(String(request.headers.cookie ?? ''));
  return match ? { id: decodeURIComponent(match[1]) } : null;
}

const app = express();
app.set('trust proxy', 'loopback');
app.use(express.json());
app.use('/api', createPublicProfileRouter({
  findProfile: id => findPublicProfile(database, id),
  findPublicProfileIdByNickname: (key, now) => findPublicProfileIdByNickname(database, key, now),
  readOwnIdentity: (userId, now) => readOwnPublicIdentity(database, userId, now),
  claimNickname: (userId, nickname, now) => claimNickname(database, userId, nickname, now),
  userAuth: sessionUser,
  csrfAllowed: request => csrfRequestAllowed({
    method: request.method,
    path: request.originalUrl,
    authCookiePresent: Boolean(sessionUser(request)),
    csrfHeader: request.headers['x-csrf-request'],
    origin: request.headers.origin,
    referer: request.headers.referer,
    secFetchSite: request.headers['sec-fetch-site'],
    appUrl: APP_URL,
  }),
  setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
  publicReadLimiter: rateLimit({
    windowMs: 60_000, max: 8, standardHeaders: true, legacyHeaders: false, message: { error: 'limited' },
    keyGenerator: request => String(request.headers['x-test-client'] ?? 'anonymous'),
  }),
  nicknameChangeLimiter: rateLimit({
    windowMs: 60_000, max: 50, standardHeaders: true, legacyHeaders: false,
    keyGenerator: request => String(request.headers['x-test-client'] ?? 'anonymous'),
  }),
  now: () => clock,
}));

const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
let readerIndex = 0;

async function read(path: string, client = `reader-${readerIndex += 1}`) {
  const response = await fetch(`${base}${path}`, { headers: { 'x-test-client': client } });
  return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() as Record<string, unknown> };
}

async function setNickname(userId: string, nickname: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${base}/api/account/public-profile/nickname`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      cookie: `hp_session=${userId}`,
      'sec-fetch-site': 'same-origin',
      'x-csrf-request': '1',
      'x-test-client': `writer-${userId}`,
      ...headers,
    },
    body: JSON.stringify({ nickname }),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

try {
  // A profile is public without any opt-in and carries only the allow-listed fields.
  const alpha = await read('/api/profiles/1');
  assert.equal(alpha.status, 200);
  assert.equal(alpha.cache, 'public, max-age=60');
  const profile = alpha.body.profile as Record<string, unknown>;
  assert.deepEqual(Object.keys(profile).sort(), [...PUBLIC_PROFILE_FIELDS].sort());
  assert.deepEqual(profile, {
    publicProfileId: '1', nickname: null, displayName: 'Игрок #1', avatarInitials: '#',
    memberSince: '2026-02', isSubscriber: true,
  });
  const alphaWire = JSON.stringify(alpha.body);
  for (const secret of ['user_alpha', 'alpha@example.com', 'alpha.discord', 'admin', 'alpha_tg', 'boosty', '300', 'Мастер', '04:05']) {
    assert.equal(alphaWire.includes(secret), false, `public profile leaked ${secret}`);
  }
  assert.equal(((await read('/api/profiles/2')).body.profile as Record<string, unknown>).isSubscriber, false);

  // Missing, blocked and malformed profiles are indistinguishable.
  const notFound = await read('/api/profiles/999');
  for (const path of ['/api/profiles/3', '/api/profiles/0', '/api/profiles/01', '/api/profiles/user_alpha', '/api/profiles/2147483648']) {
    const answer = await read(path);
    assert.equal(answer.status, 404, path);
    assert.deepEqual(answer.body, notFound.body, `${path} must answer like a missing profile`);
  }

  // Nickname changes need a session, the same-origin CSRF proof and valid input.
  assert.equal((await fetch(`${base}/api/account/public-profile`)).status, 401);
  assert.equal((await setNickname('user_alpha', 'Alpha', { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await setNickname('user_alpha', 'Alpha', { 'x-csrf-request': '' })).status, 403);
  const invalid = await setNickname('user_alpha', 'ad');
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.reason, 'length');
  assert.equal((await setNickname('user_alpha', 'admin')).body.reason, 'reserved');
  assert.equal((await setNickname('user_alpha', '<b>x</b>')).body.reason, 'characters');

  const saved = await setNickname('user_alpha', 'Alpha_One');
  assert.equal(saved.status, 200);
  assert.equal(saved.body.nickname, 'Alpha_One');
  assert.equal(saved.body.profilePath, '/id/1/');
  assert.equal(saved.body.nicknameChangeAvailableAt, '2026-11-22T12:00:00.000Z');
  assert.deepEqual((await read('/api/profiles/by-nickname/alpha_one')).body, { publicProfileId: '1' },
    'nickname lookups are case-insensitive');
  assert.equal(((await read('/api/profiles/1')).body.profile as Record<string, unknown>).displayName, 'Alpha_One');

  // Uniqueness: case and look-alike variants of a held nickname are taken.
  assert.equal((await setNickname('user_beta', 'ALPHA_ONE')).status, 409);
  assert.equal((await setNickname('user_beta', 'Alpha-0ne')).status, 409);
  // A case-only change by the owner is free and keeps the cooldown untouched.
  const recased = await setNickname('user_alpha', 'alpha_one');
  assert.equal(recased.status, 200);
  assert.equal(recased.body.nicknameChangeAvailableAt, '2026-11-22T12:00:00.000Z');

  // Change limit: one real change per 30 days.
  const tooSoon = await setNickname('user_alpha', 'AlphaTwo');
  assert.equal(tooSoon.status, 429);
  assert.equal(tooSoon.body.availableAt, '2026-11-22T12:00:00.000Z');
  daysLater(31);
  assert.equal((await setNickname('user_alpha', 'AlphaTwo')).status, 200);

  // The old nickname redirects to its last owner and stays held for 90 days.
  assert.deepEqual((await read('/api/profiles/by-nickname/Alpha_One')).body, { publicProfileId: '1' });
  assert.equal((await setNickname('user_beta', 'Alpha_One')).status, 409);
  daysLater(91);
  assert.equal((await read('/api/profiles/by-nickname/Alpha_One')).status, 404);
  assert.equal((await setNickname('user_beta', 'Alpha_One')).status, 200, 'a released nickname frees up after the hold');
  assert.deepEqual((await read('/api/profiles/by-nickname/alpha_one')).body, { publicProfileId: '2' });

  // A blocked account's nickname resolves like a missing one.
  database.prepare('UPDATE users SET nickname = ?, nickname_key = ? WHERE id = ?').run('Ghost', 'ghost', 'user_blocked');
  assert.equal((await read('/api/profiles/by-nickname/ghost')).status, 404);
  assert.equal((await read('/api/profiles/by-nickname/a%20b%3Cc')).status, 404);

  // Race: the unique index decides when two writers pass the availability check together.
  const racer = new DatabaseSync(':memory:');
  racer.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, public_numeric_id INTEGER, created_at TEXT, blocked_at TEXT);
    INSERT INTO users VALUES ('a', 10, '2026-01-01', NULL), ('b', 11, '2026-01-01', NULL);`);
  ensurePublicNicknameSchema(racer);
  racer.exec(`CREATE TRIGGER sneak_in BEFORE UPDATE OF nickname_key ON users WHEN NEW.id = 'b'
    BEGIN UPDATE users SET nickname = 'Racer', nickname_key = 'racer' WHERE id = 'a'; END;`);
  assert.deepEqual(claimNickname(racer, 'b', { display: 'Racer', key: 'racer' }, clock), { status: 'taken' });
  assert.equal(racer.isTransaction, false, 'a lost race must not leave the transaction open');
  assert.equal((racer.prepare("SELECT nickname_key FROM users WHERE id = 'b'").get() as { nickname_key: unknown }).nickname_key, null);

  // Enumeration of sequential IDs is bounded per client.
  const statuses: number[] = [];
  for (let id = 1; id <= 10; id += 1) statuses.push((await read(`/api/profiles/${id}`, 'scraper')).status);
  assert.deepEqual(statuses.slice(-2), [429, 429], 'the read budget must stop a sequential scan');
  assert.equal((await read('/api/profiles/1', 'someone-else')).status, 200, 'the budget is per client');
} finally {
  server.close();
}

console.log('public profile route tests passed');
