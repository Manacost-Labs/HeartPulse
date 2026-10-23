import { Router, type Request, type Response } from 'express';

export type AdminBoostyDependencies = {
  adminAuth: (request: Request) => unknown | null;
  getStatus: () => Promise<unknown>;
  getSubscribers: (includeInactive: boolean) => Promise<unknown>;
  configured: () => boolean;
  setPrivateNoStore: (response: Response) => void;
  now?: () => Date;
  /** How long a successful boosty-auth answer is reused for admin reads (default one minute). */
  cacheMs?: number;
};

const DEFAULT_CACHE_MS = 60_000;

/**
 * Reuses one successful answer per key for a short time and shares a request already running.
 * boosty-auth reads the whole subscriber list from Boosty on every call, which took seconds; the
 * admin section, its preload and a second open tab now ask it once a minute at most. Failures are
 * never cached, and `fresh` (the section's «Обновить») always asks again.
 */
function createShortCache(now: () => Date, ttlMs: number) {
  const answers = new Map<string, { value: unknown; at: number }>();
  const running = new Map<string, Promise<unknown>>();
  return async (key: string, fresh: boolean, load: () => Promise<unknown>): Promise<unknown> => {
    const cached = answers.get(key);
    if (!fresh && cached && now().getTime() - cached.at < ttlMs) return cached.value;
    const pending = running.get(key);
    if (pending) return pending;
    const request = load()
      .then(value => {
        answers.set(key, { value, at: now().getTime() });
        return value;
      })
      .finally(() => running.delete(key));
    running.set(key, request);
    return request;
  };
}

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
  const cached = createShortCache(now, dependencies.cacheMs ?? DEFAULT_CACHE_MS);
  const wantsFresh = (request: Request) => String(request.query.fresh ?? '') === '1';
  const authorize = (request: Request, response: Response) => {
    dependencies.setPrivateNoStore(response);
    const admin = dependencies.adminAuth(request);
    if (!admin) response.status(403).json({ error: 'Недостаточно прав' });
    return Boolean(admin);
  };

  router.get('/admin/boosty/status', async (request, response) => {
    if (!authorize(request, response)) return;
    try {
      return response.json(safeStatusPayload(await cached('status', wantsFresh(request), dependencies.getStatus)));
    } catch {
      return response.status(502).json(unavailableStatus(dependencies.configured(), now().toISOString()));
    }
  });

  router.get('/admin/boosty/subscribers', async (request, response) => {
    if (!authorize(request, response)) return;
    const includeInactive = String(request.query.includeInactive ?? '1') !== '0';
    try {
      return response.json(await cached(`subscribers:${includeInactive}`, wantsFresh(request),
        () => dependencies.getSubscribers(includeInactive)));
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
