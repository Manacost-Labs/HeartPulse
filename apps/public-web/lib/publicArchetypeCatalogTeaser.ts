import 'server-only';
import { cache } from 'react';
import { readInitialCatalogFilters } from '@/src/features/constructedArchetypeCatalogUrl';
import { publicArchetypeCatalog } from './publicArchetypeCatalogTeaserData';
import { fetchPublicExpress } from './expressApi';
import { FIRST_PAINT_READ_BUDGET_MS, readFirstPaintJson } from './publicFirstPaintRead';

/**
 * Anonymous catalog teaser of the format the page opens with (`?format=`),
 * for the server-rendered guest view, or `null` to let the browser load it.
 */
export const loadPublicArchetypeCatalogTeaser = cache(async (search: string) => {
  const { format } = readInitialCatalogFilters(search, []);
  const raw = await readFirstPaintJson(() => fetchPublicExpress(`/api/constructed-archetypes/teaser?format=${format}`),
    Date.now() + FIRST_PAINT_READ_BUDGET_MS);
  return raw === null ? null : publicArchetypeCatalog(raw, format);
});
