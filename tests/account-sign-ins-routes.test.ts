import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import {
  createAccountSignInsRouter,
  createSqliteLinkedProviderReader,
  linkedSignInProviders,
} from '../server/modules/accountSignIns/public.js';

// The composition root's wiring is exercised on the real server by
// tests/auth-session-cookies-integration.test.mjs; entering through public.ts
// is enforced by scripts/check-module-boundaries.mjs.

// Storage spellings collapse to public names; unknown ones never reach the browser.
assert.deepEqual(
  linkedSignInProviders(['telegram_oidc', 'google_oauth', 'telegram', 'email', 'legacy_x', 'patreon_oauth', 'yandex_oauth', 'discord_oauth']),
  ['discord', 'email', 'google', 'patreon', 'telegram', 'yandex'],
);
assert.deepEqual(linkedSignInProviders([]), []);

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL, email TEXT, username TEXT, photo_url TEXT, verified_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(provider, provider_user_id))`);
const insert = db.prepare(`INSERT INTO identities (user_id, provider, provider_user_id, email, username, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, '2026-10-21', '2026-10-21')`);
insert.run('user-1', 'email', 'maria@example.com', 'maria@example.com', '');
insert.run('user-1', 'google_oauth', 'google-person', 'maria@gmail.example', 'maria');
insert.run('user-1', 'telegram', '424242', '', 'maria_tg');
insert.run('user-1', 'telegram_oidc', '424242', '', 'maria_tg');
insert.run('user-2', 'discord_oauth', 'another-person', '', 'other');

let failRead = false;
const reader = createSqliteLinkedProviderReader(() => db);
const app = express();
app.use('/api', createAccountSignInsRouter({
  userAuth: request => {
    const id = request.headers['x-test-user'];
    return typeof id === 'string' ? { id } : null;
  },
  readStoredProviders: userId => {
    if (failRead) throw new Error('sqlite secret detail');
    return reader(userId);
  },
  setPrivateNoStore: response => {
    response.set('Cache-Control', 'no-store');
    response.vary('Cookie');
  },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const get = (user?: string, method = 'GET') => fetch(`http://127.0.0.1:${address.port}/api/account/linked-providers`, {
  method,
  headers: user ? { 'X-Test-User': user } : {},
});

try {
  const guest = await get();
  assert.equal(guest.status, 401);
  assert.equal(guest.headers.get('cache-control'), 'no-store', 'a refusal is not cached either');

  const own = await get('user-1');
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('cache-control'), 'no-store');
  assert.match(own.headers.get('vary') ?? '', /Cookie/);
  const body = await own.text();
  assert.deepEqual(JSON.parse(body), { providers: ['email', 'google', 'telegram'] });
  for (const secret of ['google-person', '424242', 'maria@gmail.example', 'maria_tg', 'discord'])
    assert.doesNotMatch(body, new RegExp(secret), 'only provider names leave the server, and only the viewer\'s');

  assert.deepEqual(await (await get('user-3')).json(), { providers: [] });
  assert.equal((await get('user-1', 'POST')).status, 404, 'the route is read-only');

  failRead = true;
  const failed = await get('user-1');
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /secret/);
} finally {
  server.close();
}
console.log('account sign-ins routes: ok');
