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
 * The period fields of a source catalog: `criteria.period` is the window it was
 * built for, `meta.available_periods` the windows the source can build. A
 * source without the list (hs-data-api before the Bans catalog) serves only
 * its own window.
 */
export function readArchetypeCatalogPeriods(
  criteria: Record<string, unknown>,
  meta: unknown,
): Pick<PeriodCatalog, 'period' | 'availablePeriods'> {
  const period = isStandardMetaPeriod(criteria.period) ? criteria.period : null;
  const listed = meta && typeof meta === 'object' ? (meta as Record<string, unknown>).available_periods : undefined;
  const availablePeriods = Array.isArray(listed)
    ? listed.filter(isStandardMetaPeriod)
    : period ? [period] : [];
  return { period, availablePeriods };
}
