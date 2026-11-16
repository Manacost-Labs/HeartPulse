import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';
import type { SubscriptionMetrics } from '../model/types';

export type SubscriptionMetricsErrorKind =
  /** 403: нет прав администратора. */
  | 'forbidden'
  /** 502: источник (boosty-auth) недоступен или несовместим — поднимется сам. */
  | 'unavailable'
  /** Сеть, таймаут, 5xx кроме 502, неожиданный ответ. */
  | 'network';

export class SubscriptionMetricsError extends Error {
  constructor(readonly kind: SubscriptionMetricsErrorKind, message: string, readonly incompatible = false) {
    super(message);
    this.name = 'SubscriptionMetricsError';
  }
}

export const SUBSCRIPTION_METRICS_PATH = '/api/admin/boosty/subscription-metrics';

export const subscriptionMetricsKey = (days: number) => `${SUBSCRIPTION_METRICS_PATH}?days=${days}`;

async function errorBody(response: Response): Promise<{ error?: unknown; reason?: unknown }> {
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null ? body : {};
  } catch {
    return {};
  }
}

/** Загружает метрики подписок за `days` дней; ошибку 502/сети можно отличить от 403 по `kind`. */
export async function fetchSubscriptionMetrics(days: number, signal?: AbortSignal): Promise<SubscriptionMetrics> {
  let response: Response;
  try {
    response = await fetchWithDeadline(subscriptionMetricsKey(days), { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    throw new SubscriptionMetricsError('network', error instanceof Error ? error.message : 'Нет соединения с сервером.');
  }
  if (response.status === 403) throw new SubscriptionMetricsError('forbidden', 'Недостаточно прав');
  if (!response.ok) {
    const body = await errorBody(response);
    const message = typeof body.error === 'string' ? body.error : `Сервер ответил ${response.status}`;
    throw new SubscriptionMetricsError(response.status === 502 ? 'unavailable' : 'network', message, body.reason === 'incompatible');
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SubscriptionMetricsError('network', 'Сервер вернул непонятный ответ');
  }
  if (typeof body !== 'object' || body === null || !('summary' in body) || !('coverage' in body)) {
    throw new SubscriptionMetricsError('network', 'Сервер вернул непонятный ответ');
  }
  return body as SubscriptionMetrics;
}
