import assert from 'node:assert/strict';
import test from 'node:test';
import { startCredentialBackend } from './helpers/credentialBackend.mjs';

// The code may sit in a plain or a base64 part of the message.
function emailedCode(body) {
  const plain = body.match(/\b(\d{6})\b/);
  if (plain) return plain[1];
  for (const part of body.split(/\r?\n\r?\n/)) {
    const decoded = Buffer.from(part.replace(/\s+/g, ''), 'base64').toString('utf8').match(/\b(\d{6})\b/);
    if (decoded) return decoded[1];
  }
  return assert.fail('the e-mail carries no six-digit code');
}

async function register(backend, email, newsletterOptIn) {
  const registration = backend.request('/api/auth/register', {
    email, password: 'test-password-123', name: 'Consent Test', country: 'Россия', newsletterOptIn,
  });
  const delivery = await backend.smtp.delivery(email);
  delivery.accept();
  const registered = await registration;
  assert.equal(registered.status, 200, await registered.text());
  return emailedCode(delivery.body);
}

async function verify(backend, email, code) {
  const verified = await backend.request('/api/auth/verify', { email, code });
  assert.equal(verified.status, 200, await verified.text());
}

async function registerAndVerify(backend, email, newsletterOptIn) {
  await verify(backend, email, await register(backend, email, newsletterOptIn));
}

const storedChoice = (backend, email) => ({
  optIn: backend.database.prepare('SELECT newsletter_opt_in FROM users WHERE email = ?').get(email)?.newsletter_opt_in,
  contact: { ...backend.database.prepare(`
    SELECT consent_status, consented_at, verified_at FROM mailing_contacts WHERE email = ?
  `).get(email) },
});

test('a newsletter declined at registration stays declined after the e-mail is verified', async () => {
  const backend = await startCredentialBackend();
  try {
    await registerAndVerify(backend, 'quiet@example.com', false);
    const { optIn, contact } = storedChoice(backend, 'quiet@example.com');
    assert.equal(optIn, 0);
    assert.equal(contact.consent_status, 'unsubscribed');
    assert.equal(contact.consented_at, null, 'no consent is recorded for a declined newsletter');
  } finally {
    await backend.close();
  }
});

test('a newsletter accepted at registration is confirmed by the verified e-mail', async () => {
  const backend = await startCredentialBackend();
  try {
    await registerAndVerify(backend, 'reader@example.com', true);
    const { optIn, contact } = storedChoice(backend, 'reader@example.com');
    assert.equal(optIn, 1);
    assert.equal(contact.consent_status, 'subscribed');
    assert.ok(contact.consented_at, 'consent time is recorded');
    assert.ok(contact.verified_at, 'the subscription is confirmed by the verified address');
  } finally {
    await backend.close();
  }
});

test('an unverified decline leaves someone else\'s list entry alone until the address is verified', async () => {
  const backend = await startCredentialBackend();
  try {
    const email = 'former@example.com';
    const consentedAt = '2026-01-01T00:00:00.000Z';
    // A former member who subscribed and confirmed long ago; no account owns the address now.
    backend.database.prepare(`
      INSERT INTO mailing_contacts (
        id, email, user_id, name, consent_status, consent_source, consented_at, verified_at,
        unsubscribed_at, suppressed_reason, account_state, former_at, first_seen_at, last_seen_at, updated_at
      ) VALUES ('former-contact', ?, NULL, 'Former', 'subscribed', 'imported', ?, ?, NULL, '', 'former', ?, ?, ?, ?)
    `).run(email, consentedAt, consentedAt, consentedAt, consentedAt, consentedAt, consentedAt);
    const entry = () => ({ ...backend.database.prepare(
      'SELECT user_id, consent_status, consent_source FROM mailing_contacts WHERE email = ?',
    ).get(email) });

    const code = await register(backend, email, false);
    assert.deepEqual(entry(), { user_id: null, consent_status: 'subscribed', consent_source: 'imported' },
      'registering with someone else\'s address must not unsubscribe or claim it');

    await verify(backend, email, code);
    const userId = backend.database.prepare('SELECT id FROM users WHERE email = ?').get(email)?.id;
    assert.deepEqual(entry(), { user_id: userId, consent_status: 'unsubscribed', consent_source: 'email-code-verified' },
      'the verified owner\'s decline applies');
  } finally {
    await backend.close();
  }
});
