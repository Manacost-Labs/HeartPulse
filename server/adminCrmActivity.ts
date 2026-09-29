import type { AdminCrmRepository } from './adminCrmReadModel.js';

/**
 * Recent events for the admin overview. Admin actions carry the raw audit action and details;
 * the client turns them into sentences with the same labels as the client card.
 */
export type OverviewActivity =
  | { id: string; kind: 'registration'; at: string; name: string; userId: string }
  | { id: string; kind: 'admin'; at: string; action: string; details: Record<string, unknown>; actorName: string; targetName: string; userId?: string }
  | { id: string; kind: 'contest'; at: string; name: string; contestTitle: string; status: string; userId: string }
  | { id: string; kind: 'mailing'; at: string; subject: string; accepted: number; failed: number };

const LIMIT = 15;

const str = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const details = (value: unknown): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(str(value) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

export function readActivity(repository: AdminCrmRepository): OverviewActivity[] {
  const events: OverviewActivity[] = [];
  for (const row of repository.all(`SELECT u.id, u.name, u.email, u.created_at FROM users u ORDER BY u.created_at DESC LIMIT ${LIMIT}`)) {
    events.push({ id: `registration:${str(row.id)}`, kind: 'registration', at: str(row.created_at), name: str(row.name) || str(row.email), userId: str(row.id) });
  }
  // Read-only audit entries (the parser page records its own reads) are noise in a feed of changes and
  // are excluded in SQL so a burst of them cannot push real actions out of the window.
  for (const row of repository.all(`
    SELECT l.id, l.action, l.entity_type, l.entity_id, l.details_json, l.created_at, a.name AS actor_name, t.name AS target_name
    FROM admin_audit_log l
    LEFT JOIN users a ON a.id = l.actor_user_id
    LEFT JOIN users t ON l.entity_type = 'user' AND t.id = l.entity_id
    WHERE l.action NOT LIKE '%.read' AND l.action NOT LIKE '%.observe'
    ORDER BY l.created_at DESC, l.id DESC LIMIT ${LIMIT}
  `)) {
    const isUser = str(row.entity_type) === 'user';
    events.push({
      id: `admin:${str(row.id)}`, kind: 'admin', at: str(row.created_at), action: str(row.action), details: details(row.details_json),
      actorName: str(row.actor_name) || 'администратор', targetName: isUser ? str(row.target_name) || str(row.entity_id) : '',
      ...(isUser ? { userId: str(row.entity_id) } : {}),
    });
  }
  for (const row of repository.all(`
    SELECT e.id, e.user_id, e.status, e.created_at, u.name, c.title
    FROM contest_entries e LEFT JOIN users u ON u.id = e.user_id LEFT JOIN contests c ON c.id = e.contest_id
    ORDER BY e.created_at DESC LIMIT ${LIMIT}
  `)) {
    events.push({ id: `contest:${str(row.id)}`, kind: 'contest', at: str(row.created_at), name: str(row.name), contestTitle: str(row.title), status: str(row.status), userId: str(row.user_id) });
  }
  for (const row of repository.all(`SELECT id, subject, created_at, completed_at, accepted_count, failed_count FROM mailing_campaigns ORDER BY created_at DESC LIMIT 5`)) {
    events.push({ id: `mailing:${str(row.id)}`, kind: 'mailing', at: str(row.completed_at) || str(row.created_at), subject: str(row.subject), accepted: Number(row.accepted_count ?? 0), failed: Number(row.failed_count ?? 0) });
  }
  return events
    .filter(event => event.at)
    .sort((left, right) => (left.at < right.at ? 1 : left.at > right.at ? -1 : 0))
    .slice(0, LIMIT);
}
