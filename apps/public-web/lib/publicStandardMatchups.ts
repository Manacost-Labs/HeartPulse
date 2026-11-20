import 'server-only';
import { cache } from 'react';
import { fetchPublicExpress } from './expressApi';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';
import { loadWithLastGood } from './pageLastGood';
import { loadStandardMatchupsSeed, standardMatchupsPublicPath } from './publicStandardMatchupsData';

/**
 * The open general slice of Standard for the prerendered page, from Express's anonymous projection.
 * Express itself answers a failure with its last good copy (`warning: 'stale' | 'fallback'`), which the
 * page prints with its date. When Express does not answer at all (busy right after a restart, down) the
 * last slice the page accepted is used (`pageLastGood`), so a regeneration never publishes the stub over
 * a good page. `null` only with neither: the page then says the data is temporarily unavailable and its
 * browser request tries again.
 */
export const loadPublicStandardMatchups = cache(async () => loadWithLastGood('standard-matchups', () => readFirstPaintJson(
  signal => fetchPublicExpress(standardMatchupsPublicPath, signal, { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS }),
  Date.now() + PRERENDERED_DATA_READ_BUDGET_MS,
), loadStandardMatchupsSeed));
