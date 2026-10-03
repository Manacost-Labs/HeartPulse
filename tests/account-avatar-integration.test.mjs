import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { startCredentialBackend } from './helpers/credentialBackend.mjs';

// An account signed in through Google, Discord or Patreon keeps the provider's picture
// after the account is loaded again from the database, not only right after that login.
function seedSocialAccount(database, identities) {
  const now = new Date().toISOString();
  const session = randomUUID();
  database.prepare(`INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
    VALUES ('social', 'social@example.com', 'Social', 'unused', ?, ?)`).run(now, now);
  for (const [index, { provider, photoUrl, updatedAt = now }] of identities.entries()) {
    database.prepare(`INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
      VALUES ('social', ?, ?, 'social@example.com', 'social', ?, ?, ?, ?)`).run(provider, `subject-${index}`, photoUrl, now, now, updatedAt);
  }
  database.prepare(`INSERT INTO sessions (token_hash, user_id, email, expires_at, created_at) VALUES (?, 'social', 'social@example.com', ?, ?)`)
    .run(createHash('sha256').update(session).digest('hex'), Date.now() + 60_000, now);
  return { Cookie: `manacost_auth_token=${session}`, 'X-CSRF-Request': '1' };
}

async function pictureOf(identities) {
  const backend = await startCredentialBackend();
  try {
    const response = await backend.request('/api/auth/me', undefined, seedSocialAccount(backend.database, identities));
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()).user?.photoUrl;
  } finally {
    await backend.close();
  }
}

const google = 'https://lh3.googleusercontent.com/a/social-picture';
const telegram = 'https://t.me/i/userpic/320/social.jpg';

test('the account picture comes from any linked sign-in provider', async () => {
  assert.equal(await pictureOf([{ provider: 'google', photoUrl: google }]), google);
});

test('a Telegram picture wins over a newer one from another provider', async () => {
  assert.equal(await pictureOf([
    { provider: 'telegram', photoUrl: telegram, updatedAt: '2026-01-01T00:00:00.000Z' },
    { provider: 'google', photoUrl: google },
  ]), telegram);
});

test('an empty Telegram picture falls back to another provider', async () => {
  assert.equal(await pictureOf([{ provider: 'telegram', photoUrl: '' }, { provider: 'discord', photoUrl: google }]), google);
});
