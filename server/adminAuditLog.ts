/** Writer and readers of `admin_audit_log` (docs/specs/admin-crm.md), shared by the admin routers. */

type AuditDetails = Record<string, unknown>;

export type AdminAuditDatabase = {
  run: (sql: string, ...params: unknown[]) => unknown;
  all: <T>(sql: string, ...params: unknown[]) => T[];
};

type ParserControlAuditRow = {
  id: number;
  actor_user_id: string;
  actor_name: string | null;
  action: string;
  entity_id: string;
  details_json: string;
  created_at: string;
};

function detailsObject(value: unknown): AuditDetails {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function createAdminAuditLog(
  database: AdminAuditDatabase,
  options: { now?: () => Date; warn?: (message: string, error: unknown) => void } = {},
) {
  const now = options.now ?? (() => new Date());
  const warn = options.warn ?? ((message, error) => console.warn(message, error instanceof Error ? error.message : error));

  function record(actorUserId: string, action: string, entityType: string, entityId: string, details: AuditDetails = {}) {
    database.run(`
      INSERT INTO admin_audit_log (actor_user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, actorUserId, action, entityType, entityId, JSON.stringify(details), now().toISOString());
  }

  return {
    record,
    /**
     * For routers that audit after the change is stored: a failed insert is logged and swallowed,
     * so it cannot turn a stored change into an error response or skip the router's cleanup.
     */
    contentRecorder(entityType: string) {
      return (actor: { id: string }, action: string, entityId: string, details: AuditDetails = {}) => {
        try {
          record(actor.id, action, entityType, entityId, details);
        } catch (error) {
          warn(`[admin-audit] ${action} ${entityId} was not recorded:`, error);
        }
      };
    },
    listParserControl(limit: number) {
      const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 30));
      const rows = database.all<ParserControlAuditRow>(`
        SELECT
          audit.id,
          audit.actor_user_id,
          users.name AS actor_name,
          audit.action,
          audit.entity_id,
          audit.details_json,
          audit.created_at
        FROM admin_audit_log AS audit
        LEFT JOIN users ON users.id = audit.actor_user_id
        WHERE audit.entity_type = 'parser-control'
        ORDER BY audit.created_at DESC, audit.id DESC
        LIMIT ?
      `, safeLimit);
      return rows.map(row => ({
        id: String(row.id),
        actor: {
          id: String(row.actor_user_id || ''),
          name: String(row.actor_name || '').trim(),
        },
        action: String(row.action || ''),
        entityId: String(row.entity_id || ''),
        details: detailsObject(row.details_json),
        createdAt: String(row.created_at || ''),
      }));
    },
  };
}
