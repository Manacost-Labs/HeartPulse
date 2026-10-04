import { Router, type RequestHandler } from 'express';
import { isWebVitalLcpTarget } from '../shared/webVitalsDimensions.js';
import {
  normalizeWebVitalClientRegion,
  normalizeWebVitalEdgeRegion,
  normalizeWebVitalPage,
  type ServerWebVitalContext,
  type ServerWebVitalMetric,
  type ServerWebVitalPage,
} from './webVitalsModel.js';

const METRIC_NAMES = new Set<ServerWebVitalMetric['name']>([
  'CLS',
  'FCP',
  'INP',
  'LCP',
  'TTFB',
]);
const RATINGS = new Set<ServerWebVitalMetric['rating']>([
  'good',
  'needs-improvement',
  'poor',
]);
const NAVIGATION_TYPES = new Set([
  'navigate',
  'reload',
  'back-forward',
  'back-forward-cache',
  'prerender',
  'restore',
  'soft-navigation',
]);

export function normalizeWebVitalMetric(value: unknown): ServerWebVitalMetric | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const name = String(record.name ?? '') as ServerWebVitalMetric['name'];
  const rating = String(record.rating ?? '') as ServerWebVitalMetric['rating'];
  const navigationType = String(record.navigationType ?? '');
  const metricValue = Number(record.value);
  const maximum = name === 'CLS' ? 10 : 600_000;
  const { lcpTarget } = record;
  const lcpTargetAllowed = lcpTarget === undefined || (name === 'LCP' && isWebVitalLcpTarget(lcpTarget));
  if (!METRIC_NAMES.has(name)
    || !RATINGS.has(rating)
    || !NAVIGATION_TYPES.has(navigationType)
    || !Number.isFinite(metricValue)
    || metricValue < 0
    || metricValue > maximum
    || !lcpTargetAllowed) {
    return null;
  }
  const metric: ServerWebVitalMetric = { name, value: metricValue, rating, navigationType };
  if (typeof lcpTarget === 'string') metric.lcpTarget = lcpTarget;
  return metric;
}

export function normalizeWebVitalsPayload(
  value: unknown,
): { page: ServerWebVitalPage; metrics: ServerWebVitalMetric[] } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const page = normalizeWebVitalPage(body);
  const { metrics } = body;
  if (!page || !Array.isArray(metrics) || metrics.length === 0 || metrics.length > 5) return null;
  const normalized = metrics.map(normalizeWebVitalMetric);
  if (normalized.some(metric => metric === null)) return null;
  if (new Set(normalized.map(metric => metric!.name)).size !== normalized.length) return null;
  return { page, metrics: normalized as ServerWebVitalMetric[] };
}

export function createWebVitalsRouter(options: {
  capture: (metric: ServerWebVitalMetric, context: ServerWebVitalContext) => boolean;
}): Router {
  const router = Router();
  const handler: RequestHandler = (req, res) => {
    const edgeRegion = normalizeWebVitalEdgeRegion(req.headers['x-arena-edge-region']);
    const clientRegion = normalizeWebVitalClientRegion(req.headers['x-arena-client-region']);
    res.setHeader('X-RUM-Edge-Region', edgeRegion);
    res.setHeader('X-RUM-Client-Region', clientRegion);
    const report = normalizeWebVitalsPayload(req.body);
    if (!report) return res.status(400).json({ error: 'Некорректные Web Vitals' });
    const context: ServerWebVitalContext = { edgeRegion, clientRegion, ...report.page };
    for (const metric of report.metrics) options.capture(metric, context);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(204).end();
  };
  router.post('/telemetry/web-vitals', handler);
  return router;
}
