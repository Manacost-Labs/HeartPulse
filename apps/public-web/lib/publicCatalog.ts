import 'server-only';
import { cache } from 'react';
import type { CardFormat } from '@/src/modules/constructedCards/public';
import { cachedCatalog } from './defaultCatalogStore';

/**
 * Anonymous projections (default, filtered or paged) reuse a validated seed for
 * 30s and survive an Express outage as the last good version
 * (publicCatalogCache.ts). An unavailable catalog throws `CatalogUnavailableError`.
 */
export const loadPublicCatalog = cache((format: CardFormat, search: string) => cachedCatalog(format, search));
