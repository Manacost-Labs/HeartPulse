import { Router, type RequestHandler } from 'express';

const INCIDENT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const RELEASE_ID = /^(?:development|[a-f0-9]{7,40})$/i;
const ERROR_KINDS = new Set(['render', 'chunk']);

export type ClientInterfaceIncident = {
  incidentId: string;
  kind: 'render' | 'chunk';
  releaseId: string;
  route: string;
  scope: string;
  errorName: string;
  message: string;
  stack: string;
  componentStack: string;
};

function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .trim()
    .slice(0, maximum);
}

function routePath(value: unknown): string {
  const route = boundedText(value, 240);
  if (!route.startsWith('/') || route.startsWith('//')) return '/';
  return route.split(/[?#]/, 1)[0] || '/';
}

/**
 * Accept only bounded, privacy-safe diagnostics. Cookies, query strings, user
 * identifiers and arbitrary client context are deliberately not part of this
 * contract, so the resulting record is safe for operational logs.
 */
export function normalizeClientInterfaceIncident(value: unknown): ClientInterfaceIncident | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const incidentId = boundedText(source.incidentId, 36).toLowerCase();
  const kind = boundedText(source.kind, 12).toLowerCase();
  const releaseId = boundedText(source.releaseId, 40).toLowerCase();
  if (!INCIDENT_ID.test(incidentId) || !ERROR_KINDS.has(kind) || !RELEASE_ID.test(releaseId)) return null;
  return {
    incidentId,
    kind: kind as ClientInterfaceIncident['kind'],
    releaseId,
    route: routePath(source.route),
    scope: boundedText(source.scope, 120),
    errorName: boundedText(source.errorName, 80),
    message: boundedText(source.message, 600),
    stack: boundedText(source.stack, 4_000),
    componentStack: boundedText(source.componentStack, 4_000),
  };
}

export function createClientErrorRouter(options: {
  capture: (incident: ClientInterfaceIncident) => void;
}): Router {
  const router = Router();
  const handler: RequestHandler = (request, response) => {
    const incident = normalizeClientInterfaceIncident(request.body);
    response.setHeader('Cache-Control', 'no-store');
    if (!incident) return response.status(400).json({ error: 'Некорректный отчёт об ошибке' });
    try {
      options.capture(incident);
    } catch {
      // Diagnostics must never turn a recovered client failure into an API 500.
    }
    return response.status(204).end();
  };
  router.post('/telemetry/client-errors', handler);
  return router;
}
