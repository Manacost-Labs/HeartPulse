import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { startCredentialBackend } from './helpers/credentialBackend.mjs';

// An account signed in through Google, Discord or Patreon keeps the provider's picture
// after the account is loaded again from the database, not only right after that login.
function seedSocialAccount(database, provider, photoUrl) {
  const now = new Date().toISOString();
  const session = randomUUID();
  database.prepare(`INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
    VALUES ('social', 'social@example.com', 'Social', 'unused', ?, ?)`).run(now, now);
  database.prepare(`INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
    VALUES ('social', ?, 'subject-1', 'social@example.com', 'social', ?, ?, ?, ?)`).run(provider, photoUrl, now, now, now);
  database.prepare(`INSERT INTO sessions (token_hash, user_id, email, expires_at, created_at) VALUES (?, 'social', 'social@example.com', ?, ?)`)
    .run(createHash('sha256').update(session).digest('hex'), Date.now() + 60_000, now);
  return { Cookie: `manacost_auth_token=${session}`, 'X-CSRF-Request': '1' };
}

test('the account picture comes from any linked sign-in provider', async () => {
  const backend = await startCredentialBackend();
  try {
    const picture = 'https://lh3.googleusercontent.com/a/social-picture';
    const cookie = seedSocialAccount(backend.database, 'google', picture);
    const response = await backend.request('/api/auth/me', undefined, cookie);
    assert.equal(response.status, 200, await response.clone().text());
    const { user } = await response.json();
    assert.equal(user?.photoUrl, picture);
  } finally {
    await backend.close();
  }
});
