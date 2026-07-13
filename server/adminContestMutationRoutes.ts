import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';

export type AdminContestStatus = 'draft' | 'active' | 'planned' | 'completed' | 'cancelled';

export type AdminContestWrite = {
  id: string;
  title: string;
  description: string;
  prize: string;
  imageUrl: string;
  startsAt: string | null;
  endsAt: string | null;
  status: AdminContestStatus;
  createdBy: string;
  timestamp: string;
};

export type AdminContestMutationDependencies = {
  adminAuth: (request: Request) => { id: string } | null;
  normalizeDateTime: (value: unknown) => string | null;
  normalizeImageUrl: (value: unknown) => string;
  upsertContest: (contest: AdminContestWrite) => unknown;
  getContest: (contestId: string) => unknown | null;
  approvedWinnerIds: (contestId: string) => string[];
  publishWinners: (contestId: string, winners: string[], timestamp: string) => unknown;
  deleteContest: (contestId: string) => void;
  serializeContest: (row: unknown, includeRawWinners?: boolean) => unknown;
  setPrivateNoStore: (response: Response) => void;
  now?: () => Date;
  createId?: () => string;
};

class ContestMutationValidationError extends Error {}

const STATUSES = new Set<AdminContestStatus>(['draft', 'active', 'planned', 'completed', 'cancelled']);
const normalizeText = (value: unknown, limit: number) => String(value ?? '').trim().slice(0, limit);

function requireContestId(value: unknown): string {
  const id = normalizeText(value, 120);
  if (!id) throw new ContestMutationValidationError('Конкурс не найден');
  return id;
}

function parseContest(
  value: unknown,
  dependencies: AdminContestMutationDependencies,
  adminId: string,
  timestamp: string,
): AdminContestWrite {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContestMutationValidationError('Некорректные данные конкурса');
  }
  const body = value as Record<string, unknown>;
  const title = normalizeText(body.title, 160);
  if (!title) throw new ContestMutationValidationError('Укажите название конкурса');
  const startsAt = dependencies.normalizeDateTime(body.startsAt);
  const endsAt = dependencies.normalizeDateTime(body.endsAt);
  if ((normalizeText(body.startsAt, 80) && !startsAt) || (normalizeText(body.endsAt, 80) && !endsAt)) {
    throw new ContestMutationValidationError('Проверьте дату и время конкурса');
  }
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new ContestMutationValidationError('Финиш конкурса должен быть позже старта');
  }
  const rawImageUrl = normalizeText(body.imageUrl, 500);
  const imageUrl = dependencies.normalizeImageUrl(rawImageUrl);
  if (rawImageUrl && !imageUrl) {
    throw new ContestMutationValidationError('Обложка конкурса должна быть загружена через админку');
  }
  const requestedStatus = normalizeText(body.status, 24) as AdminContestStatus;
  return {
    id: normalizeText(body.id, 80) || (dependencies.createId?.() ?? `contest_${randomBytes(8).toString('hex')}`),
    title,
    description: normalizeText(body.description, 2_000),
    prize: normalizeText(body.prize, 240),
    imageUrl,
    startsAt,
    endsAt,
    status: STATUSES.has(requestedStatus) ? requestedStatus : 'active',
    createdBy: adminId,
    timestamp,
  };
}

function parseWinners(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .filter(item => typeof item === 'string' || typeof item === 'number')
    .map(item => normalizeText(item, 120))
    .filter(Boolean)
    .slice(0, 100);
  return Array.from(new Set(normalized));
}

export function createAdminContestMutationRouter(dependencies: AdminContestMutationDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? (() => new Date());
  const authorize = (request: Request, response: Response) => {
    dependencies.setPrivateNoStore(response);
    return dependencies.adminAuth(request);
  };

  router.post('/admin/contests', (request, response) => {
    const admin = authorize(request, response);
    if (!admin) return response.status(403).json({ error: 'Недостаточно прав' });
    try {
      const contest = parseContest(request.body, dependencies, admin.id, now().toISOString());
      const row = dependencies.upsertContest(contest);
      return response.json({ success: true, contest: dependencies.serializeContest(row) });
    } catch (error) {
      if (error instanceof ContestMutationValidationError) return response.status(400).json({ error: error.message });
      return response.status(500).json({ error: 'Не удалось сохранить конкурс' });
    }
  });

  router.post('/admin/contests/:contestId/winners', (request, response) => {
    const admin = authorize(request, response);
    if (!admin) return response.status(403).json({ error: 'Недостаточно прав' });
    try {
      const contestId = requireContestId(request.params.contestId);
      if (!dependencies.getContest(contestId)) return response.status(404).json({ error: 'Конкурс не найден' });
      const winners = parseWinners(request.body?.winners);
      if (!winners.length) {
        return response.status(400).json({ error: 'Укажите хотя бы одного победителя из заявок конкурса' });
      }
      const allowed = new Set(dependencies.approvedWinnerIds(contestId));
      const invalid = winners.filter(id => !allowed.has(id));
      if (invalid.length) {
        return response.status(400).json({ error: `Победители должны быть ID участников этого конкурса: ${invalid.join(', ')}` });
      }
      const row = dependencies.publishWinners(contestId, winners, now().toISOString());
      return response.json({ success: true, contest: dependencies.serializeContest(row, true) });
    } catch (error) {
      if (error instanceof ContestMutationValidationError) return response.status(400).json({ error: error.message });
      return response.status(500).json({ error: 'Не удалось сохранить победителей' });
    }
  });

  router.delete('/admin/contests/:contestId', (request, response) => {
    const admin = authorize(request, response);
    if (!admin) return response.status(403).json({ error: 'Недостаточно прав' });
    try {
      const contestId = requireContestId(request.params.contestId);
      if (!dependencies.getContest(contestId)) return response.status(404).json({ error: 'Конкурс не найден' });
      dependencies.deleteContest(contestId);
      return response.json({ success: true, deletedId: contestId });
    } catch (error) {
      if (error instanceof ContestMutationValidationError) return response.status(400).json({ error: error.message });
      return response.status(500).json({ error: 'Не удалось удалить конкурс' });
    }
  });

  return router;
}
