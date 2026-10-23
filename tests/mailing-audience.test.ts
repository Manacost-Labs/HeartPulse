import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { canReceiveCampaign, ensureBoostySeenColumn, hasMailingConsent, isBoostyAudienceContact, mailingSegment } from '../server/mailingAudience.js';

const realEmail = (email: string) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email) && !email.endsWith('@example.invalid');
const consented = {
  email: 'reader@mail.ru', consent_status: 'subscribed', consented_at: '2026-01-01', verified_at: '2026-01-01',
  suppressed_reason: '', blocked_at: null, boosty_seen_at: null,
};
const boostyOnly = { ...consented, email: 'patron@mail.ru', consent_status: 'unknown', consented_at: null, verified_at: null, boosty_seen_at: '2025-03-01' };

assert.equal(mailingSegment('boosty-all'), 'boosty-all');
assert.equal(mailingSegment('former'), 'former');
assert.equal(mailingSegment('everyone'), 'all-consented', 'an unknown segment falls back to the consented audience');
assert.equal(mailingSegment(undefined), 'all-consented');

assert.equal(hasMailingConsent(consented, realEmail), true);
assert.equal(hasMailingConsent(boostyOnly, realEmail), false, 'a Boosty subscriber without an opt-in is not in the consented audience');
assert.equal(isBoostyAudienceContact(boostyOnly, realEmail), true, 'but is in the all-time Boosty audience');
assert.equal(isBoostyAudienceContact(consented, realEmail), false, 'a site reader never seen on Boosty is not');
assert.equal(isBoostyAudienceContact({ ...consented, boosty_seen_at: '2025-01-01' }, realEmail), true,
  'a Boosty subscriber who also opted in on the site stays in it');

for (const [change, reason] of [
  [{ consent_status: 'unsubscribed' }, 'an unsubscribed address'],
  [{ consent_status: 'suppressed' }, 'a suppressed address'],
  [{ suppressed_reason: 'hard-bounce' }, 'a bounced address'],
  [{ blocked_at: '2026-02-01' }, 'a blocked account'],
  [{ email: 'patron@example.invalid' }, 'a placeholder e-mail'],
] as const) {
  assert.equal(isBoostyAudienceContact({ ...boostyOnly, ...change }, realEmail), false, `${reason} never gets a Boosty letter`);
}

// The send-time check follows the campaign's own segment.
assert.equal(canReceiveCampaign('boosty-all', boostyOnly, realEmail), true);
assert.equal(canReceiveCampaign('all-consented', boostyOnly, realEmail), false);
assert.equal(canReceiveCampaign('active', consented, realEmail), true);
assert.equal(canReceiveCampaign('boosty-all', { ...boostyOnly, consent_status: 'unsubscribed' }, realEmail), false,
  'an unsubscribe between queueing and sending is honoured');
// An older database gains the column, and contacts the Boosty list created are marked as Boosty subscribers.
const database = new DatabaseSync(':memory:');
database.exec(`CREATE TABLE mailing_contacts (id TEXT PRIMARY KEY, consent_source TEXT NOT NULL DEFAULT '', first_seen_at TEXT NOT NULL);
  INSERT INTO mailing_contacts VALUES ('patron', 'boosty-observed', '2025-01-01'), ('reader', 'registration', '2025-02-01');`);
ensureBoostySeenColumn(database);
ensureBoostySeenColumn(database);
assert.deepEqual(database.prepare('SELECT id, boosty_seen_at FROM mailing_contacts ORDER BY id').all().map(row => ({ ...row })), [
  { id: 'patron', boosty_seen_at: '2025-01-01' },
  { id: 'reader', boosty_seen_at: null },
], 'the migration runs once and marks only Boosty-created contacts');
console.log('mailing audience: ok');
