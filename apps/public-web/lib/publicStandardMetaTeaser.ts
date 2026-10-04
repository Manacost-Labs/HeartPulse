import 'server-only';
import { cache } from 'react';
import { fetchPublicExpress } from './expressApi';
import { FIRST_PAINT_READ_BUDGET_MS, readFirstPaintJson } from './publicFirstPaintRead';
import { loadStandardMetaTeaserSeed } from './publicStandardMetaTeaserData';

/** Anonymous meta teaser for the server-rendered guest view, or `null` to let the browser load it. */
export const loadPublicStandardMetaTeaser = cache(async () => {
  const deadline = Date.now() + FIRST_PAINT_READ_BUDGET_MS;
  return loadStandardMetaTeaserSeed(path => readFirstPaintJson(() => fetchPublicExpress(path), deadline));
});
