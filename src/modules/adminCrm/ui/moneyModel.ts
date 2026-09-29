/**
 * View model for the admin «Деньги» section, built from GET /api/admin/boosty/analytics.
 * Subscription revenue is inferred from observed Boosty payment increases plus exact Tribute
 * webhooks; donations and paid posts come from the exact Boosty sales ledger.
 */
export type MoneyMetrics = { newSubscriptions: number; renewals: number; revenueRub: number; observedDecreaseRub: number };
export type MoneyPlan = { planId: string; planName: string; newSubscriptions: number; renewals: number; revenueRub: number; source: 'boosty' | 'tribute' };
export type MoneyRetention = { days: number; eligible: number; evaluated: number; retained: number; unknown: number; rate: number | null };
export type MoneyObservation = { observedAt: string; type: string; amountRub: number; planName: string; source: 'boosty' | 'tribute' };
export type MoneySaleObservation = { observedAt: string; type: 'donation' | 'post_purchase'; amountRub: number; postTitle: string };
export type MoneyBuyer = { userId: string; name: string; email: string; donations: number; postPurchases: number; totalRevenueRub: number; lastPurchaseAt: string };
export type MoneyTransaction = {
  eventKey: string; type: 'donation' | 'post_purchase'; createdAt: string; amountRub: number;
  user: { id: string; name: string; email: string }; post: { id: string; title: string } | null;
};

export type MoneyPayload = {
  from: string;
  to: string;
  summary: MoneyMetrics;
  plans: MoneyPlan[];
  observations?: MoneyObservation[];
  retention: MoneyRetention[];
  coverage: { lastAcceptedPollAt: string | null; complete: boolean };
  limitations: string[];
  sales: null | {
    summary: { donations: number; postPurchases: number; totalRevenueRub: number; uniqueBuyers: number };
    buyers: MoneyBuyer[];
    observations: MoneySaleObservation[];
    transactions?: MoneyTransaction[];
    coverage: { latestImportAt: string | null; complete: boolean };
  };
  generatedAt: string;
};

export type MoneyPeriodDays = 30 | 90 | 365;
export const MONEY_PERIODS: ReadonlyArray<{ days: MoneyPeriodDays; label: string }> = [
  { days: 30, label: '30 дней' },
  { days: 90, label: '90 дней' },
  { days: 365, label: 'Год' },
];

const DAY_MS = 86_400_000;

export function moneyRange(days: MoneyPeriodDays, now = new Date()): { from: string; to: string } {
  return { from: new Date(now.getTime() - days * DAY_MS).toISOString(), to: now.toISOString() };
}

export function formatRub(value: number): string {
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

export function moneySummary(payload: MoneyPayload) {
  const salesRub = payload.sales?.summary.totalRevenueRub ?? 0;
  const subscriptionRub = payload.summary.revenueRub;
  const payments = payload.summary.newSubscriptions + payload.summary.renewals;
  return {
    totalRub: subscriptionRub + salesRub,
    subscriptionRub,
    salesRub,
    newSubscriptions: payload.summary.newSubscriptions,
    renewals: payload.summary.renewals,
    averagePaymentRub: payments ? subscriptionRub / payments : null,
    decreaseRub: payload.summary.observedDecreaseRub,
    buyers: payload.sales?.summary.uniqueBuyers ?? 0,
  };
}

export type RevenueBucket = { start: string; subscriptionRub: number; salesRub: number };

/**
 * Buckets revenue by day (periods up to 31 days), ISO week (up to 120 days) or month, always
 * returning every bucket in the range so gaps show as empty bars instead of disappearing.
 */
export function revenueBuckets(payload: MoneyPayload): RevenueBucket[] {
  const from = new Date(payload.from);
  const to = new Date(payload.to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) return [];
  const spanDays = (to.getTime() - from.getTime()) / DAY_MS;
  const unit: 'day' | 'week' | 'month' = spanDays <= 31 ? 'day' : spanDays <= 120 ? 'week' : 'month';
  const startOf = (value: Date) => {
    const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), unit === 'month' ? 1 : value.getUTCDate()));
    if (unit === 'week') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date;
  };
  const next = (value: Date) => {
    const date = new Date(value);
    if (unit === 'day') date.setUTCDate(date.getUTCDate() + 1);
    else if (unit === 'week') date.setUTCDate(date.getUTCDate() + 7);
    else date.setUTCMonth(date.getUTCMonth() + 1);
    return date;
  };
  const buckets = new Map<string, RevenueBucket>();
  for (let cursor = startOf(from); cursor < to; cursor = next(cursor)) {
    const key = cursor.toISOString();
    buckets.set(key, { start: key, subscriptionRub: 0, salesRub: 0 });
  }
  const add = (at: string, amount: number, field: 'subscriptionRub' | 'salesRub') => {
    const time = new Date(at);
    if (!Number.isFinite(time.getTime()) || amount <= 0) return;
    const bucket = buckets.get(startOf(time).toISOString());
    if (bucket) bucket[field] += amount;
  };
  for (const item of payload.observations ?? []) {
    if (item.type !== 'observed_decrease') add(item.observedAt, item.amountRub, 'subscriptionRub');
  }
  for (const item of payload.sales?.observations ?? []) add(item.observedAt, item.amountRub, 'salesRub');
  return [...buckets.values()];
}

export function planShare(plans: MoneyPlan[]) {
  const total = plans.reduce((sum, plan) => sum + plan.revenueRub, 0);
  return [...plans]
    .sort((left, right) => right.revenueRub - left.revenueRub)
    .map(plan => ({ ...plan, share: total ? plan.revenueRub / total : 0 }));
}

/** Data-quality notes an operator must see before trusting the totals. */
export function moneyCaveats(payload: MoneyPayload): string[] {
  const notes = [...payload.limitations];
  if (!payload.coverage.complete) notes.unshift('Наблюдения за подписками неполные: в периоде есть пропуски опроса Boosty.');
  if (payload.sales && !payload.sales.coverage.complete) notes.push('Импорт продаж Boosty неполный.');
  if (!payload.sales) notes.push('Продажи Boosty (донаты и платные посты) сейчас недоступны.');
  return [...new Set(notes)];
}
