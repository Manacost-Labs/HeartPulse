import { randomUUID } from 'node:crypto';
import type express from 'express';

export type StructuredLogRecord = Record<string, string | number | boolean | null>;
export type StructuredLogWriter = (line: string) => void;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ERROR_CODE_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;

function defaultWriter(line: string): void {
  process.stdout.write(`${line}\n`);
}

export function requestIdFromHeader(value: unknown): string {
  const candidate = Array.isArray(value) ? value[0] : String(value ?? '').trim();
  return REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();
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

function emit(record: StructuredLogRecord, writer: StructuredLogWriter): void {
  writer(JSON.stringify({ timestamp: new Date().toISOString(), ...record }));
}

export function requestLoggingMiddleware(writer: StructuredLogWriter = defaultWriter): express.RequestHandler {
  return (req, res, next) => {
    const requestId = requestIdFromHeader(req.headers['x-request-id']);
    const startedAt = process.hrtime.bigint();
    let logged = false;
    res.locals.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    const logRequest = (aborted: boolean) => {
      if (logged) return;
      logged = true;
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const status = aborted && res.statusCode < 400 ? 499 : res.statusCode;
      const contentLength = Number(res.getHeader('content-length'));
      emit({
        event: aborted ? 'http_request_aborted' : 'http_request',
        level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
        requestId,
        method: req.method,
        route: normalizeRequestPath(req.originalUrl),
        status,
        durationMs: Number(durationMs.toFixed(2)),
        responseBytes: Number.isFinite(contentLength) ? contentLength : null,
      }, writer);
    };

    res.once('finish', () => logRequest(false));
    res.once('close', () => {
      if (!res.writableEnded) logRequest(true);
    });
    next();
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
      route: normalizeRequestPath(req.originalUrl),
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
