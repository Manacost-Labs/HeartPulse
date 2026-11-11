export type {
  SubscriptionMetrics,
  SubscriptionMetricsUnavailable,
} from './model/types';
export {
  fetchSubscriptionMetrics,
  SubscriptionMetricsError,
  subscriptionMetricsKey,
  SUBSCRIPTION_METRICS_PATH,
  type SubscriptionMetricsErrorKind,
} from './api/subscriptionMetricsClient';
export { startLivePolling, type LivePollingEnvironment } from './model/livePolling';
export {
  EMPTY_VALUE,
  formatCount,
  formatPercent,
  formatRub,
  formatSignedCount,
} from './model/subscriptionFormat';
export {
  formatDataAge,
  isSubscriptionDataStale,
  lastPollAgeMs,
  SUBSCRIPTION_POLL_INTERVAL_MS,
  SUBSCRIPTION_STALE_AFTER_MS,
} from './model/subscriptionFreshness';
export {
  describeCodes,
  limitationText,
  unavailableText,
} from './model/subscriptionTexts';
export {
  buildSubscriptionTiles,
  formatMonthLabel,
  lastFullMonth,
  type SubscriptionTile,
  type SubscriptionTileId,
} from './model/subscriptionTiles';
export {
  useLiveSubscriptionMetrics,
  useNow,
  type LiveSubscriptionMetrics,
} from './ui/useLiveSubscriptionMetrics';

/** Страница раздела тянет вёрстку, CSS и графики: админка грузит её по требованию. */
export function loadSubscriptionAnalyticsPage() {
  return import('./SubscriptionAnalyticsPage.lazy');
}
