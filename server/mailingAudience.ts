import type { DatabaseSync } from 'node:sqlite';

// Who a newsletter campaign may reach. The consented segments need a verified
// opt-in; `boosty-all` reaches everyone the Boosty subscriber list ever showed
// with an email, opt-in or not, because the owner writes to them as their
// Boosty author. Every segment drops unsubscribed, suppressed and blocked
// addresses, and every letter carries the unsubscribe link.

export const MAILING_SEGMENTS = ['all-consented', 'active', 'former', 'boosty-all'] as const;
export type MailingSegment = typeof MAILING_SEGMENTS[number];

export type MailingAudienceContact = {
  email?: unknown;
  consent_status?: unknown;
  consented_at?: unknown;
  verified_at?: unknown;
  suppressed_reason?: unknown;
  blocked_at?: unknown;
  boosty_seen_at?: unknown;
};

export function mailingSegment(value: unknown): MailingSegment {
  return MAILING_SEGMENTS.find(segment => segment === value) ?? 'all-consented';
}

function reachable(contact: MailingAudienceContact, isRealEmail: (email: string) => boolean): boolean {
  return !contact.suppressed_reason && !contact.blocked_at && isRealEmail(String(contact.email || ''));
}

/** A verified opt-in that was never withdrawn. */
export function hasMailingConsent(contact: MailingAudienceContact, isRealEmail: (email: string) => boolean): boolean {
  return contact.consent_status === 'subscribed'
    && Boolean(contact.consented_at)
    && Boolean(contact.verified_at)
    && reachable(contact, isRealEmail);
}

/** Seen in the Boosty subscriber list at any time and never unsubscribed from our letters. */
export function isBoostyAudienceContact(contact: MailingAudienceContact, isRealEmail: (email: string) => boolean): boolean {
  return Boolean(contact.boosty_seen_at)
    && contact.consent_status !== 'unsubscribed'
    && contact.consent_status !== 'suppressed'
    && reachable(contact, isRealEmail);
}

/** The send-time check of one delivery: the rule of the campaign's own segment. */
export function canReceiveCampaign(
  segment: MailingSegment,
  contact: MailingAudienceContact,
  isRealEmail: (email: string) => boolean,
): boolean {
  return segment === 'boosty-all' ? isBoostyAudienceContact(contact, isRealEmail) : hasMailingConsent(contact, isRealEmail);
}

/** Adds `mailing_contacts.boosty_seen_at` to an older database. */
export function ensureBoostySeenColumn(database: DatabaseSync): void {
  const columns = new Set((database.prepare('PRAGMA table_info(mailing_contacts)').all() as Array<{ name: unknown }>).map(row => String(row.name)));
  if (columns.has('boosty_seen_at')) return;
  // Contacts the Boosty list created before the column existed were Boosty subscribers.
  database.exec(`ALTER TABLE mailing_contacts ADD COLUMN boosty_seen_at TEXT;
    UPDATE mailing_contacts SET boosty_seen_at = first_seen_at WHERE consent_source = 'boosty-observed';`);
}
