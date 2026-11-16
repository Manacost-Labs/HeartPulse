import 'server-only';
import { cache } from 'react';
import { fetchPublicExpress } from './expressApi';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';
import { parsePublicTierlistTeaser, TIERLIST_TEASER_PATH } from './publicTierlistTeaserData';

/**
 * The open slice of the Arena tier list for the prerendered guest view, or
 * `null` (an upstream failure or no data yet): the page is then served without
 * the slice instead of failing.
 */
export const loadPublicTierlistTeaser = cache(async () => parsePublicTierlistTeaser(await readFirstPaintJson(
  signal => fetchPublicExpress(TIERLIST_TEASER_PATH, signal, { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS }),
  Date.now() + PRERENDERED_DATA_READ_BUDGET_MS,
)));
