import { Router, type Request, type RequestHandler, type Response } from 'express';
import {
  createParserRunReconciler,
  type ParserCacheInvalidationContext,
  type ParserRunReconciler,
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
  csrfAllowed: (request: Request) => boolean;
  client: AdminParserControlClient;
  invalidateParserDataCaches: (context: ParserCacheInvalidationContext) => Promise<void>;
  setPrivateNoStore: (response: Response) => void;
  runReconciler?: ParserRunReconciler;
  runMonitor?: {
    wait?: (milliseconds: number) => Promise<void>;
    now?: () => number;
    pollIntervalMs?: number;
    timeoutMs?: number;
  };
  onWarning?: (
    scope: 'cache-invalidation' | 'run-monitor' | 'audit',
    error: unknown,
    context?: { requestId: string | null; action?: string },
  ) => void;
  recordAudit?: (
    actor: AdminIdentity,
    action: string,
    entityId: string,
    details?: Record<string, unknown>,
  ) => void;
  listAudit?: (limit: number) => Promise<unknown[]> | unknown[];
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

function csrfAllowedOrRejected(
  request: Request,
  response: Response,
  csrfAllowed: AdminParserControlDependencies['csrfAllowed'],
): boolean {
  if (csrfAllowed(request)) return true;
  response.status(403).json({ error: 'Запрос отклонён: обновите страницу и повторите действие' });
  return false;
}

function normalizedRevision(value: unknown): number | null {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 1 ? revision : null;
}

function responseRevision(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const revision = Number((value as Record<string, unknown>).revision);
  return Number.isInteger(revision) && revision >= 1 ? revision : null;
}

function responseRun(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const root = value as Record<string, unknown>;
  const candidate = root.run ?? value;
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : {};
}

function normalizedIds(value: unknown, maximum = 100): string[] | null {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maximum) return null;
  const ids = [...new Set(value.map(item => String(item ?? '').trim()).filter(Boolean))];
  return ids.every(id => ID_PATTERN.test(id)) ? ids : null;
}

const SAFE_UPSTREAM_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;

function upstreamError(response: Response, error: unknown): Response {
  const source = error as { status?: unknown; code?: unknown };
  const upstreamStatus = typeof source?.status === 'number'
    ? Number(source.status)
    : 502;
  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return response.status(502).json({
      code: 'HS_DATA_API_AUTH_FAILED',
      error: 'Сайт не смог авторизоваться в API данных. Проверьте серверный ключ HS_DATA_API_ADMIN_KEY.',
    });
  }
  const status = upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : 502;
  const upstreamCode = typeof source?.code === 'string' ? source.code.trim() : '';
  const code = SAFE_UPSTREAM_CODE_PATTERN.test(upstreamCode) ? upstreamCode : null;
  const message = error instanceof Error && error.message
    ? error.message
    : 'API данных временно недоступен';
  return response.status(status).json({ ...(code ? { code } : {}), error: message });
}

const CACHE_INVALIDATION_WARNING = {
  code: 'CACHE_INVALIDATION_FAILED',
  message: 'Настройка сохранена, но не все кеши удалось очистить. Повторите обновление статусов.',
};

const AUDIT_WRITE_WARNING = {
  code: 'AUDIT_WRITE_FAILED',
  message: 'Операция выполнена, но запись в журнал действий не создана. Сообщите разработчику.',
};

const RUN_MONITOR_WARNING = {
  code: 'RUN_MONITOR_FAILED',
  message: 'Запуск принят, но автоматическое наблюдение не включилось. Обновляйте историю вручную.',
};

type ParserControlResponseWarning = { code: string; message: string; requestId?: string };
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function requestIdOf(request: Request, response: Response): string | null {
  const localId = String(response.locals.requestId ?? '').trim();
  if (REQUEST_ID_PATTERN.test(localId)) return localId;
  const header = request.headers['x-request-id'];
  const candidate = typeof header === 'string'
    ? header.trim()
    : Array.isArray(header) && header.length === 1 ? String(header[0] ?? '').trim() : '';
  return REQUEST_ID_PATTERN.test(candidate) ? candidate : null;
}

function reportWarningBestEffort(
  dependencies: AdminParserControlDependencies,
  scope: 'cache-invalidation' | 'run-monitor' | 'audit',
  error: unknown,
  context?: { requestId: string | null; action?: string },
): void {
  try {
    dependencies.onWarning?.(scope, error, context);
  } catch {
    // Warning reporters must never roll back or mask a completed admin operation.
  }
}

function recordAuditBestEffort(
  dependencies: AdminParserControlDependencies,
  request: Request,
  response: Response,
  actor: AdminIdentity,
  action: string,
  entityId: string,
  details?: Record<string, unknown>,
): ParserControlResponseWarning | null {
  try {
    dependencies.recordAudit?.(actor, action, entityId, details);
    return null;
  } catch (error) {
    const requestId = requestIdOf(request, response);
    reportWarningBestEffort(dependencies, 'audit', error, { requestId, action });
    return { ...AUDIT_WRITE_WARNING, ...(requestId ? { requestId } : {}) };
  }
}

function withWarnings(result: unknown, warnings: ParserControlResponseWarning[]): unknown {
  if (!warnings.length) return result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return { data: result, warnings };
  }
  const source = result as Record<string, unknown>;
  const existing = Array.isArray(source.warnings) ? source.warnings : [];
  const combined: unknown[] = [];
  const indexByKey = new Map<string, number>();
  for (const warning of [...existing, ...warnings]) {
    const item = warning && typeof warning === 'object' && !Array.isArray(warning)
      ? warning as Record<string, unknown>
      : null;
    const code = String(item?.code ?? '').trim();
    const requestId = String(item?.requestId ?? item?.request_id ?? '').trim();
    const message = String(item?.message ?? warning ?? '').trim();
    const key = code
      ? `code:${code}`
      : requestId
        ? `request:${requestId}`
        : `message:${message}`;
    const duplicateIndex = indexByKey.get(key);
    if (duplicateIndex == null) {
      indexByKey.set(key, combined.length);
      combined.push(warning);
      continue;
    }
    const current = combined[duplicateIndex];
    const currentItem = current && typeof current === 'object' && !Array.isArray(current)
      ? current as Record<string, unknown>
      : null;
    const currentRequestId = String(currentItem?.requestId ?? currentItem?.request_id ?? '').trim();
    if (currentItem && requestId && !currentRequestId) {
      combined[duplicateIndex] = { ...currentItem, requestId };
    }
  }
  return { ...source, warnings: combined };
}

export function createAdminParserControlRouter(dependencies: AdminParserControlDependencies): Router {
  const router = Router();
  const ensureConfigured = configuredGuard(dependencies.client);
  const runReconciler = dependencies.runReconciler ?? createParserRunReconciler({
    listRuns: dependencies.client.listRuns,
    invalidate: dependencies.invalidateParserDataCaches,
    ...dependencies.runMonitor,
    onWarning: (_scope, error) => reportWarningBestEffort(dependencies, 'run-monitor', error),
  });

  router.use('/admin/parser-control', (_request, response, next) => {
    dependencies.setPrivateNoStore(response);
    next();
  }, dependencies.adminGuard);

  router.get('/admin/parser-control/audit', async (request, response) => {
    if (!dependencies.listAudit) {
      return response.status(503).json({
        code: 'PARSER_AUDIT_UNAVAILABLE',
        error: 'Журнал действий временно недоступен',
      });
    }
    const requestedLimit = Number(request.query.limit);
    const limit = Number.isInteger(requestedLimit)
      ? Math.max(1, Math.min(100, requestedLimit))
      : 30;
    try {
      const entries = await dependencies.listAudit(limit);
      return response.json({ entries: Array.isArray(entries) ? entries : [] });
    } catch (error) {
      reportWarningBestEffort(dependencies, 'audit', error, {
        requestId: requestIdOf(request, response),
        action: 'parser-control.audit.read',
      });
      return response.status(503).json({
        code: 'PARSER_AUDIT_UNAVAILABLE',
        error: 'Журнал действий временно недоступен',
      });
    }
  });

  router.use('/admin/parser-control', ensureConfigured);

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
    if (!csrfAllowedOrRejected(request, response, dependencies.csrfAllowed)) return;
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
    let result: unknown;
    try {
      result = await dependencies.client.updatePolicy(payload);
    } catch (error) {
      return upstreamError(response, error);
    }
    const warnings: ParserControlResponseWarning[] = [];
    const revision = responseRevision(result);
    const requestId = requestIdOf(request, response);
    const auditWarning = recordAuditBestEffort(
      dependencies,
      request,
      response,
      actor,
      'parser-control.policy.update',
      mode,
      {
        summary: mode === 'early' ? 'Включена ранняя мета' : 'Включена стабильная мета',
        requestId,
        revision,
        before: { revision: expectedRevision },
        after: {
          revision,
          mode,
          earlyUntil: payload.earlyUntil,
          reason: payload.reason,
        },
        earlyUntil: payload.earlyUntil,
        reason: payload.reason,
        expectedRevision,
      },
    );
    if (auditWarning) warnings.push(auditWarning);
    try {
      await dependencies.invalidateParserDataCaches({ reason: 'policy-change' });
    } catch (invalidationError) {
      reportWarningBestEffort(dependencies, 'cache-invalidation', invalidationError, {
        requestId: requestIdOf(request, response),
        action: 'parser-control.policy.update',
      });
      warnings.push(CACHE_INVALIDATION_WARNING);
      const warningAuditFailure = recordAuditBestEffort(
        dependencies,
        request,
        response,
        actor,
        'parser-control.cache-invalidation.warning',
        mode,
        {
          summary: 'Не удалось очистить все кеши после смены режима',
          requestId,
          revision,
          before: { revision: expectedRevision },
          after: { revision, cacheInvalidation: 'failed' },
          reason: invalidationError instanceof Error ? invalidationError.message : String(invalidationError),
        },
      );
      if (warningAuditFailure && !warnings.some(warning => warning.code === warningAuditFailure.code)) {
        warnings.push(warningAuditFailure);
      }
    }
    return response.json(withWarnings(result, warnings));
  });

  router.patch('/admin/parser-control/sections', async (request, response) => {
    const actor = actorOrUnauthorized(request, response, dependencies.adminAuth);
    if (!actor) return;
    if (!csrfAllowedOrRejected(request, response, dependencies.csrfAllowed)) return;
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
    let result: unknown;
    try {
      result = await dependencies.client.updateSections({ sections, expectedRevision, updatedBy: actor.id });
    } catch (error) {
      return upstreamError(response, error);
    }
    const revision = responseRevision(result);
    const requestId = requestIdOf(request, response);
    const enabledCount = entries.filter(([, enabled]) => enabled).length;
    const disabledCount = entries.length - enabledCount;
    const auditWarning = recordAuditBestEffort(
      dependencies,
      request,
      response,
      actor,
      'parser-control.sections.update',
      'batch',
      {
        summary: `Автообновление: включено ${enabledCount}, выключено ${disabledCount}`,
        requestId,
        revision,
        before: { revision: expectedRevision },
        after: { revision, sections },
        sections,
        expectedRevision,
      },
    );
    return response.json(withWarnings(result, auditWarning ? [auditWarning] : []));
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
    if (!csrfAllowedOrRejected(request, response, dependencies.csrfAllowed)) return;
    const sectionIds = normalizedIds(request.body?.sectionIds);
    const sourceIds = normalizedIds(request.body?.sourceIds);
    const reason = String(request.body?.reason ?? '').trim().slice(0, 300);
    if (!sectionIds || !sourceIds || (!sectionIds.length && !sourceIds.length)) {
      return response.status(400).json({ error: 'Выберите хотя бы один раздел или источник' });
    }
    let result: unknown;
    try {
      result = await dependencies.client.createRun({ sectionIds, sourceIds, reason, requestedBy: actor.id });
    } catch (error) {
      return upstreamError(response, error);
    }
    const run = responseRun(result);
    const runId = String(run.id ?? '').trim() || 'batch';
    const requestId = requestIdOf(request, response);
    const warnings: ParserControlResponseWarning[] = [];
    const auditWarning = recordAuditBestEffort(
      dependencies,
      request,
      response,
      actor,
      'parser-control.run.create',
      runId,
      {
        summary: reason || 'Запущено ручное обновление данных',
        requestId,
        revision: null,
        before: { status: 'not-requested' },
        after: {
          runId: runId === 'batch' ? null : runId,
          status: String(run.status ?? '').trim() || null,
        },
        sectionIds,
        sourceIds,
        reason,
      },
    );
    if (auditWarning) warnings.push(auditWarning);
    try {
      runReconciler.observe(result);
    } catch (error) {
      reportWarningBestEffort(dependencies, 'run-monitor', error, {
        requestId: requestIdOf(request, response),
        action: 'parser-control.run.observe',
      });
      warnings.push(RUN_MONITOR_WARNING);
    }
    return response.status(202).json(withWarnings(result, warnings));
  });

  return router;
}
