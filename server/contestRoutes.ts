import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';

type Row = Record<string, unknown>;
export type ContestUser = {
  id: string;
  email: string;
  contactVkUrl?: string;
  contactTelegram?: string;
  contactEmail?: string;
  telegramUsername?: string;
};
type ContestSubscription = {
  entitlements: { contests: boolean };
};

export type ContestRouterDependencies<User extends ContestUser = ContestUser> = {
  userAuth: (request: Request) => User | null;
  repository: {
    all: (sql: string, ...params: string[]) => Row[];
    get: (sql: string, ...params: string[]) => Row | null;
    run: (sql: string, ...params: string[]) => unknown;
  };
  serializeContest: (row: Row, entry?: Row) => unknown;
  serializeUser: (user: User) => unknown;
  refreshSubscription: (user: User) => Promise<ContestSubscription>;
  contestStatus: (status: string, startsAt?: string | null, endsAt?: string | null) => string;
  setPrivateNoStore: (response: Response) => void;
  contestAdminUserId: string;
  isRealEmail: (email: string) => boolean;
  createEntryId?: () => string;
  now?: () => Date;
};

const PUBLIC_CONTESTS_SQL = "SELECT * FROM contests WHERE status NOT IN ('draft', 'cancelled') ORDER BY COALESCE(ends_at, created_at) DESC, created_at DESC";
const USER_ENTRIES_SQL = 'SELECT contest_id, status, created_at FROM contest_entries WHERE user_id = ?';
const CONTEST_SQL = 'SELECT * FROM contests WHERE id = ?';
const UPSERT_ENTRY_SQL = `
  INSERT INTO contest_entries (id, contest_id, user_id, email, contact_json, subscription_json, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, 'approved', ?)
  ON CONFLICT(contest_id, user_id) DO UPDATE SET
    email = excluded.email,
    contact_json = excluded.contact_json,
    subscription_json = excluded.subscription_json,
    status = 'approved'
`;
const ENTRY_SQL = 'SELECT status, created_at FROM contest_entries WHERE contest_id = ? AND user_id = ?';
const HISTORY_SQL = `
  SELECT e.id AS entry_id, e.contest_id, e.status AS entry_status, e.created_at AS joined_at,
    c.title, c.prize, c.image_url, c.starts_at, c.ends_at, c.status AS contest_status, c.winners_json
  FROM contest_entries e
  JOIN contests c ON c.id = e.contest_id
  WHERE e.user_id = ?
  ORDER BY e.created_at DESC
`;

function contestId(value: unknown): string | null {
  const id = String(value ?? '').trim();
  return id && id.length <= 120 && !/[\u0000-\u001f\u007f/\\]/.test(id) ? id : null;
}

function jsonStringArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function createContestRouter<User extends ContestUser>(dependencies: ContestRouterDependencies<User>): Router {
  const router = Router();
  const now = dependencies.now ?? (() => new Date());
  const createEntryId = dependencies.createEntryId ?? (() => `entry_${randomBytes(8).toString('hex')}`);

  router.get('/contests', (request, response) => {
    const user = dependencies.userAuth(request);
    if (user) dependencies.setPrivateNoStore(response);
    try {
      const entries = user
        ? new Map(dependencies.repository.all(USER_ENTRIES_SQL, user.id).map(row => [String(row.contest_id), row]))
        : new Map<string, Row>();
      const contests = dependencies.repository.all(PUBLIC_CONTESTS_SQL)
        .map(row => dependencies.serializeContest(row, entries.get(String(row.id))));
      return response.json({ contests, user: user ? dependencies.serializeUser(user) : null });
    } catch {
      return response.status(500).json({ error: 'Не удалось загрузить конкурсы' });
    }
  });

  router.post('/contests/:contestId/join', async (request, response) => {
    dependencies.setPrivateNoStore(response);
    const user = dependencies.userAuth(request);
    if (!user) return response.status(401).json({ error: 'Войдите в профиль, чтобы участвовать в конкурсе' });
    const id = contestId(request.params.contestId);
    if (!id) return response.status(400).json({ error: 'Некорректный ID конкурса' });
    try {
      const contest = dependencies.repository.get(CONTEST_SQL, id);
      if (!contest || contest.status === 'draft' || contest.status === 'cancelled') {
        return response.status(404).json({ error: 'Конкурс не найден' });
      }
      const effectiveStatus = dependencies.contestStatus(String(contest.status || ''),
        contest.starts_at ? String(contest.starts_at) : null,
        contest.ends_at ? String(contest.ends_at) : null);
      if (effectiveStatus === 'completed') return response.status(409).json({ error: 'Конкурс уже завершен' });
      if (effectiveStatus === 'planned') return response.status(409).json({ error: 'Конкурс еще не начался' });

      let subscription: ContestSubscription;
      try {
        subscription = await dependencies.refreshSubscription(user);
      } catch {
        return response.status(503).json({ error: 'Не удалось проверить подписку. Попробуйте ещё раз.' });
      }
      if (!subscription.entitlements?.contests && user.id !== dependencies.contestAdminUserId) {
        return response.status(403).json({
          error: 'Для участия нужна подписка Манакоста с доступом к конкурсам',
          subscription,
        });
      }

      const timestamp = now().toISOString();
      const contact = {
        vk: user.contactVkUrl ?? '',
        telegram: user.contactTelegram || user.telegramUsername || '',
        email: user.contactEmail || (dependencies.isRealEmail(user.email) ? user.email : ''),
      };
      dependencies.repository.run(UPSERT_ENTRY_SQL,
        createEntryId(), id, user.id, user.email, JSON.stringify(contact), JSON.stringify(subscription), timestamp);
      const entry = dependencies.repository.get(ENTRY_SQL, id, user.id);
      return response.json({
        success: true,
        entry: { status: String(entry?.status || 'approved'), createdAt: String(entry?.created_at || timestamp) },
        subscription,
      });
    } catch {
      return response.status(500).json({ error: 'Не удалось подать заявку на конкурс' });
    }
  });

  router.get('/profile/contest-history', (request, response) => {
    dependencies.setPrivateNoStore(response);
    const user = dependencies.userAuth(request);
    if (!user) return response.status(401).json({ error: 'Требуется вход' });
    try {
      const entries = dependencies.repository.all(HISTORY_SQL, user.id).map(row => {
        const winners = jsonStringArray(row.winners_json);
        return {
          id: String(row.entry_id || ''),
          contestId: String(row.contest_id || ''),
          title: String(row.title || ''),
          prize: String(row.prize || ''),
          imageUrl: String(row.image_url || ''),
          status: dependencies.contestStatus(String(row.contest_status || ''),
            row.starts_at ? String(row.starts_at) : null,
            row.ends_at ? String(row.ends_at) : null),
          entryStatus: String(row.entry_status || ''),
          joinedAt: String(row.joined_at || ''),
          startsAt: row.starts_at ? String(row.starts_at) : '',
          endsAt: row.ends_at ? String(row.ends_at) : '',
          isWinner: winners.includes(user.id),
        };
      });
      return response.json({ entries });
    } catch {
      return response.status(500).json({ error: 'Не удалось загрузить историю конкурсов' });
    }
  });

  return router;
}
