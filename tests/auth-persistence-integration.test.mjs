import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, scryptSync } from 'node:crypto';
import { startCredentialBackend } from './helpers/credentialBackend.mjs';

const registration = email => ({
  email, password: 'test-password-123', name: 'Integration Test',
  country: 'Россия', newsletterOptIn: true,
});

for (const completionOrder of [[0, 1], [1, 0]]) {
  test(`parallel registration preserves records with SMTP order ${completionOrder}`, async () => {
    const backend = await startCredentialBackend();
    try {
      const emails = ['first@example.com', 'second@example.com'];
      const requests = [];
      const deliveries = [];
      for (const email of emails) {
        requests.push(backend.request('/api/auth/register', registration(email)));
        deliveries.push(await backend.smtp.delivery(email));
      }
      const now = new Date().toISOString();
      backend.database.prepare(`INSERT INTO users
        (id, email, name, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run('unrelated-user', 'existing@example.com', 'Existing user', 'unused', now, now);
      backend.database.prepare(`INSERT INTO sessions
        (token_hash, user_id, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run('unrelated-session', 'unrelated-user', 'existing@example.com', Date.now() + 60_000, now);
      for (const index of completionOrder) {
        deliveries[index].accept();
        const response = await requests[index];
        assert.equal(response.status, 200, await response.text());
      }
      assert.deepEqual(
        backend.database.prepare('SELECT email FROM users ORDER BY email').all().map(r => r.email),
        ['existing@example.com', ...emails],
        'SMTP completion must not replace users created by another request',
      );
      assert.equal(backend.database.prepare('SELECT COUNT(*) AS count FROM pending_codes').get().count, 2);
      assert.equal(backend.database.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 1);
    } finally {
      await backend.close();
    }
  });
}

test('failed SMTP returns a retryable error without leaving a registered account', async () => {
  const backend = await startCredentialBackend();
  try {
    const email = 'failure@example.com';
    const request = backend.request('/api/auth/register', registration(email));
    const delivery = await backend.smtp.delivery(email);
    delivery.reject();
    const response = await request;
    assert.equal(response.status, 503);
    assert.equal(backend.database.prepare('SELECT COUNT(*) AS count FROM users WHERE email = ?').get(email).count, 0);
    assert.equal(backend.database.prepare('SELECT COUNT(*) AS count FROM pending_codes WHERE email = ?').get(email).count, 0);
    const retry = backend.request('/api/auth/register', registration(email));
    (await backend.smtp.delivery(email)).accept();
    assert.equal((await retry).status, 200, 'failed delivery must release the code cooldown');
    assert.equal(backend.database.prepare('SELECT COUNT(*) AS count FROM users WHERE email = ?').get(email).count, 1);
  } finally {
    await backend.close();
  }
});

for (const mutation of ['profile', 'block', 'password']) {
  test(`login rechecks eligibility and preserves concurrent ${mutation} edits after SMTP`, async () => {
    const backend = await startCredentialBackend();
    try {
      const email = 'login@example.com';
      const input = registration(email);
      const hash = `scrypt:qa-fixture:${scryptSync(input.password, 'qa-fixture', 64).toString('hex')}`;
      const now = new Date().toISOString();
      backend.database.prepare(`INSERT INTO users
        (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run('login-user', email, 'Original', hash, now, now);
      if (mutation === 'profile') {
        backend.database.prepare('INSERT INTO pending_codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, ?)')
          .run(email, 'old-code', Date.now() + 60_000, 2);
      }
      const request = backend.request('/api/auth/login', input);
      const delivery = await backend.smtp.delivery(email);
      const column = { profile: 'name', block: 'blocked_at', password: 'password_hash' }[mutation];
      backend.database.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).run('Concurrent change', 'login-user');
      if (mutation === 'profile') backend.database.prepare('UPDATE pending_codes SET attempts = 4 WHERE email = ?').run(email);
      delivery.accept();
      assert.equal((await request).status, mutation === 'profile' ? 200 : 401);
      const user = backend.database.prepare('SELECT name, blocked_at, password_hash FROM users WHERE id = ?').get('login-user');
      assert.equal(user[column], 'Concurrent change');
      const code = backend.database.prepare('SELECT attempts FROM pending_codes WHERE email = ?').get(email);
      if (mutation === 'profile') assert.equal(code.attempts, 4, 'delivery must not reset concurrent verification attempts');
      else assert.equal(code, undefined, 'an ineligible account must not receive a persisted login code');
    } finally {
      await backend.close();
    }
  });
}

// A session check never writes the session's cookies (sign-in does): an
// answer that reaches the browser after another tab signed out or in must
// not put the previous session back, even when it extends the session
// (instant viewer access, docs/specs/instant-viewer-access.md).
test('a session check names its session and never re-issues session cookies, even when extending it', async () => {
  const backend = await startCredentialBackend();
  try {
    const now = new Date().toISOString();
    backend.database.prepare(`INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run('viewer', 'viewer@example.com', 'Viewer', 'unused', now, now);
    const seedSession = (token, lifetimeMs) => backend.database.prepare(`INSERT INTO sessions
      (token_hash, user_id, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(createHash('sha256').update(token).digest('hex'), 'viewer', 'viewer@example.com', Date.now() + lifetimeMs, now);
    const tagOf = token => createHash('sha256').update(`hearthpulse-viewer-session:${token}`).digest('base64url').slice(0, 22);
    const me = cookie => backend.request('/api/auth/me', undefined, { Cookie: cookie });

    seedSession('long-lived-session', 365 * 24 * 60 * 60 * 1000);
    const untagged = await me('manacost_auth_token=long-lived-session');
    const untaggedBody = await untagged.json();
    assert.equal(untaggedBody.viewerSession, null, 'a session from before the tag is not bound');
    assert.ok(untaggedBody.sessionExpiresAt > Date.now());
    assert.deepEqual(untagged.headers.getSetCookie(), []);
    const tagged = await me(`manacost_auth_token=long-lived-session; hp_viewer=${tagOf('long-lived-session')}`);
    assert.equal((await tagged.json()).viewerSession, tagOf('long-lived-session'));
    assert.deepEqual(tagged.headers.getSetCookie(), []);

    // A → B: tab 1's check for an ageing session A extends it on the server;
    // its answer reaches the browser after tab 2 signed B in. It carries no
    // cookie, so the browser keeps B's session.
    seedSession('ageing-session', 60_000);
    const extended = await me(`manacost_auth_token=ageing-session; hp_viewer=${tagOf('ageing-session')}`);
    const extendedBody = await extended.json();
    assert.deepEqual(extended.headers.getSetCookie(), [], 'an extended session gets no cookie either');
    assert.ok(extendedBody.sessionExpiresAt > Date.now() + 60 * 60 * 1000, 'the server session was extended');
    const jar = new Map([['manacost_auth_token', 'session-b'], ['hp_viewer', tagOf('session-b')]]);
    for (const cookie of extended.headers.getSetCookie()) jar.set(cookie.slice(0, cookie.indexOf('=')), 'overwritten');
    assert.deepEqual(Object.fromEntries(jar), { manacost_auth_token: 'session-b', hp_viewer: tagOf('session-b') });

    // A guest answer writes no cookie either (it may reach the browser after
    // another sign-in); it names the tag the request carried.
    const guest = await me(`manacost_auth_token=unknown-session; hp_viewer=${tagOf('ended-session')}`);
    assert.deepEqual(await guest.json(), { user: null, adminAllowed: false, contestAdminAllowed: false,
      viewerSession: tagOf('ended-session') });
    assert.deepEqual(guest.headers.getSetCookie(), []);
  } finally {
    await backend.close();
  }
});
