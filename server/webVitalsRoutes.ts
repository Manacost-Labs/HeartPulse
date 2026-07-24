import { Router, type RequestHandler } from 'express';
import type { ServerWebVitalMetric } from './sentry.js';

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
  if (!METRIC_NAMES.has(name)
    || !RATINGS.has(rating)
    || !NAVIGATION_TYPES.has(navigationType)
    || !Number.isFinite(metricValue)
    || metricValue < 0
    || metricValue > maximum) {
    return null;
  }
  return { name, value: metricValue, rating, navigationType };
}

export function normalizeWebVitalsPayload(value: unknown): ServerWebVitalMetric[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const metrics = (value as Record<string, unknown>).metrics;
  if (!Array.isArray(metrics) || metrics.length === 0 || metrics.length > 5) return null;
  const normalized = metrics.map(normalizeWebVitalMetric);
  if (normalized.some(metric => metric === null)) return null;
  if (new Set(normalized.map(metric => metric!.name)).size !== normalized.length) return null;
  return normalized as ServerWebVitalMetric[];
}

export function createWebVitalsRouter(options: {
  capture: (metric: ServerWebVitalMetric) => boolean;
}): Router {
  const router = Router();
  const handler: RequestHandler = (req, res) => {
    const metrics = normalizeWebVitalsPayload(req.body);
    if (!metrics) return res.status(400).json({ error: 'Некорректные Web Vitals' });
    for (const metric of metrics) options.capture(metric);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(204).end();
  };
  router.post('/telemetry/web-vitals', handler);
  return router;
}
