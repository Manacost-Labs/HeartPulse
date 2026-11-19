import 'server-only';
import { cache } from 'react';
import { PUBLIC_LEGENDARIES_PATH, parsePublicLegendaries, type LegendariesData } from '@/src/modules/arenaLegendaries/public';
import { fetchPublicExpress } from './expressApi';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';

/**
 * The open legendary groups of Arena (HSReplay) for the prerendered page, from
 * Express's anonymous projection, re-checked field by field. `null` when Express
 * has no snapshot (503) or fails: the page then says the data is temporarily
 * unavailable and its browser request tries again. Express itself answers a
 * failure with its last snapshot (`warning: 'stale' | 'fallback'`), which the
 * page shows with its date.
 */
export const loadPublicLegendaries = cache(async (): Promise<LegendariesData | null> => parsePublicLegendaries(
  await readFirstPaintJson(
    signal => fetchPublicExpress(`${PUBLIC_LEGENDARIES_PATH}?source=hsreplay`, signal,
      { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS }),
    Date.now() + PRERENDERED_DATA_READ_BUDGET_MS,
  )));
