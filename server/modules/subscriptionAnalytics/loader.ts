import type { SubscriptionMetrics } from './contract.js';
import { normalizeSubscriptionMetrics, SubscriptionMetricsSourceError } from './normalize.js';

export interface SubscriptionMetricsLoaderOptions {
  /** Адрес boosty-auth, например `http://127.0.0.1:18082`. */
  boostyBaseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export const SUBSCRIPTION_SOURCE_TIMEOUT_MS = 10_000;

/**
 * Читает `GET {boostyBaseUrl}/api/analytics/subscriptions?days=N`. Наверх уходит только `days`:
 * с `from`/`to` кэш boosty-auth не работает, а живой странице нужен именно он. Своего кэша нет.
 */
export function createSubscriptionMetricsLoader(
  options: SubscriptionMetricsLoaderOptions,
): (days: number) => Promise<SubscriptionMetrics> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? SUBSCRIPTION_SOURCE_TIMEOUT_MS;
  const base = options.boostyBaseUrl.replace(/\/+$/, '');
  return async days => {
    const url = new URL(`${base}/api/analytics/subscriptions`);
    url.searchParams.set('days', String(days));
    // Один срок на запрос и чтение тела: молчащий источник не держит ответ дольше таймаута.
    const response = await fetchImpl(url.toString(), {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new SubscriptionMetricsSourceError(`источник ответил ${response.status}`);
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') throw error;
      throw new SubscriptionMetricsSourceError('источник вернул не JSON');
    }
    return normalizeSubscriptionMetrics(body);
  };
}
