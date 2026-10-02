import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

const formerConsentAt = '2026-01-01T00:00:00.000Z';
const insertFormerSubscriber = (backend, email, { confirmed = true } = {}) => {
  backend.database.prepare(`
    INSERT INTO mailing_contacts (
      id, email, user_id, name, consent_status, consent_source, consented_at, verified_at,
      unsubscribed_at, suppressed_reason, account_state, former_at, first_seen_at, last_seen_at, updated_at
    ) VALUES ('former-contact', ?, NULL, 'Former', 'subscribed', 'imported', ?, ?, NULL, '', 'former', ?, ?, ?, ?)
  `).run(email, formerConsentAt, confirmed ? formerConsentAt : null, formerConsentAt, formerConsentAt, formerConsentAt, formerConsentAt);
};

const entryOf = (backend, email) => ({ ...backend.database.prepare(
  'SELECT user_id, name, consent_status, consent_source, consented_at FROM mailing_contacts WHERE email = ?',
).get(email) });
const accountOf = (backend, email) => ({ ...backend.database.prepare(
  'SELECT id, newsletter_opt_in FROM users WHERE email = ?',
).get(email) });

test('an unticked box at registration never withdraws an earlier subscription of the address', async () => {
  const backend = await startCredentialBackend();
  try {
    const email = 'former@example.com';
    // A former member who subscribed and confirmed long ago; no account owns the address now.
    insertFormerSubscriber(backend, email);

    const code = await register(backend, email, false);
    const account = accountOf(backend, email);
    const original = { name: 'Former', consent_status: 'subscribed', consent_source: 'imported', consented_at: formerConsentAt };
    assert.deepEqual(entryOf(backend, email), { user_id: account.id, ...original },
      'registration links the entry but an unverified account cannot change it');

    await verify(backend, email, code);
    assert.equal(accountOf(backend, email).newsletter_opt_in, 1, 'the account takes over the existing subscription');
    assert.deepEqual(entryOf(backend, email), { user_id: account.id, ...original },
      'taking over does not record a new consent that nobody gave');
  } finally {
    await backend.close();
  }
});

test('an unconfirmed old subscription is not taken over', async () => {
  const backend = await startCredentialBackend();
  try {
    const email = 'unconfirmed@example.com';
    insertFormerSubscriber(backend, email, { confirmed: false });
    await registerAndVerify(backend, email, false);
    assert.equal(accountOf(backend, email).newsletter_opt_in, 0);
  } finally {
    await backend.close();
  }
});

test('a later login does not record the consent again', async () => {
  const backend = await startCredentialBackend();
  try {
    const email = 'regular@example.com';
    backend.database.prepare(`INSERT INTO users (id, email, name, password_hash, newsletter_opt_in, created_at, updated_at)
      VALUES ('regular', ?, 'Regular', 'unused', 1, ?, ?)`).run(email, formerConsentAt, formerConsentAt);
    backend.database.prepare(`
      INSERT INTO mailing_contacts (id, email, user_id, name, consent_status, consent_source, consented_at, verified_at,
        suppressed_reason, account_state, first_seen_at, last_seen_at, updated_at)
      VALUES ('regular-contact', ?, 'regular', 'Regular', 'subscribed', 'email-code-verified', ?, ?, '', 'current', ?, ?, ?)
    `).run(email, formerConsentAt, formerConsentAt, formerConsentAt, formerConsentAt, formerConsentAt);
    // A login code, as the password step would issue it.
    backend.database.prepare('INSERT INTO pending_codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)')
      .run(email, createHash('sha256').update('424242').digest('hex'), Date.now() + 600_000);
    await verify(backend, email, '424242');
    assert.deepEqual(entryOf(backend, email), {
      user_id: 'regular', name: 'Regular', consent_status: 'subscribed',
      consent_source: 'email-code-verified', consented_at: formerConsentAt,
    }, 'a confirmed subscription keeps the time and source of the original consent');
  } finally {
    await backend.close();
  }
});

test('a password reset drops a newsletter tick that was never confirmed', async () => {
  const backend = await startCredentialBackend();
  try {
    const email = 'squatted@example.com';
    const createdAt = new Date().toISOString();
    // Someone else registered the address with the box ticked and never verified it:
    // the account says yes, the list entry is still unconfirmed.
    backend.database.prepare(`INSERT INTO users (id, email, name, password_hash, newsletter_opt_in, created_at, updated_at)
      VALUES ('squatter', ?, 'Squatter', 'unused', 1, ?, ?)`).run(email, createdAt, createdAt);
    backend.database.prepare(`
      INSERT INTO mailing_contacts (id, email, user_id, name, consent_status, consent_source, account_state, first_seen_at, last_seen_at, updated_at)
      VALUES ('squatted-contact', ?, 'squatter', 'Squatter', 'unknown', 'user-sync', 'current', ?, ?, ?)
    `).run(email, createdAt, createdAt, createdAt);
    // The owner takes the account back through a password reset.
    const resetRequest = backend.request('/api/auth/password-reset/request', { email });
    const delivery = await backend.smtp.delivery(email);
    delivery.accept();
    assert.equal((await resetRequest).status, 200);
    const reset = await backend.request('/api/auth/password-reset/confirm', {
      email, code: emailedCode(delivery.body), password: 'owner-password-456',
    });
    assert.equal(reset.status, 200, await reset.text());
    assert.equal(accountOf(backend, email).newsletter_opt_in, 0, 'the squatter\'s tick does not subscribe the owner');
    assert.notEqual(entryOf(backend, email).consent_status, 'subscribed');
  } finally {
    await backend.close();
  }
});
