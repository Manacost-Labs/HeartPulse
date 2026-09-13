export type AnalyticsDateRange = {
  from: string;
  to: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isAnalyticsMetrics(value: unknown): boolean {
  return isRecord(value)
    && isFiniteNumber(value.newSubscriptions)
    && isFiniteNumber(value.renewals)
    && isFiniteNumber(value.revenueRub)
    && isFiniteNumber(value.observedDecreaseRub);
}

function isSalesMetrics(value: unknown): boolean {
  return isRecord(value)
    && isFiniteNumber(value.donations)
    && isFiniteNumber(value.postPurchases)
    && isFiniteNumber(value.donationRevenueRub)
    && isFiniteNumber(value.postRevenueRub)
    && isFiniteNumber(value.totalRevenueRub);
}

function isAnalyticsPlan(value: unknown): boolean {
  return isRecord(value)
    && typeof value.planId === 'string'
    && typeof value.planName === 'string'
    && isFiniteNumber(value.newSubscriptions)
    && isFiniteNumber(value.renewals)
    && isFiniteNumber(value.revenueRub)
    && (value.source === 'boosty' || value.source === 'tribute');
}

function isRetentionMetric(value: unknown): boolean {
  return isRecord(value)
    && isFiniteNumber(value.days)
    && isFiniteNumber(value.eligible)
    && isFiniteNumber(value.evaluated)
    && isFiniteNumber(value.retained)
    && isFiniteNumber(value.unknown)
    && (value.rate === null || isFiniteNumber(value.rate));
}

function isCoverage(value: unknown): boolean {
  return isRecord(value)
    && isNullableString(value.baselineAt)
    && isNullableString(value.lastAcceptedPollAt)
    && isFiniteNumber(value.acceptedPolls)
    && (value.maxPollGapSeconds === null || isFiniteNumber(value.maxPollGapSeconds))
    && typeof value.complete === 'boolean';
}

function isArticleInterval(value: unknown): boolean {
  return isRecord(value)
    && isRecord(value.article)
    && typeof value.article.id === 'string'
    && typeof value.article.title === 'string'
    && typeof value.article.url === 'string'
    && typeof value.article.publishedAt === 'string'
    && typeof value.from === 'string'
    && typeof value.to === 'string'
    && isAnalyticsMetrics(value.metrics)
    && isSalesMetrics(value.sales)
    && Array.isArray(value.plans)
    && value.plans.every(isAnalyticsPlan);
}

function isSourceBreakdown(value: unknown): boolean {
  return isRecord(value)
    && (value.id === 'boosty' || value.id === 'tribute')
    && typeof value.label === 'string'
    && (value.semantics === 'observed_cumulative_delta' || value.semantics === 'exact_webhook_events')
    && isAnalyticsMetrics(value.summary)
    && Array.isArray(value.retention)
    && value.retention.every(isRetentionMetric)
    && isCoverage(value.coverage);
}

function isBoostySales(value: unknown): boolean {
  if (!isRecord(value) || value.semantics !== 'exact_boosty_sales_rows') return false;
  if (!isSalesMetrics(value.summary) || !isRecord(value.summary)
    || !isFiniteNumber(value.summary.uniqueBuyers)) return false;
  if (!Array.isArray(value.buyers) || !Array.isArray(value.posts)
    || !Array.isArray(value.transactions) || !isRecord(value.coverage)
    || !isStringArray(value.limitations)) return false;
  return value.buyers.every(buyer => (
    isRecord(buyer)
    && typeof buyer.userId === 'string'
    && typeof buyer.name === 'string'
    && typeof buyer.email === 'string'
    && isFiniteNumber(buyer.donations)
    && isFiniteNumber(buyer.postPurchases)
    && isFiniteNumber(buyer.totalRevenueRub)
  ))
    && value.posts.every(post => (
      isRecord(post)
      && typeof post.postId === 'string'
      && typeof post.title === 'string'
      && isFiniteNumber(post.purchases)
      && isFiniteNumber(post.uniqueBuyers)
      && isFiniteNumber(post.revenueRub)
    ))
    && value.transactions.every(transaction => (
      isRecord(transaction)
      && typeof transaction.eventKey === 'string'
      && typeof transaction.createdAt === 'string'
      && isFiniteNumber(transaction.amountRub)
      && isRecord(transaction.user)
      && typeof transaction.user.id === 'string'
      && typeof transaction.user.name === 'string'
      && typeof transaction.user.email === 'string'
      && (transaction.post === null || (
        isRecord(transaction.post)
        && typeof transaction.post.id === 'string'
        && typeof transaction.post.title === 'string'
      ))
    ))
    && typeof value.coverage.complete === 'boolean'
    && isFiniteNumber(value.coverage.imports)
    && isFiniteNumber(value.coverage.donationRows)
    && isFiniteNumber(value.coverage.postRows)
    && isNullableString(value.coverage.latestImportAt);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

export function isBoostyArticleAnalyticsPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const payload = value;
  return payload.semantics === 'combined_subscription_events'
    && isAnalyticsMetrics(payload.summary)
    && isCoverage(payload.coverage)
    && Array.isArray(payload.plans)
    && payload.plans.every(isAnalyticsPlan)
    && Array.isArray(payload.retention)
    && payload.retention.every(isRetentionMetric)
    && Array.isArray(payload.articleIntervals)
    && payload.articleIntervals.every(isArticleInterval)
    && Array.isArray(payload.limitations) && payload.limitations.every(item => typeof item === 'string')
    && Array.isArray(payload.sourceBreakdown)
    && payload.sourceBreakdown.every(isSourceBreakdown)
    && (payload.sales === null || isBoostySales(payload.sales));
}

export function defaultAnalyticsDateRange(now = new Date()): AnalyticsDateRange {
  const end = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 89);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

export function analyticsQueryRange(range: AnalyticsDateRange): {
  from: string;
  to: string;
} | null {
  const from = parseDay(range.from);
  const through = parseDay(range.to);
  if (!from || !through || through < from) return null;
  const to = new Date(through);
  to.setUTCDate(to.getUTCDate() + 1);
  if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) return null;
  return { from: from.toISOString(), to: to.toISOString() };
}

export function formatRub(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatAnalyticsDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
