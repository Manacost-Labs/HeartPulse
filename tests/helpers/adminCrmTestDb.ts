import { DatabaseSync } from 'node:sqlite';
import { ADMIN_CRM_SCHEMA_SQL } from '../../server/adminCrmRoutes.js';

/**
 * In-memory copy of the ecosystem tables the admin CRM reads, plus the real CRM schema.
 * Column sets mirror server/index.ts closely enough for the CRM queries; secrets are seeded
 * with recognisable markers so tests can assert they never leak.
 */
export function createAdminCrmTestDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user',
      country TEXT, newsletter_opt_in INTEGER NOT NULL DEFAULT 0, contact_vk_url TEXT, contact_telegram TEXT, contact_email TEXT,
      blocked_at TEXT, password_hash TEXT NOT NULL DEFAULT 'secret-hash', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE identities (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL, email TEXT, username TEXT, photo_url TEXT, verified_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE subscriptions (user_id TEXT PRIMARY KEY, has_access INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'none',
      message TEXT NOT NULL DEFAULT '', checked_at TEXT NOT NULL, stale INTEGER NOT NULL DEFAULT 0, boosty_json TEXT NOT NULL DEFAULT '{}',
      telegram_json TEXT NOT NULL DEFAULT '{}', patreon_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL);
    CREATE TABLE subscription_checks (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, source TEXT NOT NULL,
      has_access INTEGER NOT NULL DEFAULT 0, detail_json TEXT NOT NULL DEFAULT '{}', checked_at TEXT NOT NULL);
    CREATE TABLE manual_subscription_grants (user_id TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 1, entitlements_json TEXT NOT NULL DEFAULT '{}',
      granted_by TEXT NOT NULL, granted_at TEXT NOT NULL, expires_at TEXT, revoked_by TEXT, revoked_at TEXT, note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
    CREATE TABLE contests (id TEXT PRIMARY KEY, title TEXT NOT NULL);
    CREATE TABLE contest_entries (id TEXT PRIMARY KEY, contest_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);
    CREATE TABLE mailing_contacts (id TEXT PRIMARY KEY, email TEXT NOT NULL, user_id TEXT, consent_status TEXT NOT NULL DEFAULT 'unknown',
      consented_at TEXT, unsubscribed_at TEXT);
    CREATE TABLE mailing_deliveries (campaign_id TEXT NOT NULL, contact_id TEXT NOT NULL, status TEXT NOT NULL, accepted_at TEXT, updated_at TEXT NOT NULL);
    CREATE TABLE admin_audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_user_id TEXT NOT NULL, action TEXT NOT NULL,
      entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, details_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
  `);
  db.exec(ADMIN_CRM_SCHEMA_SQL);
  db.exec(ADMIN_CRM_SCHEMA_SQL); // idempotent start-up

  const iso = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString();
  const addUser = (id: string, values: Partial<Record<string, string>> = {}) => db.prepare(`
    INSERT INTO users (id, email, name, role, blocked_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, `${id}@example.test`, values.name ?? id, values.role ?? 'user', values.blocked_at ?? null, values.created_at ?? iso(-100), iso(-1));
  const setSubscription = (userId: string, hasAccess: boolean, source = 'boosty') => db.prepare(`
    INSERT INTO subscriptions (user_id, has_access, source, message, checked_at, updated_at) VALUES (?, ?, ?, 'ok', ?, ?)
  `).run(userId, hasAccess ? 1 : 0, source, iso(0), iso(0));
  const addCheck = (userId: string, hasAccess: boolean, daysAgo: number, source = 'boosty') => db.prepare(`
    INSERT INTO subscription_checks (user_id, source, has_access, detail_json, checked_at) VALUES (?, ?, ?, '{"token":"never-returned"}', ?)
  `).run(userId, source, hasAccess ? 1 : 0, iso(-daysAgo));
  const grant = (userId: string, expiresInDays: number | null, active = 1) => db.prepare(`
    INSERT INTO manual_subscription_grants (user_id, active, granted_by, granted_at, expires_at, note, updated_at) VALUES (?, ?, 'admin-1', ?, ?, 'приз конкурса', ?)
  `).run(userId, active, iso(-3), expiresInDays === null ? null : iso(expiresInDays), iso(-3));
  db.exec(`
    ALTER TABLE contests ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
    CREATE TABLE referral_links (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, label TEXT NOT NULL, campaign TEXT NOT NULL DEFAULT '');
    CREATE TABLE user_referrals (user_id TEXT PRIMARY KEY, referral_id TEXT NOT NULL, click_id INTEGER, clicked_at TEXT NOT NULL, attributed_at TEXT NOT NULL);
    CREATE TABLE mailing_campaigns (id TEXT PRIMARY KEY, subject TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
      created_by TEXT NOT NULL DEFAULT 'admin', created_at TEXT NOT NULL, completed_at TEXT, recipient_count INTEGER NOT NULL DEFAULT 0,
      accepted_count INTEGER NOT NULL DEFAULT 0, failed_count INTEGER NOT NULL DEFAULT 0);
  `);
  return { db, iso, addUser, setSubscription, addCheck, grant };
}
