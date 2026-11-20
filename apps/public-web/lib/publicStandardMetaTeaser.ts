import 'server-only';
import { cache } from 'react';
import { fetchPublicExpress } from './expressApi';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';
import { loadStandardMetaTeaserSeed } from './publicStandardMetaTeaserData';
import type { StandardMetaFormat } from '@/shared/standardMetaContract';

/**
 * The open general slice of Standard for the prerendered guest view, or `null`
 * to let the browser load it (the build without an API, or an upstream failure).
 */
export const loadPublicStandardMetaTeaser = cache(async (format: StandardMetaFormat = 'standard') => {
  const deadline = Date.now() + PRERENDERED_DATA_READ_BUDGET_MS;
  return loadStandardMetaTeaserSeed(path => readFirstPaintJson(
    signal => fetchPublicExpress(path, signal, { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS, freshOnly: true }), deadline), format);
});

/**
 * The slice a prerendered meta page renders. Regenerating at runtime without data throws: Next does
 * not publish the result and keeps the earlier copy (after a restart too, when it is the copy on
 * disk), so a source outage never replaces a page with data by an empty one. Only the build, which
 * has no Express, prints the stub; the warm-up after a deploy replaces it.
 */
export async function loadPublicStandardMetaPageTeaser(format: StandardMetaFormat = 'standard') {
  const teaser = await loadPublicStandardMetaTeaser(format);
  if (!teaser && process.env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error(`Open ${format} meta unavailable: the earlier copy stays`);
  }
  return teaser;
}
