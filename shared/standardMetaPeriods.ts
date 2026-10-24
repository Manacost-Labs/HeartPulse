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

/** The period a request should load: retired windows map to their successor, unknown values to null. */
export function resolveStandardMetaRequestPeriod(value: string): StandardMetaPeriod | null {
  if (Object.hasOwn(PERIOD_ALIASES, value)) return PERIOD_ALIASES[value as StandardMetaRetiredPeriod];
  return SERVED_PERIODS.has(value) || PATCH_PERIOD.test(value) ? value as StandardMetaPeriod : null;
}
