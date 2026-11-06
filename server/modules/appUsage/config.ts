/**
 * Daily free use of the Hearthpulse app's paid analytics (plan 3.1, docs/specs/app-usage-limits.md). Only the site's
 * own analytics may be limited: numbers from the Hearthpulse stats pool, never third-party data or Blizzard's cards
 * and art. A subscriber with the feature's section uses it without a limit.
 */
export type AppUsageFeature = { key: string; section: 'battlegrounds' | 'standard' | 'arena'; freePerDay: number };

export type AppUsageConfig = { enabled: boolean; features: readonly AppUsageFeature[] };

/** The Battlegrounds stats pool in the overlay: comps, trinkets and tavern spells. */
export const BG_POOL_STATS = 'bg.poolStats';
export const DEFAULT_FREE_PER_DAY = 3;
/** Claims are kept this long (a day's count needs only today's); then deleted. */
export const APP_USAGE_KEEP_DAYS = 7;

/**
 * Off unless `APP_USAGE_LIMITS_ENABLED=1`: then the app limits free use. `APP_USAGE_FREE_PER_DAY` changes the number
 * (1-100) without an app release.
 */
export function appUsageConfig(environment: NodeJS.ProcessEnv): AppUsageConfig {
  const perDay = Number(environment.APP_USAGE_FREE_PER_DAY);
  const freePerDay = Number.isInteger(perDay) && perDay >= 1 && perDay <= 100 ? perDay : DEFAULT_FREE_PER_DAY;
  return {
    enabled: environment.APP_USAGE_LIMITS_ENABLED === '1',
    features: [{ key: BG_POOL_STATS, section: 'battlegrounds', freePerDay }],
  };
}

/** The UTC day of a moment (`2026-11-02`) and when it ends. */
export function usageDay(now: number): { day: string; resetsAt: string } {
  const date = new Date(now);
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return { day: date.toISOString().slice(0, 10), resetsAt: new Date(end).toISOString() };
}
