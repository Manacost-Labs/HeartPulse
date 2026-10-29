import type { StandardMetaCoin, StandardMetaPeriod } from '../../shared/standardMetaContract';
import { latestStandardMetaBanPeriod } from '../../shared/standardMetaPeriods';

export function orderStandardMetaPeriods(
  availablePeriods: StandardMetaPeriod[],
  currentPeriod: StandardMetaPeriod | null,
  currentPatchPeriod: StandardMetaPeriod | null,
): StandardMetaPeriod[] {
  // HSGuru's menu order: the Bans window, the current release window, the current patch, then rolling windows.
  const preferredPeriods = [
    ...availablePeriods.filter(period => period.endsWith('_ban')), currentPeriod, currentPatchPeriod,
  ] satisfies Array<StandardMetaPeriod | null>;
  const available = new Set(availablePeriods);

  return [
    ...preferredPeriods.filter(
      (period): period is StandardMetaPeriod => Boolean(period && available.delete(period)),
    ),
    ...available,
  ];
}

/** The period the page opens on: the current Bans window, else the current expansion window, else the patch. */
export function resolveStandardMetaDefaultPeriod(
  availablePeriods: StandardMetaPeriod[],
  currentPeriod: StandardMetaPeriod | null,
  currentPatchPeriod: StandardMetaPeriod | null,
): StandardMetaPeriod | null {
  return [latestStandardMetaBanPeriod(availablePeriods, currentPeriod), currentPeriod, currentPatchPeriod]
    .find((period): period is StandardMetaPeriod => Boolean(period && availablePeriods.includes(period)))
    ?? null;
}

const PERIOD_LABELS: Partial<Record<StandardMetaPeriod, string>> = {
  black_empire: 'Тёмная империя',
  black_empire_ban: 'После банов',
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

/** Windows whose short label needs the full name: it goes into the option's tooltip. */
const PERIOD_TITLES: Partial<Record<StandardMetaPeriod, string>> = {
  black_empire_ban: 'Тёмная империя, с патча банов',
};

export function standardMetaPeriodTitle(period: string): string | undefined {
  return PERIOD_TITLES[period as StandardMetaPeriod];
}

/** HSGuru's coin filter: whose turn the archetype's games started on. */
export const STANDARD_META_COINS: ReadonlyArray<{ id: StandardMetaCoin; label: string }> = [
  { id: 'any_player', label: 'Любая' },
  { id: 'going_first', label: 'Ходит первым' },
  { id: 'on_coin', label: 'С монеткой' },
];
