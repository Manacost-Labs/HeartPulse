import {
  currentStandardMetaPatchPeriod, isStandardMetaPeriod, latestStandardMetaBanPeriod,
} from '../shared/standardMetaPeriods.js';

type Format = 'standard' | 'wild';
type PeriodCatalog = { format: Format; period: string | null; availablePeriods: string[]; currentPatchPeriod?: string | null };
type Load<C> = (format: Format, period?: string) => Promise<C>;

/**
 * The windows the archetype pages open on, in order: the current patch, the
 * current Bans window, the source's default window (the last entry, always
 * readable). Only a period the source lists is requested, so a request cannot
 * grow the cache with arbitrary keys.
 */
function defaultWindows(fallback: PeriodCatalog): string[] {
  const windows = [
    currentStandardMetaPatchPeriod(fallback.availablePeriods, fallback.currentPatchPeriod),
    latestStandardMetaBanPeriod(fallback.availablePeriods, fallback.period),
  ];
  return windows.filter((period, index): period is NonNullable<typeof period> => (
    Boolean(period) && windows.indexOf(period) === index
  ));
}

/** One window's catalog, or null when it is the source default, unlisted, failed or answered with another window. */
async function loadWindow<C extends PeriodCatalog>(load: Load<C>, fallback: C, period: string): Promise<C | null> {
  if (period === fallback.period || !fallback.availablePeriods.includes(period)) return null;
  try {
    const catalog = await load(fallback.format, period);
    return catalog.period === period ? withDefaultWindowBuilds(catalog, fallback) : null;
  } catch {
    return null;
  }
}

/**
 * The catalog of the archetype pages: the requested period, otherwise the
 * current patch, then the current Bans window, then the source's default
 * window. A failed or mismatched window read falls back to the next window
 * instead of failing the page.
 */
export async function loadArchetypeCatalogForPeriod<C extends PeriodCatalog>(
  load: Load<C>,
  format: Format,
  requestedPeriod: string | null = null,
): Promise<C> {
  const fallback = await load(format);
  for (const period of requestedPeriod ? [requestedPeriod] : defaultWindows(fallback)) {
    const catalog = period === fallback.period ? fallback : await loadWindow(load, fallback, period);
    if (catalog) return catalog;
  }
  return fallback;
}

/**
 * The catalog an archetype page reads: the first default window (patch, Bans,
 * source window) that lists the slug. A shorter patch window can miss an
 * archetype the Bans window has; the page then shows that window. Without the
 * slug anywhere the default catalog is returned and the caller answers 404.
 */
export async function loadArchetypeCatalogForSlug<C extends PeriodCatalog & { items: { slug: string }[] }>(
  load: Load<C>,
  format: Format,
  slug: string | undefined,
): Promise<C> {
  const fallback = await load(format);
  const first = await loadArchetypeCatalogForPeriod(load, format);
  const hasSlug = (catalog: C) => catalog.items.some(item => item.slug === slug);
  if (!slug || hasSlug(first)) return first;
  for (const period of defaultWindows(fallback)) {
    const catalog = period === first.period ? null : await loadWindow(load, fallback, period);
    if (catalog && hasSlug(catalog)) return catalog;
  }
  return hasSlug(fallback) ? fallback : first;
}

type BuildItem = { archetype: string; builds: unknown[]; deckCount: number };

/**
 * HSGuru deck catalogs are collected per window, and a window can have no
 * decks yet (the Bans window did until hs-data-api collected them). An
 * archetype without builds there borrows the default window's builds; each
 * build keeps its own `samplePeriod`, so the page names the sample.
 */
function withDefaultWindowBuilds<C>(catalog: C, fallback: C): C {
  const items = (catalog as { items?: BuildItem[] }).items;
  const defaults = (fallback as { items?: BuildItem[] }).items;
  if (!Array.isArray(items) || !Array.isArray(defaults)) return catalog;
  const byArchetype = new Map(defaults.map(item => [item.archetype, item]));
  let borrowed = false;
  const merged = items.map(item => {
    const source = item.builds.length ? null : byArchetype.get(item.archetype);
    if (!source?.builds.length) return item;
    borrowed = true;
    return { ...item, builds: source.builds, deckCount: source.deckCount };
  });
  return borrowed ? { ...catalog, items: merged } : catalog;
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
): Pick<PeriodCatalog, 'period' | 'availablePeriods' | 'currentPatchPeriod'> {
  const period = isStandardMetaPeriod(criteria.period) ? criteria.period : null;
  const listed = meta && typeof meta === 'object' ? (meta as Record<string, unknown>).available_periods : undefined;
  const availablePeriods = Array.isArray(listed)
    ? listed.filter(isStandardMetaPeriod)
    : period ? [period] : [];
  const currentPatch = meta && typeof meta === 'object' ? (meta as Record<string, unknown>).current_patch_period : undefined;
  return {
    period,
    availablePeriods,
    ...(isStandardMetaPeriod(currentPatch) && currentPatch.startsWith('patch_') ? { currentPatchPeriod: currentPatch } : {}),
  };
}
