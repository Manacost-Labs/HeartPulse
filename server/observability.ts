import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type express from 'express';
import type { HttpMetrics } from './metrics.js';

export type StructuredLogRecord = Record<string, string | number | boolean | null>;
export type StructuredLogWriter = (line: string) => void;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ERROR_CODE_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;
type RequestContext = { requestId: string; active: boolean };
const requestContext = new AsyncLocalStorage<RequestContext>();

function defaultWriter(line: string): void {
  process.stdout.write(`${line}\n`);
}

export function requestIdFromHeader(value: unknown): string {
  const candidate = Array.isArray(value)
    ? (value.length === 1 ? String(value[0] ?? '').trim() : '')
    : String(value ?? '').trim();
  return REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();
}

export function currentRequestId(): string | null {
  const context = requestContext.getStore();
  return context?.active ? context.requestId : null;
}

/** Add correlation only to calls whose destination is controlled by Manacost. */
export function ownedApiHeaders(headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  const requestId = currentRequestId();
  if (requestId) result.set('X-Request-ID', requestId);
  return result;
}

export function normalizeRequestPath(originalUrl: string): string {
  let pathname = '/';
  try {
    pathname = new URL(originalUrl || '/', 'http://local.invalid').pathname;
  } catch {
    pathname = '/invalid-path';
  }
  return pathname
    .split('/')
    .map(segment => {
      if (!segment) return segment;
      if (/^\d+$/.test(segment)) return ':id';
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ':id';
      if (/^[A-Za-z0-9_-]{32,}$/.test(segment)) return ':token';
      if (segment.includes('@')) return ':value';
      return segment.slice(0, 96);
    })
    .join('/');
}

export function requestRouteTemplate(req: express.Request): string {
  const routePath = req.route?.path;
  if (typeof routePath === 'string') return routePath.slice(0, 160);
  return routePath ? '/regexp' : '/unmatched';
}

function emit(record: StructuredLogRecord, writer: StructuredLogWriter): void {
  writer(JSON.stringify({ timestamp: new Date().toISOString(), ...record }));
}

export function requestLoggingMiddleware(writer: StructuredLogWriter = defaultWriter, metrics?: HttpMetrics): express.RequestHandler {
  return (req, res, next) => {
    const requestId = requestIdFromHeader(req.headers['x-request-id']);
    const context: RequestContext = { requestId, active: true };
    const startedAt = process.hrtime.bigint();
    let logged = false;
    res.locals.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    metrics?.requestStarted();

    const logRequest = (aborted: boolean) => {
      if (logged) return;
      logged = true;
      context.active = false;
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const status = aborted && res.statusCode < 400 ? 499 : res.statusCode;
      const contentLength = Number(res.getHeader('content-length'));
      const route = requestRouteTemplate(req);
      metrics?.requestFinished({ method: req.method, route, status, durationMs });
      emit({
        event: aborted ? 'http_request_aborted' : 'http_request',
        level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
        requestId,
        method: req.method,
        route,
        status,
        durationMs: Number(durationMs.toFixed(2)),
        responseBytes: Number.isFinite(contentLength) ? contentLength : null,
      }, writer);
    };

    res.once('finish', () => logRequest(false));
    res.once('close', () => {
      if (!res.writableEnded) logRequest(true);
    });
    requestContext.run(context, next);
  };
}

function errorStatus(error: unknown): number {
  const candidate = Number((error as { status?: unknown; statusCode?: unknown })?.status
    ?? (error as { statusCode?: unknown })?.statusCode);
  return Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
}

export function structuredErrorMiddleware(writer: StructuredLogWriter = defaultWriter): express.ErrorRequestHandler {
  return (error, req, res, next) => {
    const requestId = String(res.locals.requestId || requestIdFromHeader(req.headers['x-request-id']));
    const status = errorStatus(error);
    const rawCode = String((error as { code?: unknown })?.code ?? 'UNHANDLED_ERROR');
    const errorCode = ERROR_CODE_PATTERN.test(rawCode) ? rawCode : 'UNHANDLED_ERROR';
    emit({
      event: 'http_request_error',
      level: 'error',
      requestId,
      method: req.method,
      route: requestRouteTemplate(req),
      status,
      errorName: String((error as { name?: unknown })?.name || 'Error').slice(0, 80),
      errorCode,
    }, writer);

    if (res.headersSent) return next(error);
    return res.status(status).json({
      error: status >= 500 ? 'Внутренняя ошибка сервера' : 'Не удалось выполнить запрос',
      requestId,
    });
  };
}
