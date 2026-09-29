/** Read side of the admin CRM (docs/specs/admin-crm.md); rows never include secrets or raw provider payloads. */
import {
  ACTIVE_MANUAL_GRANT_SQL,
  ADMIN_USER_SEGMENTS,
  adminUserSegmentWhere,
} from './adminCrmSegments.js';

export type QueryValue = string | number | null;

export type AdminCrmRepository = {
  get: (sql: string, ...params: QueryValue[]) => Record<string, unknown> | null;
  all: (sql: string, ...params: QueryValue[]) => Record<string, unknown>[];
  run: (sql: string, ...params: QueryValue[]) => { lastInsertRowid: number; changes: number };
};

/** Additive, idempotent schema for notes, tags and the CRM read paths. */
export const ADMIN_CRM_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS admin_user_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    author_user_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_admin_user_notes_user ON admin_user_notes(user_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS admin_user_tags (
    user_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(user_id, tag),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_admin_user_tags_tag ON admin_user_tags(tag);
  CREATE INDEX IF NOT EXISTS idx_subscription_checks_user_time ON subscription_checks(user_id, checked_at DESC);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_entity ON admin_audit_log(entity_type, entity_id, created_at DESC);
`;

const HISTORY_LIMIT = 50;
const CHECKS_SCANNED = 2000;

const str = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const nullableStr = (value: unknown) => (value === null || value === undefined || value === '' ? null : String(value));
const parseJson = (value: unknown): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(str(value) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

export function noteView(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    body: str(row.body),
    authorId: str(row.author_user_id),
    authorName: str(row.author_name) || str(row.author_user_id),
    createdAt: str(row.created_at),
  };
}

export const NOTES_SQL = `
  SELECT n.id, n.body, n.author_user_id, n.created_at, a.name AS author_name
  FROM admin_user_notes n LEFT JOIN users a ON a.id = n.author_user_id
`;

export const tagsFor = (repository: AdminCrmRepository, userId: string) => repository
  .all('SELECT tag FROM admin_user_tags WHERE user_id = ? ORDER BY created_at, tag', userId)
  .map(row => str(row.tag));

export function readSegments(repository: AdminCrmRepository) {
  const columns = ADMIN_USER_SEGMENTS
    .map(segment => `SUM(CASE WHEN ${adminUserSegmentWhere(segment.id)} THEN 1 ELSE 0 END) AS "${segment.id}"`)
    .join(',\n');
  const row = repository.get(`
    SELECT ${columns}
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    LEFT JOIN manual_subscription_grants g ON g.user_id = u.id
  `) ?? {};
  const tags = repository.all('SELECT tag, COUNT(*) AS count FROM admin_user_tags GROUP BY tag ORDER BY count DESC, tag LIMIT 30');
  return {
    segments: ADMIN_USER_SEGMENTS.map(segment => ({ id: segment.id, label: segment.label, count: Number(row[segment.id] ?? 0) })),
    tags: tags.map(tag => ({ tag: str(tag.tag), count: Number(tag.count) })),
  };
}

/**
 * Each refresh cycle writes one row per provider (boosty, telegram, patreon), so flips are tracked per
 * source. A provider's first observation is reported only when it grants access: a provider the person
 * never used would otherwise show as "access lost" on every card.
 */
export function accessChanges(checksOldestFirst: Record<string, unknown>[]) {
  const last = new Map<string, boolean>();
  const changes: Array<{ at: string; source: string; hasAccess: boolean }> = [];
  for (const check of checksOldestFirst) {
    const source = str(check.source);
    const hasAccess = Number(check.has_access) === 1;
    const previous = last.get(source);
    last.set(source, hasAccess);
    if (previous === hasAccess || (previous === undefined && !hasAccess)) continue;
    changes.push({ at: str(check.checked_at), source, hasAccess });
  }
  return changes;
}

export function readPersonCard(repository: AdminCrmRepository, userId: string) {
  const user = userId ? repository.get(`
    SELECT u.id, u.name, u.email, u.role, u.country, u.newsletter_opt_in, u.contact_vk_url, u.contact_telegram,
      u.contact_email, u.blocked_at, u.created_at, u.updated_at,
      s.has_access, s.source, s.message, s.checked_at,
      CASE WHEN ${ACTIVE_MANUAL_GRANT_SQL} THEN 1 ELSE 0 END AS manual_active,
      g.user_id AS grant_user_id, g.granted_by, gb.name AS granted_by_name, g.granted_at, g.expires_at,
      g.revoked_by, g.revoked_at, g.note
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    LEFT JOIN manual_subscription_grants g ON g.user_id = u.id
    LEFT JOIN users gb ON gb.id = g.granted_by
    WHERE u.id = ?
  `, userId) : null;
  if (!user) return null;

  const identities = repository.all(`
    SELECT provider, username, created_at, verified_at FROM identities WHERE user_id = ? ORDER BY created_at
  `, userId).map(row => ({
    provider: str(row.provider),
    username: str(row.username),
    createdAt: str(row.created_at),
    verifiedAt: nullableStr(row.verified_at),
  }));

  const changes = accessChanges(repository.all(`
    SELECT source, has_access, checked_at FROM subscription_checks
    WHERE user_id = ? ORDER BY checked_at DESC, id DESC LIMIT ${CHECKS_SCANNED}
  `, userId).reverse());

  const contests = repository.all(`
    SELECT e.contest_id, c.title, e.status, e.created_at
    FROM contest_entries e LEFT JOIN contests c ON c.id = e.contest_id
    WHERE e.user_id = ? ORDER BY e.created_at DESC LIMIT ${HISTORY_LIMIT}
  `, userId).map(row => ({
    contestId: str(row.contest_id), title: str(row.title) || str(row.contest_id), status: str(row.status), createdAt: str(row.created_at),
  }));

  const mailingRow = repository.get(`
    SELECT mc.consent_status, mc.consented_at, mc.unsubscribed_at,
      (SELECT COUNT(*) FROM mailing_deliveries d WHERE d.contact_id = mc.id AND d.status = 'accepted') AS delivered,
      (SELECT COUNT(*) FROM mailing_deliveries d WHERE d.contact_id = mc.id AND d.status = 'failed') AS failed,
      (SELECT MAX(d.accepted_at) FROM mailing_deliveries d WHERE d.contact_id = mc.id) AS last_delivered_at
    FROM mailing_contacts mc WHERE mc.user_id = ? ORDER BY mc.consented_at DESC LIMIT 1
  `, userId);

  const audit = repository.all(`
    SELECT l.id, l.action, l.actor_user_id, a.name AS actor_name, l.details_json, l.created_at
    FROM admin_audit_log l LEFT JOIN users a ON a.id = l.actor_user_id
    WHERE l.entity_type = 'user' AND l.entity_id = ?
    ORDER BY l.created_at DESC, l.id DESC LIMIT ${HISTORY_LIMIT}
  `, userId).map(row => ({
    id: Number(row.id),
    action: str(row.action),
    actorId: str(row.actor_user_id),
    actorName: str(row.actor_name) || str(row.actor_user_id),
    details: parseJson(row.details_json),
    createdAt: str(row.created_at),
  }));

  const manualActive = Number(user.manual_active) === 1;
  return {
    person: {
      id: str(user.id), name: str(user.name), email: str(user.email), role: str(user.role) || 'user',
      country: str(user.country), createdAt: str(user.created_at), updatedAt: str(user.updated_at),
      blockedAt: nullableStr(user.blocked_at), newsletterOptIn: Number(user.newsletter_opt_in) === 1,
      contacts: { telegram: str(user.contact_telegram), vk: str(user.contact_vk_url), email: str(user.contact_email) },
    },
    identities,
    access: {
      hasAccess: Number(user.has_access) === 1 || manualActive,
      // Same composition as the users list: manual access is reported alongside the cached provider source.
      source: manualActive ? (!user.source || user.source === 'none' ? 'manual-access' : `${str(user.source)},manual-access`) : str(user.source) || 'none',
      message: str(user.message),
      checkedAt: str(user.checked_at),
      manual: user.grant_user_id ? {
        active: manualActive,
        grantedBy: str(user.granted_by_name) || str(user.granted_by),
        grantedAt: str(user.granted_at),
        expiresAt: nullableStr(user.expires_at),
        revokedBy: nullableStr(user.revoked_by),
        revokedAt: nullableStr(user.revoked_at),
        note: str(user.note),
      } : null,
    },
    accessHistory: changes.reverse().slice(0, HISTORY_LIMIT),
    contests,
    mailing: mailingRow ? {
      consentStatus: str(mailingRow.consent_status),
      consentedAt: nullableStr(mailingRow.consented_at),
      unsubscribedAt: nullableStr(mailingRow.unsubscribed_at),
      delivered: Number(mailingRow.delivered ?? 0),
      failed: Number(mailingRow.failed ?? 0),
      lastDeliveredAt: nullableStr(mailingRow.last_delivered_at),
    } : null,
    notes: repository.all(`${NOTES_SQL} WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id DESC`, userId).map(noteView),
    tags: tagsFor(repository, userId),
    audit,
  };
}
