import 'server-only';
import { cache } from 'react';
import type { StandardMatchupsFormat } from '@/src/modules/standardMatchups/public';
import { fetchPublicExpress } from './expressApi';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';
import { loadStandardMatchupsSeed, standardMatchupsPath } from './publicStandardMatchupsData';

/**
 * The open general slice of a format (Standard by default) for the prerendered page, from Express's anonymous
 * projection. `null` when Express has no snapshot (503) or fails: the page then says the data is temporarily
 * unavailable and its browser request tries again. Express itself answers a failure with its last
 * good copy (`warning: 'stale' | 'fallback'`), which the page prints with its date.
 */
export const loadPublicStandardMatchups = cache(async (format: StandardMatchupsFormat = 'standard') => loadStandardMatchupsSeed(await readFirstPaintJson(
  signal => fetchPublicExpress(standardMatchupsPath(format), signal, { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS }),
  Date.now() + PRERENDERED_DATA_READ_BUDGET_MS,
), format));
