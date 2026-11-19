import 'server-only';
import { cache } from 'react';
import { fetchPublicExpress } from './expressApi';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';
import { parsePublicTierlist, PUBLIC_TIERLIST_PATH } from './publicTierlistData';

/**
 * The open Arena tier list (whole card pool) for the prerendered guest view, or
 * `null` (an upstream failure or no data yet): the page is then served without
 * the list instead of failing.
 */
export const loadPublicTierlist = cache(async () => parsePublicTierlist(await readFirstPaintJson(
  signal => fetchPublicExpress(PUBLIC_TIERLIST_PATH, signal, { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS }),
  Date.now() + PRERENDERED_DATA_READ_BUDGET_MS,
)));
