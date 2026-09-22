import assert from 'node:assert/strict';
import test from 'node:test';
import { scryptSync } from 'node:crypto';
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
