/**
 * Admin CRM segments. Each rule is a SQL predicate over the aliases
 * `u` (users), `s` (subscriptions) and `g` (manual_subscription_grants), so the
 * same definition drives both the filtered user list and the segment counts.
 * See docs/specs/admin-crm.md.
 */
export const ADMIN_USER_SEGMENTS = [
  { id: 'all', label: 'Все' },
  { id: 'paying', label: 'Платят сейчас' },
  { id: 'manual', label: 'Ручной доступ' },
  { id: 'expiring', label: 'Истекает ≤ 7 дней' },
  { id: 'lapsed', label: 'Потеряли доступ' },
  { id: 'new', label: 'Новые за 7 дней' },
  { id: 'blocked', label: 'Заблокированы' },
  { id: 'admins', label: 'Администраторы' },
] as const;

export type AdminUserSegmentId = typeof ADMIN_USER_SEGMENTS[number]['id'];

export const ADMIN_USER_SEGMENT_IDS: AdminUserSegmentId[] = ADMIN_USER_SEGMENTS.map(segment => segment.id);

// Timestamps are stored as ISO-8601 UTC strings, so lexical comparison is chronological.
const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
const daysFromNow = (days: number) => `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '${days} days')`;

export const ACTIVE_MANUAL_GRANT_SQL = `(COALESCE(g.active, 0) = 1 AND (g.expires_at IS NULL OR g.expires_at > ${NOW}))`;
const PROVIDER_ACCESS_SQL = 'COALESCE(s.has_access, 0) = 1';

const SEGMENT_SQL: Record<AdminUserSegmentId, string> = {
  all: '1 = 1',
  paying: PROVIDER_ACCESS_SQL,
  manual: ACTIVE_MANUAL_GRANT_SQL,
  expiring: `(COALESCE(g.active, 0) = 1 AND g.expires_at IS NOT NULL AND g.expires_at > ${NOW} AND g.expires_at <= ${daysFromNow(7)})`,
  lapsed: `(NOT ${PROVIDER_ACCESS_SQL} AND NOT ${ACTIVE_MANUAL_GRANT_SQL} AND EXISTS (
    SELECT 1 FROM subscription_checks c
    WHERE c.user_id = u.id AND c.has_access = 1 AND c.checked_at >= ${daysFromNow(-30)}
  ))`,
  new: `u.created_at >= ${daysFromNow(-7)}`,
  blocked: `COALESCE(u.blocked_at, '') <> ''`,
  admins: `u.role = 'admin'`,
};

export function isAdminUserSegment(value: string): value is AdminUserSegmentId {
  return Object.prototype.hasOwnProperty.call(SEGMENT_SQL, value);
}

export function adminUserSegmentWhere(segment: AdminUserSegmentId): string {
  if (!isAdminUserSegment(segment)) throw new Error(`Unknown admin user segment: ${String(segment)}`);
  return SEGMENT_SQL[segment];
}
