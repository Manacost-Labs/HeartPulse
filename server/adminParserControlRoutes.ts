import { Router, type Request, type RequestHandler, type Response } from 'express';
import {
  createParserRunReconciler,
  type ParserCacheInvalidationContext,
} from './parserRunReconciler.js';

type AdminIdentity = { id: string };
export type ParserPublicationMode = 'stable' | 'early';

export type ParserPolicyUpdate = {
  mode: ParserPublicationMode;
  earlyUntil: string | null;
  reason: string;
  expectedRevision: number;
  updatedBy?: string;
};

export type ParserSectionUpdate = {
  sections: Record<string, boolean>;
  expectedRevision: number;
  updatedBy?: string;
};

export type ParserRunRequest = {
  sectionIds: string[];
  sourceIds: string[];
  reason: string;
  requestedBy?: string;
};

export type AdminParserControlClient = {
  configured: boolean;
  getControl: () => Promise<unknown>;
  updatePolicy: (payload: ParserPolicyUpdate) => Promise<unknown>;
  updateSections: (payload: ParserSectionUpdate) => Promise<unknown>;
  createRun: (payload: ParserRunRequest) => Promise<unknown>;
  listRuns: () => Promise<unknown>;
};

export type AdminParserControlDependencies = {
  adminGuard: RequestHandler;
  adminAuth: (request: Request) => AdminIdentity | null;
  client: AdminParserControlClient;
  invalidateParserDataCaches: (context: ParserCacheInvalidationContext) => Promise<void>;
  setPrivateNoStore: (response: Response) => void;
  runMonitor?: {
    wait?: (milliseconds: number) => Promise<void>;
    now?: () => number;
    pollIntervalMs?: number;
    timeoutMs?: number;
  };
  onWarning?: (scope: 'cache-invalidation' | 'run-monitor', error: unknown) => void;
  recordAudit?: (
    actor: AdminIdentity,
    action: string,
    entityId: string,
    details?: Record<string, unknown>,
  ) => void;
};

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,95}$/i;

function configuredGuard(client: AdminParserControlClient): RequestHandler {
  return (_request, response, next) => {
    if (client.configured) return next();
    return response.status(503).json({
      code: 'HS_DATA_API_NOT_CONFIGURED',
      error: 'Управление парсерами ещё не подключено к API данных',
    });
  };
}

function actorOrUnauthorized(
  request: Request,
  response: Response,
  adminAuth: AdminParserControlDependencies['adminAuth'],
): AdminIdentity | null {
  const actor = adminAuth(request);
  if (!actor) response.status(401).json({ error: 'Требуется вход' });
  return actor;
}

function normalizedRevision(value: unknown): number | null {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 1 ? revision : null;
}

function normalizedIds(value: unknown, maximum = 100): string[] | null {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maximum) return null;
  const ids = [...new Set(value.map(item => String(item ?? '').trim()).filter(Boolean))];
  return ids.every(id => ID_PATTERN.test(id)) ? ids : null;
}

function upstreamError(response: Response, error: unknown): Response {
  const status = typeof (error as { status?: unknown })?.status === 'number'
    ? Number((error as { status: number }).status)
    : 502;
  const message = error instanceof Error && error.message
    ? error.message
    : 'API данных временно недоступен';
  return response.status(status >= 400 && status < 600 ? status : 502).json({ error: message });
}

const CACHE_INVALIDATION_WARNING = {
  code: 'CACHE_INVALIDATION_FAILED',
  message: 'Настройка сохранена, но не все кеши удалось очистить. Повторите обновление статусов.',
};

function withWarning(result: unknown, warning: typeof CACHE_INVALIDATION_WARNING): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return { data: result, warnings: [warning] };
  }
  const source = result as Record<string, unknown>;
  const existing = Array.isArray(source.warnings) ? source.warnings : [];
  return { ...source, warnings: [...existing, warning] };
}

export function createAdminParserControlRouter(dependencies: AdminParserControlDependencies): Router {
  const router = Router();
  const ensureConfigured = configuredGuard(dependencies.client);
  const runReconciler = createParserRunReconciler({
    listRuns: dependencies.client.listRuns,
    invalidate: dependencies.invalidateParserDataCaches,
    ...dependencies.runMonitor,
    onWarning: (_scope, error) => dependencies.onWarning?.('run-monitor', error),
  });

  router.use('/admin/parser-control', dependencies.adminGuard, (_request, response, next) => {
    dependencies.setPrivateNoStore(response);
    next();
  }, ensureConfigured);

  router.get('/admin/parser-control', async (_request, response) => {
    try {
      return response.json(await dependencies.client.getControl());
    } catch (error) {
      return upstreamError(response, error);
    }
  });

  router.patch('/admin/parser-control/policy', async (request, response) => {
    const actor = actorOrUnauthorized(request, response, dependencies.adminAuth);
    if (!actor) return;
    const mode = String(request.body?.mode ?? '') as ParserPublicationMode;
    const expectedRevision = normalizedRevision(request.body?.expectedRevision);
    const earlyUntil = request.body?.earlyUntil == null ? null : String(request.body.earlyUntil).trim();
    const reason = String(request.body?.reason ?? '').trim().slice(0, 300);
    if (!['stable', 'early'].includes(mode) || expectedRevision == null) {
      return response.status(400).json({ error: 'Проверьте режим публикации и версию настроек' });
    }
    if (mode === 'early') {
      const until = Date.parse(earlyUntil ?? '');
      if (!Number.isFinite(until) || until <= Date.now() || reason.length < 3) {
        return response.status(400).json({ error: 'Для ранней меты укажите срок и причину' });
      }
    }
    const payload: ParserPolicyUpdate = {
      mode,
      earlyUntil: mode === 'early' ? earlyUntil : null,
      reason,
      expectedRevision,
      updatedBy: actor.id,
    };
    try {
      const result = await dependencies.client.updatePolicy(payload);
      dependencies.recordAudit?.(actor, 'parser-control.policy.update', mode, {
        earlyUntil: payload.earlyUntil,
        reason: payload.reason,
        expectedRevision,
      });
      try {
        await dependencies.invalidateParserDataCaches({ reason: 'policy-change' });
        return response.json(result);
      } catch (invalidationError) {
        dependencies.onWarning?.('cache-invalidation', invalidationError);
        dependencies.recordAudit?.(actor, 'parser-control.cache-invalidation.warning', mode, {
          reason: invalidationError instanceof Error ? invalidationError.message : String(invalidationError),
        });
        return response.json(withWarning(result, CACHE_INVALIDATION_WARNING));
      }
    } catch (error) {
      return upstreamError(response, error);
    }
  });

  router.patch('/admin/parser-control/sections', async (request, response) => {
    const actor = actorOrUnauthorized(request, response, dependencies.adminAuth);
    if (!actor) return;
    const expectedRevision = normalizedRevision(request.body?.expectedRevision);
    const rawSections = request.body?.sections;
    if (expectedRevision == null || !rawSections || typeof rawSections !== 'object' || Array.isArray(rawSections)) {
      return response.status(400).json({ error: 'Не удалось прочитать настройки разделов' });
    }
    const entries = Object.entries(rawSections as Record<string, unknown>);
    if (!entries.length || entries.length > 100 || entries.some(([id, enabled]) => !ID_PATTERN.test(id) || typeof enabled !== 'boolean')) {
      return response.status(400).json({ error: 'Список разделов содержит неизвестные значения' });
    }
    const sections = Object.fromEntries(entries) as Record<string, boolean>;
    try {
      const result = await dependencies.client.updateSections({ sections, expectedRevision, updatedBy: actor.id });
      dependencies.recordAudit?.(actor, 'parser-control.sections.update', 'batch', {
        sections,
        expectedRevision,
      });
      return response.json(result);
    } catch (error) {
      return upstreamError(response, error);
    }
  });

  router.get('/admin/parser-control/runs', async (_request, response) => {
    try {
      return response.json(await dependencies.client.listRuns());
    } catch (error) {
      return upstreamError(response, error);
    }
  });

  router.post('/admin/parser-control/runs', async (request, response) => {
    const actor = actorOrUnauthorized(request, response, dependencies.adminAuth);
    if (!actor) return;
    const sectionIds = normalizedIds(request.body?.sectionIds);
    const sourceIds = normalizedIds(request.body?.sourceIds);
    const reason = String(request.body?.reason ?? '').trim().slice(0, 300);
    if (!sectionIds || !sourceIds || (!sectionIds.length && !sourceIds.length)) {
      return response.status(400).json({ error: 'Выберите хотя бы один раздел или источник' });
    }
    try {
      const result = await dependencies.client.createRun({ sectionIds, sourceIds, reason, requestedBy: actor.id });
      dependencies.recordAudit?.(actor, 'parser-control.run.create', 'batch', {
        sectionIds,
        sourceIds,
        reason,
      });
      runReconciler.observe(result);
      return response.status(202).json(result);
    } catch (error) {
      return upstreamError(response, error);
    }
  });

  return router;
}
