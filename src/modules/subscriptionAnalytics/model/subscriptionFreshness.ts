import { pluralRu } from '../../../shared/text/pluralRu';
import type { SubscriptionMetrics } from './types';

/** Последний принятый опрос Boosty старше этого — данные считаются устаревшими (опрос идёт раз в 2 минуты). */
export const SUBSCRIPTION_STALE_AFTER_MS = 15 * 60_000;

/** Как часто живая страница спрашивает сервер. */
export const SUBSCRIPTION_POLL_INTERVAL_MS = 60_000;

/** Возраст последнего принятого опроса Boosty в мс; `null` — опросов не было или время нечитаемо. */
export function lastPollAgeMs(metrics: SubscriptionMetrics, nowMs: number): number | null {
  const at = metrics.coverage.lastAcceptedPollAt ? Date.parse(metrics.coverage.lastAcceptedPollAt) : Number.NaN;
  return Number.isFinite(at) ? Math.max(0, nowMs - at) : null;
}

/** «Устарело»: последний принятый опрос старше 15 минут или опросов нет совсем. */
export function isSubscriptionDataStale(metrics: SubscriptionMetrics, nowMs: number): boolean {
  const age = lastPollAgeMs(metrics, nowMs);
  return age === null || age > SUBSCRIPTION_STALE_AFTER_MS;
}

/** «только что», «42 секунды назад», «5 минут назад», «2 часа назад»; `null` — тире решает интерфейс. */
export function formatDataAge(ageMs: number | null): string | null {
  if (ageMs === null) return null;
  const seconds = Math.floor(Math.max(0, ageMs) / 1000);
  if (seconds < 5) return 'только что';
  if (seconds < 60) return `${seconds} ${pluralRu(seconds, 'секунду', 'секунды', 'секунд')} назад`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${pluralRu(minutes, 'минуту', 'минуты', 'минут')} назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ${pluralRu(hours, 'час', 'часа', 'часов')} назад`;
  const days = Math.floor(hours / 24);
  return `${days} ${pluralRu(days, 'день', 'дня', 'дней')} назад`;
}
