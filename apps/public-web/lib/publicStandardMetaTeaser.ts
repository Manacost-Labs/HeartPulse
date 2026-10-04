import 'server-only';
import { cache } from 'react';
import type { StandardMetaPeriod } from '@/shared/standardMetaContract';
import { fetchPublicExpress } from './expressApi';
import { FIRST_PAINT_READ_BUDGET_MS, readFirstPaintJson } from './publicFirstPaintRead';
import { loadStandardMetaTeaserSeed } from './publicStandardMetaTeaserData';

// The current period of the last seed: read in parallel with Express's
// default next time. It changes with a patch, then one request reads in turn.
let lastPeriod: StandardMetaPeriod | null = null;

/** Anonymous meta teaser for the server-rendered guest view, or `null` to let the browser load it. */
export const loadPublicStandardMetaTeaser = cache(async () => {
  const deadline = Date.now() + FIRST_PAINT_READ_BUDGET_MS;
  const seed = await loadStandardMetaTeaserSeed(path => readFirstPaintJson(() => fetchPublicExpress(path), deadline),
    lastPeriod);
  if (seed) lastPeriod = seed.period;
  return seed;
});
