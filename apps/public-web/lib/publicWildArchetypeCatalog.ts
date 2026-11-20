import 'server-only';
import { cache } from 'react';
import { fetchPublicExpress } from './expressApi';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { publicArchetypeCatalog } from './publicArchetypeCatalogTeaserData';
import { archetypeTeaserPath } from './publicDataPaths';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';

/**
 * The anonymous Wild archetype catalog (default window) for a prerendered page,
 * or `null` (an upstream failure or no data yet). Unlike the catalog page's
 * read it joins the page's regeneration (`revalidate`), so the Wild hub stays
 * prerendered; the same whitelist (`publicArchetypeCatalog`) drops the builds.
 */
export const loadPrerenderedWildArchetypeCatalog = cache(async () => {
  const raw = await readFirstPaintJson(
    signal => fetchPublicExpress(archetypeTeaserPath('wild', null), signal, { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS }),
    Date.now() + PRERENDERED_DATA_READ_BUDGET_MS,
  );
  return raw === null ? null : publicArchetypeCatalog(raw, 'wild');
});
