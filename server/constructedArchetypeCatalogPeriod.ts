import { isStandardMetaPeriod, latestStandardMetaBanPeriod } from '../shared/standardMetaPeriods.js';

type Format = 'standard' | 'wild';
type PeriodCatalog = { format: Format; period: string | null; availablePeriods: string[] };

/**
 * The catalog of the archetype pages: the requested period, otherwise the
 * current Bans window, otherwise the source's default window. Only a period
 * the default catalog lists is requested from the source, so a request cannot
 * grow the cache with arbitrary keys. A failed or mismatched period read falls
 * back to the default catalog instead of failing the page.
 */
export async function loadArchetypeCatalogForPeriod<C extends PeriodCatalog>(
  load: (format: Format, period?: string) => Promise<C>,
  format: Format,
  requestedPeriod: string | null = null,
): Promise<C> {
  const fallback = await load(format);
  const period = requestedPeriod ?? latestStandardMetaBanPeriod(fallback.availablePeriods, fallback.period);
  if (!period || period === fallback.period || !fallback.availablePeriods.includes(period)) return fallback;
  try {
    const catalog = await load(format, period);
    return catalog.period === period ? catalog : fallback;
  } catch {
    return fallback;
  }
}

/**
 * The period fields of a source catalog's `criteria`. A source without
 * `available_periods` serves only its own window.
 */
export function readArchetypeCatalogPeriods(criteria: Record<string, unknown>): Pick<PeriodCatalog, 'period' | 'availablePeriods'> {
  const period = isStandardMetaPeriod(criteria.period) ? criteria.period : null;
  const availablePeriods = Array.isArray(criteria.available_periods)
    ? criteria.available_periods.filter(isStandardMetaPeriod)
    : period ? [period] : [];
  return { period, availablePeriods };
}
