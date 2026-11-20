import 'server-only';
import { cache } from 'react';
import { fetchPublicExpress } from './expressApi';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';
import { GUIDES_LIST_PATH, parsePublicGuidesList } from './publicGuidesListData';

/**
 * The first page of the open guide list for the prerendered archive, or `null` (the browser then asks for it). The read is
 * fresh-only: Express answers a prerender read with 503 instead of a last good copy, which would sit in Next's data cache.
 */
export const loadPublicGuidesList = cache(async () => parsePublicGuidesList(await readFirstPaintJson(
  signal => fetchPublicExpress(GUIDES_LIST_PATH, signal, { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS, freshOnly: true }),
  Date.now() + PRERENDERED_DATA_READ_BUDGET_MS,
)));

/**
 * The list a prerendered archive page renders. Regenerating at runtime without data throws: Next keeps the earlier copy, so a
 * source outage never replaces a page with cards by one with skeletons. Only the build, which has no Express, prints the
 * stub; the warm-up after a deploy replaces it.
 */
export async function loadPublicGuidesPageList() {
  const list = await loadPublicGuidesList();
  if (!list && process.env.NEXT_PHASE !== 'phase-production-build') throw new Error('Open guide list unavailable: the earlier copy stays');
  return list;
}
