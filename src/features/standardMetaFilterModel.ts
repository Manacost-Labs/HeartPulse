import type { StandardMetaPeriod } from '../../shared/standardMetaContract';

export function orderStandardMetaPeriods(
  availablePeriods: StandardMetaPeriod[],
  currentPeriod: StandardMetaPeriod | null,
  currentPatchPeriod: StandardMetaPeriod | null,
): StandardMetaPeriod[] {
  const preferredPeriods = [currentPeriod, currentPatchPeriod, 'violet_hold'] satisfies Array<StandardMetaPeriod | null>;
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
