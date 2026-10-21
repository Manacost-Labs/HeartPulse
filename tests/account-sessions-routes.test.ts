import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { csrfRequestAllowed } from '../server/csrf.js';
import {
  accountSessionViews,
  createAccountSessionsRouter,
  createSqliteAccountSessionStore,
  ensureAccountSessionColumns,
  publicSessionId,
  recordSessionActivity,
  sessionActivityToRecord,
  summarizeUserAgent,
  SESSION_ACTIVITY_INTERVAL_MS,
} from '../server/modules/accountSessions/public.js';

const compositionRoot = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
assert.match(compositionRoot, /from '\.\/modules\/accountSessions\/public\.js';/, 'the composition root enters through public.ts');
assert.match(compositionRoot, /sessions: accountSessionStore, csrfAllowed: cookieMutationCsrfAllowed/,
  'revocations use the site CSRF rule');
assert.match(compositionRoot, /recordSessionActivity\(accountSessionStore, req, activeSession\.session\)/,
  'every authenticated request may record activity');

// The user agent is reduced to browser and system; the full string is never kept.
const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
assert.equal(summarizeUserAgent(CHROME_WINDOWS), 'Chrome · Windows');
assert.equal(summarizeUserAgent(SAFARI_IPHONE), 'Safari · iPhone');
assert.equal(summarizeUserAgent('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 YaBrowser/24.10 Mobile Safari/537.36'), 'Яндекс Браузер · Android');
assert.equal(summarizeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'), 'Firefox · Linux');
assert.equal(summarizeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36 Edg/130.0'), 'Edge · macOS');
assert.equal(summarizeUserAgent('curl/8.0'), '');
assert.equal(summarizeUserAgent(undefined), '');

// Activity is written at most once per interval, unless the browser or region changed.
const seen = { lastSeenAt: 1_000_000, client: 'Chrome · Windows', region: 'russia' };
const request = { userAgent: CHROME_WINDOWS, region: 'russia' };
assert.equal(sessionActivityToRecord(seen, request, 1_000_000 + SESSION_ACTIVITY_INTERVAL_MS - 1), null);
assert.deepEqual(sessionActivityToRecord(seen, request, 1_000_000 + SESSION_ACTIVITY_INTERVAL_MS),
  { lastSeenAt: 1_000_000 + SESSION_ACTIVITY_INTERVAL_MS, client: 'Chrome · Windows', region: 'russia' });
assert.deepEqual(sessionActivityToRecord(seen, { ...request, region: 'europe' }, 1_000_001)?.region, 'europe');
assert.deepEqual(sessionActivityToRecord({ lastSeenAt: null, client: '', region: '' }, { userAgent: '', region: 'mars' }, 5),
  { lastSeenAt: 5, client: '', region: '' }, 'an unknown region header is not stored');
assert.equal(sessionActivityToRecord(seen, { userAgent: undefined, region: undefined }, 1_000_001), null,
  'a request without the edge headers keeps what is known and writes nothing within the interval');

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT NOT NULL,
  expires_at INTEGER NOT NULL, created_at TEXT NOT NULL)`);
ensureAccountSessionColumns(db);
ensureAccountSessionColumns(db);
assert.deepEqual((db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>).map(row => row.name),
  ['token_hash', 'user_id', 'email', 'expires_at', 'created_at', 'last_seen_at', 'client', 'region'], 'the migration is additive and repeatable');

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const insert = db.prepare('INSERT INTO sessions (token_hash, user_id, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)');
const future = Date.now() + 3_600_000;
const seed = () => {
  db.exec('DELETE FROM sessions');
  insert.run(hash('maria-laptop'), 'maria', 'maria@example.test', future, '2026-10-01T10:00:00.000Z');
  insert.run(hash('maria-phone'), 'maria', 'maria@example.test', future, '2026-10-02T10:00:00.000Z');
  insert.run(hash('maria-old'), 'maria', 'maria@example.test', Date.now() - 1, '2026-09-01T10:00:00.000Z');
  insert.run(hash('ivan-desktop'), 'ivan', 'ivan@example.test', future, '2026-10-03T10:00:00.000Z');
};
seed();
const store = createSqliteAccountSessionStore(() => db);
store.recordActivity(hash('maria-phone'), { lastSeenAt: Date.parse('2026-10-21T10:00:00.000Z'), client: 'Safari · iPhone', region: 'europe' });

// The recorder writes only when due, mirrors the write on the loaded session and never throws.
const loaded: { tokenHash: string; lastSeenAt?: number | null; client?: string; region?: string } = { tokenHash: hash('maria-laptop') };
const headers = { 'user-agent': CHROME_WINDOWS, 'x-arena-client-region': 'russia' };
recordSessionActivity(store, { headers }, loaded, 2_000_000);
assert.deepEqual(loaded, { tokenHash: hash('maria-laptop'), lastSeenAt: 2_000_000, client: 'Chrome · Windows', region: 'russia' });
let writes = 0;
recordSessionActivity({ recordActivity: () => { writes += 1; } }, { headers }, loaded, 2_000_000 + 60_000);
assert.equal(writes, 0, 'no write within the interval');
recordSessionActivity({ recordActivity: () => { throw new Error('SQLITE_BUSY'); } }, { headers }, loaded, 2_000_000 + SESSION_ACTIVITY_INTERVAL_MS);
db.prepare('UPDATE sessions SET last_seen_at = NULL, client = \'\', region = \'\'').run();
store.recordActivity(hash('maria-phone'), { lastSeenAt: Date.parse('2026-10-21T10:00:00.000Z'), client: 'Safari · iPhone', region: 'europe' });

const views = accountSessionViews(store.list('maria', Date.now()), hash('maria-laptop'));
assert.deepEqual(views.map(view => [view.current, view.device, view.place]),
  [[true, '', null], [false, 'Safari · iPhone', 'Европа']], 'this session first; an expired one is not listed');
assert.equal(views[1].lastActiveAt, '2026-10-21T10:00:00.000Z');
assert.equal(views[1].id, publicSessionId(hash('maria-phone')));
assert.match(views[1].id, /^[A-Za-z0-9_-]{22}$/);

const tokens: Record<string, string> = { maria: 'maria-laptop', 'maria-phone': 'maria-phone', ivan: 'ivan-desktop' };
const live = (token: string) => db.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?').get(hash(token), Date.now()) as
  { user_id: string } | undefined;
let failStore = false;
const app = express();
app.use('/api', createAccountSessionsRouter({
  currentSession: req => {
    const token = tokens[String(req.headers['x-test-session'] ?? '')];
    const row = token ? live(token) : undefined;
    return row ? { userId: row.user_id, tokenHash: hash(token) } : null;
  },
  sessions: {
    ...store,
    list: (userId, now) => {
      if (failStore) throw new Error('sqlite secret detail');
      return store.list(userId, now);
    },
  },
  csrfAllowed: req => csrfRequestAllowed({
    method: req.method, path: req.originalUrl.split('?')[0], authorization: req.headers.authorization,
    authCookiePresent: Boolean(req.headers.cookie), csrfHeader: req.headers['x-csrf-request'], origin: req.headers.origin,
    referer: req.headers.referer, secFetchSite: req.headers['sec-fetch-site'], appUrl: 'https://hearthpulse.net',
  }),
  mutationLimiter: (_req, _res, next) => next(),
  setPrivateNoStore: response => {
    response.set('Cache-Control', 'no-store');
    response.vary('Cookie');
  },
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const SAME_ORIGIN = { Cookie: 'manacost_auth_token=x', 'X-CSRF-Request': '1', Origin: 'https://hearthpulse.net', 'Sec-Fetch-Site': 'same-origin' };
const call = (path: string, session: string | null, { method = 'GET', headers = SAME_ORIGIN as Record<string, string> } = {}) =>
  fetch(`http://127.0.0.1:${address.port}/api${path}`, {
    method, headers: { ...headers, ...session ? { 'X-Test-Session': session } : {} },
  });
const listFor = async (session: string) => (await (await call('/account/sessions', session)).json()) as
  { sessions: Array<{ id: string; current: boolean }> };

try {
  const guest = await call('/account/sessions', null);
  assert.equal(guest.status, 401);
  assert.equal(guest.headers.get('cache-control'), 'no-store');

  const own = await call('/account/sessions', 'maria');
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('cache-control'), 'no-store');
  assert.match(own.headers.get('vary') ?? '', /Cookie/);
  const body = await own.text();
  for (const secret of [hash('maria-laptop'), hash('maria-phone'), hash('ivan-desktop'), 'ivan'])
    assert.doesNotMatch(body, new RegExp(secret), 'no token hash and no other account leaves the server');
  const phoneId = publicSessionId(hash('maria-phone'));
  const ivanId = publicSessionId(hash('ivan-desktop'));
  const laptopId = publicSessionId(hash('maria-laptop'));
  assert.deepEqual((JSON.parse(body) as { sessions: Array<{ id: string }> }).sessions.map(item => item.id), [laptopId, phoneId]);

  // Another account's session is unknown, never ended.
  assert.equal((await call(`/account/sessions/${ivanId}/revoke`, 'maria', { method: 'POST' })).status, 404);
  assert.ok(live('ivan-desktop'));
  assert.equal((await call('/account/sessions/not-an-id/revoke', 'maria', { method: 'POST' })).status, 404);
  // This browser signs out with «Выйти», which also clears its cookies.
  assert.equal((await call(`/account/sessions/${laptopId}/revoke`, 'maria', { method: 'POST' })).status, 409);
  assert.ok(live('maria-laptop'));

  // A cross-site form or a request without the CSRF header changes nothing.
  for (const headers of [
    { Cookie: 'manacost_auth_token=x', Origin: 'https://hearthpulse.net', 'Sec-Fetch-Site': 'same-origin' },
    { ...SAME_ORIGIN, Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' },
  ]) {
    assert.equal((await call(`/account/sessions/${phoneId}/revoke`, 'maria', { method: 'POST', headers })).status, 403);
    assert.equal((await call('/account/sessions/revoke-others', 'maria', { method: 'POST', headers })).status, 403);
  }
  assert.ok(live('maria-phone'));
  assert.equal((await call(`/account/sessions/${phoneId}/revoke`, null, { method: 'POST' })).status, 401);
  assert.equal((await call(`/account/sessions/${phoneId}/revoke`, 'maria', { method: 'GET' })).status, 404, 'revocation is POST only');

  const revoked = await call(`/account/sessions/${phoneId}/revoke`, 'maria', { method: 'POST' });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.headers.get('cache-control'), 'no-store');
  assert.equal(live('maria-phone'), undefined, 'the session row is gone at once');
  assert.equal((await call('/account/sessions', 'maria-phone')).status, 401, 'the ended session is refused on its next request');
  assert.deepEqual((await listFor('maria')).sessions.map(item => item.id), [laptopId]);

  // «Sign out everywhere else» keeps this session and touches no other account.
  seed();
  const others = await call('/account/sessions/revoke-others', 'maria', { method: 'POST' });
  assert.deepEqual(await others.json(), { revoked: 2 }, 'the phone and the already expired row');
  assert.ok(live('maria-laptop'));
  assert.equal(live('maria-phone'), undefined);
  assert.ok(live('ivan-desktop'));
  assert.equal((await call('/account/sessions/revoke-others', 'ivan', { method: 'POST' })).status, 200);
  assert.ok(live('ivan-desktop'), 'the caller\'s own session survives');

  // Revocations have their own limit per account (the built-in limiter).
  const limited = express();
  limited.use('/api', createAccountSessionsRouter({
    currentSession: () => ({ userId: 'maria', tokenHash: hash('maria-laptop') }),
    sessions: { ...store, revokeOthers: () => 0 },
    csrfAllowed: () => true,
    setPrivateNoStore: () => {},
  }));
  const limitedServer = limited.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => limitedServer.once('listening', resolve));
  const limitedPort = (limitedServer.address() as { port: number }).port;
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 21; attempt += 1) {
    statuses.push((await fetch(`http://127.0.0.1:${limitedPort}/api/account/sessions/revoke-others`, { method: 'POST' })).status);
  }
  limitedServer.close();
  assert.deepEqual([statuses[19], statuses[20]], [200, 429]);

  failStore = true;
  const failed = await call('/account/sessions', 'maria');
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /secret/);
} finally {
  server.close();
}
console.log('account sessions routes: ok');
