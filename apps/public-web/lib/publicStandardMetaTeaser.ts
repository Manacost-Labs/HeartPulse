import 'server-only';
import { cache } from 'react';
import type { StandardMetaPeriod } from '@/shared/standardMetaContract';
import { fetchPublicExpress } from './expressApi';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';
import { loadStandardMetaTeaserSeed } from './publicStandardMetaTeaserData';

// The current period of the last seed: read in parallel with Express's
// default next time. It changes with a patch, then one request reads in turn.
let lastPeriod: StandardMetaPeriod | null = null;

/**
 * Anonymous meta teaser for the prerendered guest view, or `null` to let the
 * browser load it (the build without an API, or an upstream failure).
 */
export const loadPublicStandardMetaTeaser = cache(async () => {
  const deadline = Date.now() + PRERENDERED_DATA_READ_BUDGET_MS;
  const seed = await loadStandardMetaTeaserSeed(path => readFirstPaintJson(
    signal => fetchPublicExpress(path, signal, { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS }), deadline), lastPeriod);
  if (seed) lastPeriod = seed.period;
  return seed;
});
