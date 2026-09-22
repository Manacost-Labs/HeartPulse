import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { startCredentialBackend } from './helpers/credentialBackend.mjs';

const client = { client_id: 'manacost-tracker' };

function seedAccount(database) {
  const now = new Date().toISOString();
  const session = randomUUID();
  database.prepare(`INSERT INTO users
    (id, email, name, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run('account', 'account@example.com', 'Account', 'unused', now, now);
  database.prepare(`INSERT INTO sessions
    (token_hash, user_id, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(createHash('sha256').update(session).digest('hex'), 'account', 'account@example.com', Date.now() + 60_000, now);
  return { Cookie: `manacost_auth_token=${session}`, 'X-CSRF-Request': '1' };
}

async function begin(backend) {
  const response = await backend.request('/api/v1/oauth/device/code', {
    ...client, scope: 'profile.read subscription.read tracker.write',
  });
  assert.equal(response.status, 200);
  return response.json();
}

function approve(backend, device, cookie) {
  return backend.request('/api/v1/oauth/device/approve', {
    user_code: device.user_code, decision: 'approve',
  }, cookie);
}

function exchange(backend, device) {
  return backend.request('/api/v1/oauth/token', {
    ...client, grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: device.device_code,
  });
}

const batch = () => ({ events: [{
  eventId: randomUUID(), type: 'constructed_match', schemaVersion: 1,
  occurredAt: new Date().toISOString(), payload: { matchId: 'fixture', turns: 8 },
}] });

for (const boundary of ['browser', 'approval', 'exchange', 'refresh', 'access', 'tracker']) {
  test(`blocking an account immediately closes the ${boundary} boundary`, async () => {
    const backend = await startCredentialBackend();
    try {
      const cookie = seedAccount(backend.database);
      const browser = await backend.request('/api/auth/me', undefined, cookie);
      assert.equal(browser.status, 200);
      assert.equal((await browser.json()).user.id, 'account');
      const device = await begin(backend);
      let pair;
      if (!['browser', 'approval'].includes(boundary)) {
        assert.equal((await approve(backend, device, cookie)).status, 200);
        if (boundary !== 'exchange') {
          const response = await exchange(backend, device);
          assert.equal(response.status, 200);
          pair = await response.json();
          const headers = { Authorization: `Bearer ${pair.access_token}` };
          assert.equal((await backend.request('/api/v1/me', undefined, headers)).status, 200);
          if (boundary === 'tracker') {
            assert.equal((await backend.request('/api/v1/tracker/events/batch', batch(), headers)).status, 202);
          }
        }
      }
      backend.database.prepare('UPDATE users SET blocked_at = ? WHERE id = ?')
        .run(new Date().toISOString(), 'account');
      if (boundary === 'browser') {
        const response = await backend.request('/api/auth/me', undefined, cookie);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).user, null);
      } else if (boundary === 'approval') {
        assert.equal((await approve(backend, device, cookie)).status, 401);
      } else if (boundary === 'exchange') {
        const response = await exchange(backend, device);
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error, 'access_denied');
        backend.database.prepare('UPDATE users SET blocked_at = NULL WHERE id = ?').run('account');
        assert.equal((await exchange(backend, device)).status, 400);
      } else if (boundary === 'refresh') {
        const response = await backend.request('/api/v1/oauth/token', {
          ...client, grant_type: 'refresh_token', refresh_token: pair.refresh_token,
        });
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error, 'invalid_grant');
        backend.database.prepare('UPDATE users SET blocked_at = NULL WHERE id = ?').run('account');
        assert.equal((await backend.request('/api/v1/me', undefined, {
          Authorization: `Bearer ${pair.access_token}`,
        })).status, 401);
      } else {
        const headers = { Authorization: `Bearer ${pair.access_token}` };
        const path = boundary === 'tracker' ? '/api/v1/tracker/events/batch' : '/api/v1/me';
        const response = await backend.request(path, boundary === 'tracker' ? batch() : undefined, headers);
        assert.equal(response.status, 401);
        assert.match(response.headers.get('cache-control'), /no-store/);
        if (boundary === 'tracker') {
          assert.equal(backend.database.prepare('SELECT COUNT(*) AS count FROM tracker_profile_events').get().count, 1);
        }
        // Observing a blocked account permanently revokes this token family.
        backend.database.prepare('UPDATE users SET blocked_at = NULL WHERE id = ?').run('account');
        assert.equal((await backend.request('/api/v1/me', undefined, headers)).status, 401);
      }
    } finally {
      await backend.close();
    }
  });
}
