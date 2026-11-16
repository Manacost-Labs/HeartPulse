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

function patchVersion(period: string): number[] {
  return period.slice('patch_'.length).split('.').map(Number);
}

function comparePatchPeriods(left: string, right: string): number {
  const a = patchVersion(left);
  const b = patchVersion(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

/**
 * The current patch window (`patch_<version>`): the source's own
 * `current_patch_period` when it lists it, otherwise the newest listed patch by
 * version number (`patch_37.0.10` is newer than `patch_37.0.9`), or null.
 */
export function currentStandardMetaPatchPeriod(
  availablePeriods: readonly string[],
  currentPatchPeriod: string | null | undefined,
): StandardMetaPeriod | null {
  if (currentPatchPeriod && PATCH_PERIOD.test(currentPatchPeriod) && availablePeriods.includes(currentPatchPeriod)) {
    return currentPatchPeriod as StandardMetaPeriod;
  }
  const patches = availablePeriods.filter(period => PATCH_PERIOD.test(period));
  if (!patches.length) return null;
  return patches.reduce((newest, period) => (comparePatchPeriods(period, newest) > 0 ? period : newest)) as StandardMetaPeriod;
}

/** The period a request should load: retired windows map to their successor, unknown values to null. */
export function resolveStandardMetaRequestPeriod(value: string): StandardMetaPeriod | null {
  if (Object.hasOwn(PERIOD_ALIASES, value)) return PERIOD_ALIASES[value as StandardMetaRetiredPeriod];
  return SERVED_PERIODS.has(value) || PATCH_PERIOD.test(value) ? value as StandardMetaPeriod : null;
}
