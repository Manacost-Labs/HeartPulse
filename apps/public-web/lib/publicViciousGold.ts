import 'server-only';
import { cache } from 'react';
import { parsePublicViciousGold, VICIOUS_GOLD_PUBLIC_PATH } from '@/shared/viciousGoldPublicContract';
import { fetchPublicExpress } from './expressApi';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';

/**
 * The open frame of the Vicious Syndicate Gold report for the prerendered page (#656), or `null` to let the browser
 * load it (the build without an API, or an upstream failure). Read without a cookie: guests and robots get one HTML.
 */
export const loadPublicViciousGold = cache(async () => {
  const deadline = Date.now() + PRERENDERED_DATA_READ_BUDGET_MS;
  return parsePublicViciousGold(await readFirstPaintJson(
    signal => fetchPublicExpress(VICIOUS_GOLD_PUBLIC_PATH, signal, { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS, freshOnly: true }),
    deadline));
});

/**
 * The frame a prerendered page renders. Regenerating at runtime without data throws: Next does not publish the
 * result and keeps the earlier copy, so a source outage never replaces a page with data by an empty one. Only the
 * build, which has no Express, prints the stub; the warm-up after a deploy replaces it.
 */
export async function loadPublicViciousGoldPage() {
  const frame = await loadPublicViciousGold();
  if (!frame && process.env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error('Open Vicious Syndicate Gold unavailable: the earlier copy stays');
  }
  return frame;
}
