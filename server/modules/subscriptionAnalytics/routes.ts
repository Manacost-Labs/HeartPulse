import { Router, type Request, type Response } from 'express';
import {
  SUBSCRIPTION_METRICS_DAYS_DEFAULT,
  SUBSCRIPTION_METRICS_DAYS_MAX,
  type SubscriptionMetrics,
  type SubscriptionMetricsUnavailable,
} from './contract.js';
import { SubscriptionMetricsSourceError } from './normalize.js';

export interface SubscriptionAnalyticsRouterDependencies {
  adminAuth: (request: Request) => unknown | null;
  setPrivateNoStore: (response: Response) => void;
  loadMetrics: (days: number) => Promise<SubscriptionMetrics>;
  onError?: (error: unknown) => void;
}

const UPSTREAM_ERROR = 'Не удалось загрузить аналитику подписок';
const BAD_DAYS = `Некорректный период: «days» — целое число дней от 1 до ${SUBSCRIPTION_METRICS_DAYS_MAX}`;

/** `null` — параметр задан, но негоден; без параметра — период по умолчанию. */
export function parseMetricsDays(value: unknown): number | null {
  if (value === undefined) return SUBSCRIPTION_METRICS_DAYS_DEFAULT;
  if (typeof value !== 'string' || !/^\d{1,3}$/.test(value)) return null;
  const days = Number(value);
  return days >= 1 && days <= SUBSCRIPTION_METRICS_DAYS_MAX ? days : null;
}

export function createSubscriptionAnalyticsRouter(
  dependencies: SubscriptionAnalyticsRouterDependencies,
): Router {
  const router = Router();

  router.get('/admin/boosty/subscription-metrics', async (request, response) => {
    dependencies.setPrivateNoStore(response);
    if (!dependencies.adminAuth(request)) {
      return response.status(403).json({ error: 'Недостаточно прав' });
    }
    const days = parseMetricsDays(request.query.days);
    if (days === null) return response.status(400).json({ error: BAD_DAYS });
    try {
      return response.json(await dependencies.loadMetrics(days));
    } catch (error) {
      dependencies.onError?.(error);
      const body: SubscriptionMetricsUnavailable = {
        error: UPSTREAM_ERROR,
        source: 'unavailable',
        ...(error instanceof SubscriptionMetricsSourceError && error.incompatible ? { reason: 'incompatible' as const } : {}),
      };
      return response.status(502).json(body);
    }
  });

  return router;
}
