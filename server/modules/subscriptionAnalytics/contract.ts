/**
 * Контракт ответа `GET /api/admin/boosty/subscription-metrics`: агрегаты платных подписок Boosty
 * без персональных данных. Источник — boosty-auth `GET /api/analytics/subscriptions`
 * (`build_subscription_metrics`); сервер HearthPulse пропускает только перечисленные здесь поля.
 * Даты и месяцы — UTC, проценты уже посчитаны (одна десятая), `rate` может быть `null`.
 */
export const SUBSCRIPTION_METRICS_SCHEMA_VERSION = 1;
export const SUBSCRIPTION_METRICS_SEMANTICS = 'observed_subscriber_state';

export interface SubscriptionPollGap {
  from: string;
  to: string;
  hours: number;
}

export interface SubscriptionCoverage {
  baselineAt: string | null;
  /** Время последнего принятого опроса Boosty; по нему видно, насколько данные свежие. */
  lastAcceptedPollAt: string | null;
  acceptedPolls: number;
  maxPollGapSeconds: number | null;
  gapThresholdSeconds: number;
  gaps: SubscriptionPollGap[];
}

export interface SubscriptionSummary {
  paidStart: number;
  paidNow: number;
  freeNow: number;
  netChange: number;
  accessStarts: number;
  newStarts: number;
  returnedStarts: number;
  accessEnds: number;
  endsToFree: number;
  endsLeft: number;
  planSwitches: number;
  newObservedPaidUsers: number;
}

export interface SubscriptionDailyPoint {
  date: string;
  paid: number;
  plans: Record<string, number>;
  starts: number;
  ends: number;
  /** `false` — в этот день опросов не было, значение перенесено с предыдущего дня. */
  observed: boolean;
}

export interface SubscriptionWeeklyPoint {
  weekStart: string;
  partial: boolean;
  starts: number;
  ends: number;
}

export interface SubscriptionPlanMetrics {
  planName: string;
  priceRub: number | null;
  start: number;
  current: number;
  starts: number;
  ends: number;
  switchIn: number;
  switchOut: number;
}

export interface SubscriptionRetention {
  days: number;
  eligible: number;
  evaluated: number;
  retained: number;
  unknown: number;
  rate: number | null;
  lowerBound: number | null;
  upperBound: number | null;
}

export interface SubscriptionMonth {
  month: string;
  partial: boolean;
  initial: number;
  closing: number;
  accessStarts: number;
  accessEnds: number;
  lostInitial: number;
  churnRate: number | null;
  activeDuring: number;
  observedCounterIncreaseRub: number;
  observedPayers: number;
  estimatedArppuRub: number | null;
  positiveCounterChanges: number;
  negativeCounterChanges: number;
}

export interface SubscriptionOriginalBaseRetention {
  initial: number;
  retained: number;
  rate: number | null;
}

export interface SubscriptionFreeConversion {
  initialFree: number;
  everConverted: number;
  stillPaid: number;
  rate: number | null;
}

export interface SubscriptionPlanTransition {
  fromPlan: string;
  toPlan: string;
  kind: string;
  count: number;
}

export interface SubscriptionNominalValue {
  subscribers: number;
  tariffValueRub: number;
  averageTariffRub: number | null;
  unknownPrices: number;
}

export interface SubscriptionMoneyEstimate {
  counterIncreasesRub: number;
  observedPayers: number;
  estimatedArppuRub: number | null;
  positiveChanges: number;
  decreasesCount: number;
  decreasesRub: number;
  unattributedFirstCounters: number;
}

export interface SubscriptionMetrics {
  schemaVersion: typeof SUBSCRIPTION_METRICS_SCHEMA_VERSION;
  semantics: typeof SUBSCRIPTION_METRICS_SEMANTICS;
  requestedFrom: string;
  from: string;
  to: string;
  generatedAt: string;
  coverage: SubscriptionCoverage;
  summary: SubscriptionSummary;
  daily: SubscriptionDailyPoint[];
  weekly: SubscriptionWeeklyPoint[];
  plans: SubscriptionPlanMetrics[];
  retention: SubscriptionRetention[];
  months: SubscriptionMonth[];
  originalBaseRetention: SubscriptionOriginalBaseRetention;
  freeConversion: SubscriptionFreeConversion;
  planTransitions: SubscriptionPlanTransition[];
  nominalTariffValue: { start: SubscriptionNominalValue; end: SubscriptionNominalValue };
  moneyEstimate: SubscriptionMoneyEstimate;
  /** Машинные коды того, чего источник не знает; тексты на русском пишет интерфейс. */
  unavailable: string[];
  /** Машинные коды оговорок к цифрам; тексты на русском пишет интерфейс. */
  limitations: string[];
}

/** Тело ответа 502, когда источник недоступен или несовместим. */
export interface SubscriptionMetricsUnavailable {
  error: string;
  source: 'unavailable';
  /** Только для несовместимой версии/семантики источника: странице можно сказать об этом прямо. */
  reason?: 'incompatible';
}

export const SUBSCRIPTION_METRICS_DAYS_DEFAULT = 92;
export const SUBSCRIPTION_METRICS_DAYS_MAX = 366;
