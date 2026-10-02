import type { DatabaseSync } from 'node:sqlite';

export type MailingContactSyncOptions = {
  confirmConsent?: boolean;
  source?: string;
  /** The caller knows the account controls the address: a verified code, a verified e-mail change or the signed-in profile. */
  verifiedOwner?: boolean;
};

export type MailingContactUser = {
  id: string;
  email: string;
  name?: string;
  newsletterOptIn?: boolean;
  createdAt?: string;
};

export type MailingContactSyncDependencies = {
  normalizeEmail: (value: unknown) => string;
  isRealEmail: (email: string) => boolean;
  normalizeOptionalText: (value: unknown, maxLength?: number) => string;
  contactId: (email: string) => string;
};

/**
 * Mirrors an account's newsletter choice into `mailing_contacts`. An entry that
 * existed before the account (an imported subscriber, a former member) is linked
 * to it, but its consent changes only for a `verifiedOwner` caller: an
 * unverified registration must not unsubscribe an address it has not proven it owns.
 */
export function syncMailingContact(
  database: DatabaseSync,
  user: MailingContactUser,
  options: MailingContactSyncOptions,
  dependencies: MailingContactSyncDependencies,
): void {
  const { normalizeEmail, isRealEmail, normalizeOptionalText, contactId } = dependencies;
  const email = normalizeEmail(user.email);
  if (!isRealEmail(email)) return;
  const nowIso = new Date().toISOString();
  const source = normalizeOptionalText(options.source, 80) || 'user-sync';
  const consentKnown = Boolean(options.confirmConsent);
  const desiredStatus = user.newsletterOptIn ? (consentKnown ? 'subscribed' : 'unknown') : 'unsubscribed';
  const confirmedAt = options.confirmConsent && user.newsletterOptIn ? nowIso : null;

  database.prepare(`
    UPDATE mailing_contacts
    SET user_id = NULL,
        consent_status = 'suppressed',
        suppressed_reason = 'email-replaced',
        updated_at = ?
    WHERE user_id = ? AND lower(email) <> lower(?)
  `).run(nowIso, user.id, email);

  // `email` is UNIQUE COLLATE NOCASE, so `email = ?` is case-insensitive and indexed.
  const entry = database.prepare('SELECT first_seen_at FROM mailing_contacts WHERE email = ?').get(email) as { first_seen_at: string } | undefined;
  if (entry && !options.verifiedOwner && String(entry.first_seen_at) < (user.createdAt || nowIso)) {
    database.prepare(`
      UPDATE mailing_contacts
      SET user_id = ?, account_state = 'current', former_at = NULL, last_seen_at = ?, updated_at = ?
      WHERE email = ?
    `).run(user.id, nowIso, nowIso, email);
    return;
  }

  database.prepare(`
    INSERT INTO mailing_contacts (
      id, email, user_id, name, consent_status, consent_source, consented_at, verified_at,
      unsubscribed_at, suppressed_reason, account_state, former_at, first_seen_at, last_seen_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'current', NULL, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      user_id = excluded.user_id,
      name = excluded.name,
      consent_status = CASE
        WHEN excluded.consent_status = 'unknown' THEN mailing_contacts.consent_status
        WHEN mailing_contacts.consent_status IN ('unsubscribed', 'suppressed') AND excluded.verified_at IS NULL
          THEN mailing_contacts.consent_status
        ELSE excluded.consent_status
      END,
      consent_source = CASE
        WHEN excluded.consent_status = 'unknown' THEN mailing_contacts.consent_source
        WHEN mailing_contacts.consent_status IN ('unsubscribed', 'suppressed') AND excluded.verified_at IS NULL
          THEN mailing_contacts.consent_source
        ELSE excluded.consent_source
      END,
      consented_at = CASE
        WHEN excluded.consent_status = 'subscribed' AND (excluded.verified_at IS NOT NULL OR mailing_contacts.consented_at IS NULL)
          THEN COALESCE(excluded.consented_at, mailing_contacts.consented_at)
        ELSE mailing_contacts.consented_at
      END,
      verified_at = COALESCE(excluded.verified_at, mailing_contacts.verified_at),
      unsubscribed_at = CASE WHEN excluded.verified_at IS NOT NULL THEN NULL ELSE mailing_contacts.unsubscribed_at END,
      suppressed_reason = CASE WHEN excluded.verified_at IS NOT NULL THEN '' ELSE mailing_contacts.suppressed_reason END,
      account_state = 'current',
      former_at = NULL,
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at
  `).run(
    contactId(email),
    email,
    user.id,
    normalizeOptionalText(user.name, 120),
    desiredStatus,
    source,
    desiredStatus === 'subscribed' ? (confirmedAt || user.createdAt || nowIso) : null,
    confirmedAt,
    user.newsletterOptIn ? null : nowIso,
    user.createdAt || nowIso,
    nowIso,
    nowIso,
  );
}

/** Whether the list already holds a confirmed, unsuppressed subscription for this address. */
export function isMailingEntrySubscribed(database: DatabaseSync, email: string): boolean {
  return Boolean(database.prepare(`
    SELECT 1 FROM mailing_contacts
    WHERE email = ? AND consent_status = 'subscribed' AND verified_at IS NOT NULL AND suppressed_reason = ''
  `).get(email));
}
