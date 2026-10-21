import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { startCredentialBackend } from './helpers/credentialBackend.mjs';

// On the real server: a revoked session is refused by the very next session
// check and paywall, the hp_viewer tag it carried is named in the guest answer
// (so the browser forgets the remembered viewer), and nothing about another
// account can be read or ended.
const sha = value => createHash('sha256').update(value).digest('hex');
const tag = token => createHash('sha256').update(`hearthpulse-viewer-session:${token}`).digest('base64url').slice(0, 22);
const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

test('revoking a session ends it at once for the session check and the paywall', async () => {
  const backend = await startCredentialBackend();
  try {
    const now = new Date().toISOString();
    const addUser = id => backend.database.prepare(`INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at)
      VALUES (?, ?, ?, 'unused', 'user', ?, ?)`).run(id, `${id}@example.test`, id, now, now);
    const addSession = (token, userId) => backend.database.prepare(`INSERT INTO sessions (token_hash, user_id, email, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)`).run(sha(token), userId, `${userId}@example.test`, Date.now() + 3_600_000, now);
    addUser('reader');
    addUser('stranger');
    backend.database.prepare(`INSERT INTO manual_subscription_grants (user_id, active, entitlements_json, granted_by, granted_at, updated_at)
      VALUES ('reader', 1, '{"standard":true}', 'integration-test', ?, ?)`).run(now, now);
    for (const token of ['a1', 'a2', 'a3']) addSession(token, 'reader');
    addSession('s1', 'stranger');

    const as = (token, headers = {}) => ({ Cookie: `manacost_auth_token=${token}; hp_viewer=${tag(token)}`, 'User-Agent': CHROME_WINDOWS, ...headers });
    const get = (path, token, headers) => fetch(`${backend.origin}${path}`, { headers: as(token, headers), signal: AbortSignal.timeout(8000) });
    const post = (path, token, headers = { 'X-CSRF-Request': '1', Origin: backend.origin }) =>
      fetch(`${backend.origin}${path}`, { method: 'POST', headers: as(token, headers), signal: AbortSignal.timeout(8000) });
    const me = async token => (await get('/api/auth/me', token)).json();

    assert.equal((await me('a2')).user?.id, 'reader');
    assert.notEqual((await get('/api/standard/matchups', 'a2')).status, 401, 'the paywall admits the live session');
    const row = backend.database.prepare('SELECT last_seen_at, client, region FROM sessions WHERE token_hash = ?').get(sha('a2'));
    assert.ok(row.last_seen_at > 0, 'the session check records activity');
    assert.equal(row.client, 'Chrome · Windows');
    const columns = backend.database.prepare('PRAGMA table_info(sessions)').all().map(column => column.name);
    assert.ok(!columns.some(name => /ip|agent/i.test(name)), `no IP address or full user agent column: ${columns}`);

    const listed = await (await get('/api/account/sessions', 'a1')).json();
    assert.equal(listed.sessions.length, 3);
    assert.deepEqual(listed.sessions.filter(item => item.current).length, 1);
    assert.equal((await get('/api/account/sessions', 's1')).status, 200);
    const strangerIds = (await (await get('/api/account/sessions', 's1')).json()).sessions.map(item => item.id);
    assert.equal(strangerIds.length, 1, 'another account sees only its own session');
    assert.ok(!listed.sessions.some(item => strangerIds.includes(item.id)));

    // The site's CSRF rule guards revocation like every other cookie mutation.
    const a2Id = listed.sessions.find(item => !item.current && item.device === 'Chrome · Windows' && item.lastActiveAt)?.id;
    assert.ok(a2Id, 'the session that was just active is listed with its device');
    assert.equal((await post(`/api/account/sessions/${a2Id}/revoke`, 'a1', { Origin: backend.origin })).status, 403);
    assert.equal((await post(`/api/account/sessions/${a2Id}/revoke`, 'a1', { 'X-CSRF-Request': '1', Origin: 'https://evil.example' })).status, 403);
    // Express routes ignore case and a trailing slash: no spelling skips the CSRF rule.
    const crossSite = { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' };
    for (const [method, path] of [
      ['POST', '/API/account/SESSIONS/revoke-others'],
      ['POST', '/Api/Account/Sessions/revoke-others/'],
      ['POST', `/api/ACCOUNT/sessions/${a2Id}/REVOKE/`],
      ['POST', '/API/AUTH/LOGOUT'],
      ['PATCH', '/Api/Auth/Profile/'],
    ]) {
      const response = await fetch(`${backend.origin}${path}`, { method, headers: { ...as('a1', crossSite), 'Content-Type': 'application/json' },
        body: method === 'PATCH' ? '{"country":"Россия"}' : undefined, signal: AbortSignal.timeout(8000) });
      assert.equal(response.status, 403, `${method} ${path}`);
    }
    for (const token of ['a1', 'a2', 'a3']) assert.equal((await me(token)).user?.id, 'reader', `${token} survives cross-site attempts`);
    assert.equal((await post(`/api/account/sessions/${a2Id}/revoke`, 's1')).status, 404, 'another account cannot end it');
    assert.equal((await me('a2')).user?.id, 'reader');

    assert.equal((await post(`/api/account/sessions/${a2Id}/revoke`, 'a1')).status, 200);
    const guest = await me('a2');
    assert.equal(guest.user, null, 'the next session check answers as a guest');
    assert.equal(guest.viewerSession, tag('a2'), 'and names the tag it carried, so the browser forgets the remembered viewer');
    assert.equal((await get('/api/standard/matchups', 'a2')).status, 401, 'the paywall refuses the ended session');
    assert.equal((await get('/api/subscription/status', 'a2')).status, 401);
    assert.equal((await me('a1')).user?.id, 'reader', 'the session that ended it stays signed in');

    // A session check that extends the session rewrites the store; activity survives it.
    backend.database.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(Date.now() + 60_000, sha('a1'));
    await me('a1');
    assert.equal(backend.database.prepare('SELECT client FROM sessions WHERE token_hash = ?').get(sha('a1')).client, 'Chrome · Windows');

    assert.deepEqual(await (await post('/api/account/sessions/revoke-others', 'a1')).json(), { revoked: 1 });
    assert.equal((await me('a3')).user, null);
    assert.equal((await me('a1')).user?.id, 'reader');
    assert.equal((await me('s1')).user?.id, 'stranger', 'another account keeps its sessions');
  } finally {
    await backend.close();
  }
});
