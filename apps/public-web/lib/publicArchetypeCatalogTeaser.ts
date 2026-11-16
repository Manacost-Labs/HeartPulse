import 'server-only';
import { cache } from 'react';
import { readInitialCatalogFilters } from '@/src/features/constructedArchetypeCatalogUrl';
import { publicArchetypeCatalog } from './publicArchetypeCatalogTeaserData';
import { readPublicJsonOrNull } from './firstPaintStore';
import { archetypeTeaserPath } from './publicDataPaths';

/**
 * Anonymous catalog teaser of the format the page opens with (`?format=`),
 * (and the HSGuru `period` of the window, default when omitted) for the server-rendered guest view, or `null` to let the browser load it.
 */
export const loadPublicArchetypeCatalogTeaser = cache(async (search: string, period: string | null = null) => {
  const { format } = readInitialCatalogFilters(search, []);
  const raw = await readPublicJsonOrNull(archetypeTeaserPath(format, period));
  return raw === null ? null : publicArchetypeCatalog(raw, format);
});
