/**
 * HSGuru meta periods (docs/specs/standard-meta-periods.md). Rolling windows
 * follow HSGuru's menu order, shortest first.
 */
export type StandardMetaRollingPeriod = 'past_3_hours' | 'past_6_hours' | 'past_day' | 'past_3_days'
  | 'past_week' | 'past_2_weeks' | 'past_30_days';
/** Release windows HSGuru no longer advertises; kept parseable for last-known-good payloads. */
export type StandardMetaRetiredPeriod = 'violet_hold' | 'most_wanted';
/** `black_empire_ban` is HSGuru's «Bans» window: games since the Black Empire ban update. */
export type StandardMetaPeriod = StandardMetaRollingPeriod | 'black_empire' | 'black_empire_ban'
  | StandardMetaRetiredPeriod | `patch_${string}`;

/**
 * The full name of a window whose short label needs one: the tooltip of its option on the archetype and matchup
 * filters. The meta page does not read it (its bundle has no room, so it stays out of standardMetaFilterModel).
 */
export const STANDARD_META_PERIOD_TITLES: Readonly<Partial<Record<StandardMetaPeriod, string>>> = {
  black_empire_ban: 'Тёмная империя, с патча банов',
};

export const STANDARD_META_ROLLING_PERIODS: readonly StandardMetaRollingPeriod[] = [
  'past_3_hours', 'past_6_hours', 'past_day', 'past_3_days', 'past_week', 'past_2_weeks', 'past_30_days',
];
// Old request identifiers open the nearest window the source still serves.
const PERIOD_ALIASES: Readonly<Record<StandardMetaRetiredPeriod, StandardMetaPeriod>> = {
  violet_hold: 'black_empire',
  most_wanted: 'black_empire',
};
const SERVED_PERIODS = new Set<string>([...STANDARD_META_ROLLING_PERIODS, 'black_empire', 'black_empire_ban']);
const PATCH_PERIOD = /^patch_\d+(?:\.\d+){1,3}$/;

/** Whether a payload may name this period, retired windows included. */
export function isStandardMetaPeriod(value: unknown): value is StandardMetaPeriod {
  return typeof value === 'string'
    && (SERVED_PERIODS.has(value) || Object.hasOwn(PERIOD_ALIASES, value) || PATCH_PERIOD.test(value));
}

/**
 * The Bans window (`<expansion>_ban`) that opens the meta and the archetype
 * catalog by default, or null when the source offers none. It belongs to the
 * current expansion window: once a new expansion starts, the previous one's
 * Bans window is no longer the freshest data. Without a known current window
 * the last Bans window listed wins.
 */
export function latestStandardMetaBanPeriod(
  availablePeriods: readonly string[],
  currentPeriod: string | null,
): StandardMetaPeriod | null {
  const banPeriods = availablePeriods.filter(period => period.endsWith('_ban') && isStandardMetaPeriod(period));
  const latest = currentPeriod ? banPeriods.find(period => period === `${currentPeriod}_ban`) : banPeriods.at(-1);
  return (latest ?? null) as StandardMetaPeriod | null;
}

/** The period a request should load: retired windows map to their successor, unknown values to null. */
export function resolveStandardMetaRequestPeriod(value: string): StandardMetaPeriod | null {
  if (Object.hasOwn(PERIOD_ALIASES, value)) return PERIOD_ALIASES[value as StandardMetaRetiredPeriod];
  return SERVED_PERIODS.has(value) || PATCH_PERIOD.test(value) ? value as StandardMetaPeriod : null;
}
