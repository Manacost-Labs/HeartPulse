import 'server-only';
import { cache } from 'react';
import { fetchPublicExpress } from './expressApi';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';
import { loadStandardMetaTeaserSeed } from './publicStandardMetaTeaserData';

/**
 * The open general slice of Standard for the prerendered guest view, or `null`
 * to let the browser load it (the build without an API, or an upstream failure).
 */
export const loadPublicStandardMetaTeaser = cache(async () => {
  const deadline = Date.now() + PRERENDERED_DATA_READ_BUDGET_MS;
  return loadStandardMetaTeaserSeed(path => readFirstPaintJson(
    signal => fetchPublicExpress(path, signal, { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS }), deadline));
});
