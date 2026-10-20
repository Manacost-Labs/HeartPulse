import type { StandardMetaPeriod } from '../../shared/standardMetaContract';

export function orderStandardMetaPeriods(
  availablePeriods: StandardMetaPeriod[],
  currentPeriod: StandardMetaPeriod | null,
  currentPatchPeriod: StandardMetaPeriod | null,
): StandardMetaPeriod[] {
  // HSGuru's menu order: the current release window, the current patch, then rolling windows.
  const preferredPeriods = [currentPeriod, currentPatchPeriod] satisfies Array<StandardMetaPeriod | null>;
  const available = new Set(availablePeriods);

  return [
    ...preferredPeriods.filter(
      (period): period is StandardMetaPeriod => Boolean(period && available.delete(period)),
    ),
    ...available,
  ];
}

export function resolveStandardMetaDefaultPeriod(
  availablePeriods: StandardMetaPeriod[],
  currentPeriod: StandardMetaPeriod | null,
  currentPatchPeriod: StandardMetaPeriod | null,
): StandardMetaPeriod | null {
  return [currentPeriod, currentPatchPeriod]
    .find((period): period is StandardMetaPeriod => Boolean(period && availablePeriods.includes(period)))
    ?? null;
}

const PERIOD_LABELS: Partial<Record<StandardMetaPeriod, string>> = {
  black_empire: 'Тёмная империя',
  past_3_hours: '3 часа',
  past_6_hours: '6 часов',
  past_day: 'Сутки',
  past_3_days: '3 дня',
  past_week: 'Неделя',
  past_2_weeks: '2 недели',
  past_30_days: '30 дней',
  violet_hold: 'Побег из Аметистовой крепости',
  most_wanted: 'В розыске',
};

export function standardMetaPeriodLabel(period: StandardMetaPeriod): string {
  if (period.startsWith('patch_')) return `Патч ${period.slice('patch_'.length)}`;
  return PERIOD_LABELS[period] ?? period;
}
