import type { StandardMetaPeriod } from '../../shared/standardMetaContract';

export function orderStandardMetaPeriods(
  availablePeriods: StandardMetaPeriod[],
  currentPatchPeriod: StandardMetaPeriod | null,
): StandardMetaPeriod[] {
  const preferredPeriods = [currentPatchPeriod, 'violet_hold'] satisfies Array<StandardMetaPeriod | null>;
  const available = new Set(availablePeriods);

  return [
    ...preferredPeriods.filter(
      (period): period is StandardMetaPeriod => Boolean(period && available.delete(period)),
    ),
    ...available,
  ];
}
