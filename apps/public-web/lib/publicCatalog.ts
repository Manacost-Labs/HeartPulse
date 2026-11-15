import 'server-only';
import { cache } from 'react';
import type { CardFormat } from '@/src/modules/constructedCards/public';
import { catalogRequest, defaultCatalogStore, readCatalog } from './defaultCatalogStore';

/**
 * Anonymous default projections reuse a validated seed for 30s and survive a
 * Express outage as the last good version (publicCatalogCache.ts); arbitrary
 * filters are never cached here. An unavailable catalog throws `CatalogUnavailableError`.
 */
export const loadPublicCatalog = cache(async (format: CardFormat, search: string) => {
  const url = catalogRequest(format, search);
  return url === catalogRequest(format, '') ? defaultCatalogStore()(format) : readCatalog(format, url);
});
