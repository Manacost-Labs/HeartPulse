import {
  SUBSCRIPTION_METRICS_SCHEMA_VERSION,
  SUBSCRIPTION_METRICS_SEMANTICS,
  type SubscriptionCoverage,
  type SubscriptionFreeConversion,
  type SubscriptionMetrics,
  type SubscriptionMoneyEstimate,
  type SubscriptionNominalValue,
  type SubscriptionOriginalBaseRetention,
  type SubscriptionSummary,
} from './contract.js';
import {
  codes, count, countsByPlan, dateOnly, flag, int, items, moment, monthOnly, num, obj, orNull, text,
  MAX_DAILY, MAX_LIST, MAX_MONTHS, MAX_WEEKLY, SubscriptionMetricsSourceError, type Obj,
} from './readers.js';

export { SubscriptionMetricsSourceError } from './readers.js';

function nominal(value: unknown, path: string): SubscriptionNominalValue {
  const o = obj(value, path);
  return {
    subscribers: count(o.subscribers, `${path}.subscribers`),
    tariffValueRub: num(o.tariffValueRub, `${path}.tariffValueRub`),
    averageTariffRub: orNull(num)(o.averageTariffRub, `${path}.averageTariffRub`),
    unknownPrices: count(o.unknownPrices, `${path}.unknownPrices`),
  };
}

function coverageOf(value: unknown): SubscriptionCoverage {
  const o = obj(value, 'coverage');
  return {
    baselineAt: orNull(moment)(o.baselineAt, 'coverage.baselineAt'),
    lastAcceptedPollAt: orNull(moment)(o.lastAcceptedPollAt, 'coverage.lastAcceptedPollAt'),
    acceptedPolls: count(o.acceptedPolls, 'coverage.acceptedPolls'),
    maxPollGapSeconds: orNull(count)(o.maxPollGapSeconds, 'coverage.maxPollGapSeconds'),
    gapThresholdSeconds: count(o.gapThresholdSeconds, 'coverage.gapThresholdSeconds'),
    gaps: items(o.gaps, 'coverage.gaps', MAX_LIST, (gap, at) => ({
      from: moment(gap.from, `${at}.from`),
      to: moment(gap.to, `${at}.to`),
      hours: num(gap.hours, `${at}.hours`),
    })),
  };
}

function summaryOf(value: unknown): SubscriptionSummary {
  const o = obj(value, 'summary');
  return {
    paidStart: count(o.paidStart, 'summary.paidStart'),
    paidNow: count(o.paidNow, 'summary.paidNow'),
    freeNow: count(o.freeNow, 'summary.freeNow'),
    netChange: int(o.netChange, 'summary.netChange'),
    accessStarts: count(o.accessStarts, 'summary.accessStarts'),
    newStarts: count(o.newStarts, 'summary.newStarts'),
    returnedStarts: count(o.returnedStarts, 'summary.returnedStarts'),
    accessEnds: count(o.accessEnds, 'summary.accessEnds'),
    endsToFree: count(o.endsToFree, 'summary.endsToFree'),
    endsLeft: count(o.endsLeft, 'summary.endsLeft'),
    planSwitches: count(o.planSwitches, 'summary.planSwitches'),
    newObservedPaidUsers: count(o.newObservedPaidUsers, 'summary.newObservedPaidUsers'),
  };
}

function seriesOf(root: Obj): Pick<SubscriptionMetrics, 'daily' | 'weekly'> {
  return {
    daily: items(root.daily, 'daily', MAX_DAILY, (day, at) => ({
      date: dateOnly(day.date, `${at}.date`),
      paid: count(day.paid, `${at}.paid`),
      plans: countsByPlan(day.plans, `${at}.plans`),
      starts: count(day.starts, `${at}.starts`),
      ends: count(day.ends, `${at}.ends`),
      observed: flag(day.observed, `${at}.observed`),
    })),
    weekly: items(root.weekly, 'weekly', MAX_WEEKLY, (week, at) => ({
      weekStart: dateOnly(week.weekStart, `${at}.weekStart`),
      partial: flag(week.partial, `${at}.partial`),
      starts: count(week.starts, `${at}.starts`),
      ends: count(week.ends, `${at}.ends`),
    })),
  };
}

function plansOf(root: Obj): Pick<SubscriptionMetrics, 'plans' | 'planTransitions'> {
  return {
    plans: items(root.plans, 'plans', MAX_LIST, (plan, at) => ({
      planName: text(plan.planName, `${at}.planName`),
      priceRub: orNull(num)(plan.priceRub, `${at}.priceRub`),
      start: count(plan.start, `${at}.start`),
      current: count(plan.current, `${at}.current`),
      starts: count(plan.starts, `${at}.starts`),
      ends: count(plan.ends, `${at}.ends`),
      switchIn: count(plan.switchIn, `${at}.switchIn`),
      switchOut: count(plan.switchOut, `${at}.switchOut`),
    })),
    planTransitions: items(root.planTransitions, 'planTransitions', MAX_LIST, (edge, at) => ({
      fromPlan: text(edge.fromPlan, `${at}.fromPlan`),
      toPlan: text(edge.toPlan, `${at}.toPlan`),
      kind: text(edge.kind, `${at}.kind`),
      count: count(edge.count, `${at}.count`),
    })),
  };
}

function retentionOf(root: Obj): Pick<SubscriptionMetrics, 'retention' | 'months'> {
  return {
    retention: items(root.retention, 'retention', MAX_LIST, (row, at) => ({
      days: count(row.days, `${at}.days`),
      eligible: count(row.eligible, `${at}.eligible`),
      evaluated: count(row.evaluated, `${at}.evaluated`),
      retained: count(row.retained, `${at}.retained`),
      unknown: count(row.unknown, `${at}.unknown`),
      rate: orNull(num)(row.rate, `${at}.rate`),
      lowerBound: orNull(num)(row.lowerBound, `${at}.lowerBound`),
      upperBound: orNull(num)(row.upperBound, `${at}.upperBound`),
    })),
    months: items(root.months, 'months', MAX_MONTHS, (month, at) => ({
      month: monthOnly(month.month, `${at}.month`),
      partial: flag(month.partial, `${at}.partial`),
      initial: count(month.initial, `${at}.initial`),
      closing: count(month.closing, `${at}.closing`),
      accessStarts: count(month.accessStarts, `${at}.accessStarts`),
      accessEnds: count(month.accessEnds, `${at}.accessEnds`),
      lostInitial: count(month.lostInitial, `${at}.lostInitial`),
      churnRate: orNull(num)(month.churnRate, `${at}.churnRate`),
      activeDuring: count(month.activeDuring, `${at}.activeDuring`),
      observedCounterIncreaseRub: num(month.observedCounterIncreaseRub, `${at}.observedCounterIncreaseRub`),
      observedPayers: count(month.observedPayers, `${at}.observedPayers`),
      estimatedArppuRub: orNull(num)(month.estimatedArppuRub, `${at}.estimatedArppuRub`),
      positiveCounterChanges: count(month.positiveCounterChanges, `${at}.positiveCounterChanges`),
      negativeCounterChanges: count(month.negativeCounterChanges, `${at}.negativeCounterChanges`),
    })),
  };
}

function originalBaseOf(value: unknown): SubscriptionOriginalBaseRetention {
  const o = obj(value, 'originalBaseRetention');
  return {
    initial: count(o.initial, 'originalBaseRetention.initial'),
    retained: count(o.retained, 'originalBaseRetention.retained'),
    rate: orNull(num)(o.rate, 'originalBaseRetention.rate'),
  };
}

function freeConversionOf(value: unknown): SubscriptionFreeConversion {
  const o = obj(value, 'freeConversion');
  return {
    initialFree: count(o.initialFree, 'freeConversion.initialFree'),
    everConverted: count(o.everConverted, 'freeConversion.everConverted'),
    stillPaid: count(o.stillPaid, 'freeConversion.stillPaid'),
    rate: orNull(num)(o.rate, 'freeConversion.rate'),
  };
}

function moneyOf(value: unknown): SubscriptionMoneyEstimate {
  const o = obj(value, 'moneyEstimate');
  return {
    counterIncreasesRub: num(o.counterIncreasesRub, 'moneyEstimate.counterIncreasesRub'),
    observedPayers: count(o.observedPayers, 'moneyEstimate.observedPayers'),
    estimatedArppuRub: orNull(num)(o.estimatedArppuRub, 'moneyEstimate.estimatedArppuRub'),
    positiveChanges: count(o.positiveChanges, 'moneyEstimate.positiveChanges'),
    decreasesCount: count(o.decreasesCount, 'moneyEstimate.decreasesCount'),
    decreasesRub: num(o.decreasesRub, 'moneyEstimate.decreasesRub'),
    unattributedFirstCounters: count(o.unattributedFirstCounters, 'moneyEstimate.unattributedFirstCounters'),
  };
}

/**
 * Белый список полей контракта: наружу уходит только то, что описано в
 * `contract.ts`; новое поле источника без ревью на страницу не попадёт.
 */
export function normalizeSubscriptionMetrics(raw: unknown): SubscriptionMetrics {
  const root = obj(raw, 'ответ');
  if (root.schemaVersion !== SUBSCRIPTION_METRICS_SCHEMA_VERSION) {
    throw new SubscriptionMetricsSourceError(`schemaVersion ${String(root.schemaVersion)} не поддерживается`, true);
  }
  if (root.semantics !== SUBSCRIPTION_METRICS_SEMANTICS) {
    throw new SubscriptionMetricsSourceError('semantics источника не поддерживается', true);
  }
  const tariff = obj(root.nominalTariffValue, 'nominalTariffValue');
  return {
    schemaVersion: SUBSCRIPTION_METRICS_SCHEMA_VERSION,
    semantics: SUBSCRIPTION_METRICS_SEMANTICS,
    requestedFrom: moment(root.requestedFrom, 'requestedFrom'),
    from: moment(root.from, 'from'),
    to: moment(root.to, 'to'),
    generatedAt: moment(root.generatedAt, 'generatedAt'),
    coverage: coverageOf(root.coverage),
    summary: summaryOf(root.summary),
    ...seriesOf(root),
    ...plansOf(root),
    ...retentionOf(root),
    originalBaseRetention: originalBaseOf(root.originalBaseRetention),
    freeConversion: freeConversionOf(root.freeConversion),
    nominalTariffValue: {
      start: nominal(tariff.start, 'nominalTariffValue.start'),
      end: nominal(tariff.end, 'nominalTariffValue.end'),
    },
    moneyEstimate: moneyOf(root.moneyEstimate),
    unavailable: codes(root.unavailable, 'unavailable'),
    limitations: codes(root.limitations, 'limitations'),
  };
}
