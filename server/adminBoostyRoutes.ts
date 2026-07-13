import { Router, type Request, type Response } from 'express';

export type AdminBoostyDependencies = {
  adminAuth: (request: Request) => unknown | null;
  getStatus: () => Promise<unknown>;
  getSubscribers: (includeInactive: boolean) => Promise<unknown>;
  configured: () => boolean;
  setPrivateNoStore: (response: Response) => void;
  now?: () => Date;
};

const STATUS_ERROR = 'Boosty API временно недоступен.';
const SUBSCRIBERS_ERROR = 'Не удалось загрузить подписчиков Boosty';

function safeStatusPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid Boosty status payload');
  const payload = { ...value as Record<string, unknown> };
  delete payload.error;
  delete payload.detail;
  delete payload.stack;
  if (payload.lastErrorMessage) payload.lastErrorMessage = STATUS_ERROR;
  return payload;
}

function unavailableStatus(configured: boolean, checkedAt: string) {
  return {
    configured,
    ok: false,
    importStatus: 'error',
    source: 'unavailable',
    stale: true,
    snapshotAgeSeconds: null,
    lastErrorCategory: 'request-failed',
    lastErrorMessage: STATUS_ERROR,
    warnings: ['boosty-api-unavailable'],
    summary: {},
    checkedAt,
  };
}

export function createAdminBoostyRouter(dependencies: AdminBoostyDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? (() => new Date());
  const authorize = (request: Request, response: Response) => {
    dependencies.setPrivateNoStore(response);
    const admin = dependencies.adminAuth(request);
    if (!admin) response.status(403).json({ error: 'Недостаточно прав' });
    return Boolean(admin);
  };

  router.get('/admin/boosty/status', async (request, response) => {
    if (!authorize(request, response)) return;
    try {
      return response.json(safeStatusPayload(await dependencies.getStatus()));
    } catch {
      return response.status(502).json(unavailableStatus(dependencies.configured(), now().toISOString()));
    }
  });

  router.get('/admin/boosty/subscribers', async (request, response) => {
    if (!authorize(request, response)) return;
    const includeInactive = String(request.query.includeInactive ?? '1') !== '0';
    try {
      return response.json(await dependencies.getSubscribers(includeInactive));
    } catch {
      return response.status(502).json({
        configured: dependencies.configured(),
        source: 'unavailable',
        stale: true,
        subscribers: [],
        summary: {},
        levels: {},
        fetchedAt: now().toISOString(),
        error: SUBSCRIBERS_ERROR,
      });
    }
  });

  return router;
}
