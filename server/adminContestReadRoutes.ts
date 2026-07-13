import { Router, type Request, type Response } from 'express';

type Row = Record<string, unknown>;

export type AdminContestReadDependencies = {
  adminAuth: (request: Request) => unknown | null;
  repository: { all: (sql: string, ...params: string[]) => Row[] };
  serializeContest: (row: Row) => unknown;
  serializeAdmin: (admin: unknown) => unknown;
  safeJsonObject: (value: unknown) => Record<string, unknown>;
  setPrivateNoStore: (response: Response) => void;
};

const CONTESTS_SQL = `
  SELECT c.*, COUNT(e.id) AS entries_count
  FROM contests c
  LEFT JOIN contest_entries e ON e.contest_id = c.id
  GROUP BY c.id
  ORDER BY c.created_at DESC
`;

const ENTRIES_SQL = `
  SELECT e.*, u.name, u.role, u.country, u.contact_vk_url, u.contact_telegram, u.contact_email, tg.username AS telegram_username
  FROM contest_entries e
  LEFT JOIN users u ON u.id = e.user_id
  LEFT JOIN (
    SELECT user_id, MAX(username) AS username
    FROM identities
    WHERE provider IN ('telegram', 'telegram_oidc')
    GROUP BY user_id
  ) tg ON tg.user_id = e.user_id
  WHERE e.contest_id = ?
  ORDER BY e.created_at DESC
`;

function contestId(value: unknown): string | null {
  const id = String(value ?? '').trim();
  return id && id.length <= 120 && !/[\u0000-\u001f\u007f/\\]/.test(id) ? id : null;
}

export function createAdminContestReadRouter(dependencies: AdminContestReadDependencies): Router {
  const router = Router();
  const authorize = (request: Request, response: Response) => {
    dependencies.setPrivateNoStore(response);
    const admin = dependencies.adminAuth(request);
    if (!admin) response.status(403).json({ error: 'Недостаточно прав' });
    return admin;
  };

  router.get('/admin/contests', (request, response) => {
    const admin = authorize(request, response);
    if (!admin) return;
    try {
      const contests = dependencies.repository.all(CONTESTS_SQL).map(row => ({
        ...dependencies.serializeContest(row) as Record<string, unknown>,
        entriesCount: Number(row.entries_count || 0),
      }));
      return response.json({ contests, admin: dependencies.serializeAdmin(admin) });
    } catch {
      return response.status(500).json({ error: 'Не удалось загрузить конкурсы' });
    }
  });

  router.get('/admin/contests/:contestId/entries', (request, response) => {
    if (!authorize(request, response)) return;
    const id = contestId(request.params.contestId);
    if (!id) return response.status(400).json({ error: 'Некорректный ID конкурса' });
    try {
      const entries = dependencies.repository.all(ENTRIES_SQL, id).map(row => ({
        id: String(row.id),
        contestId: String(row.contest_id),
        userId: String(row.user_id),
        profileId: String(row.user_id),
        name: String(row.name || ''),
        email: String(row.email || ''),
        status: String(row.status || ''),
        createdAt: String(row.created_at || ''),
        contact: dependencies.safeJsonObject(row.contact_json),
        subscription: dependencies.safeJsonObject(row.subscription_json),
        profileContacts: {
          vk: String(row.contact_vk_url || ''),
          telegram: String(row.contact_telegram || row.telegram_username || ''),
          email: String(row.contact_email || ''),
        },
      }));
      return response.json({ entries });
    } catch {
      return response.status(500).json({ error: 'Не удалось загрузить заявки конкурса' });
    }
  });

  return router;
}
