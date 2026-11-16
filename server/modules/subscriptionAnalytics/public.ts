import type { Request, Response } from 'express';
import { createSubscriptionMetricsLoader } from './loader.js';
import { createSubscriptionAnalyticsRouter } from './routes.js';

export { createSubscriptionMetricsLoader, SUBSCRIPTION_SOURCE_TIMEOUT_MS, type SubscriptionMetricsLoaderOptions } from './loader.js';
export { normalizeSubscriptionMetrics, SubscriptionMetricsSourceError } from './normalize.js';
export { createSubscriptionAnalyticsRouter, parseMetricsDays, type SubscriptionAnalyticsRouterDependencies } from './routes.js';

/** `/api/admin/boosty/subscription-metrics` поверх boosty-auth (docs/boosty-article-analytics.md). */
export function createSubscriptionAnalyticsApi(options: {
  boostyBaseUrl: string;
  adminAuth: (request: Request) => unknown | null;
  setPrivateNoStore: (response: Response) => void;
}) {
  return createSubscriptionAnalyticsRouter({
    adminAuth: options.adminAuth,
    setPrivateNoStore: options.setPrivateNoStore,
    loadMetrics: createSubscriptionMetricsLoader({ boostyBaseUrl: options.boostyBaseUrl }),
    onError: error => console.error('[subscription-analytics] source failed:', error instanceof Error ? error.message : error),
  });
}
