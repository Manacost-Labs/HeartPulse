import type { TierlistSource } from './types';

const DATA_VERSION = 'ru_cards_v3';

export const TIERLIST_CACHE_TTL_MS = 60 * 1000;

export function tierlistCacheKey(source: TierlistSource): string {
  return `tl_${DATA_VERSION}_${source}`;
}

export function tierlistBaseUrl(source: TierlistSource): string {
  return `/api/tierlist?source=${source}&v=${DATA_VERSION}`;
}
