import 'server-only';
import { cache } from 'react';
import { parsePublicViciousGold, VICIOUS_GOLD_PUBLIC_PATH } from '@/shared/viciousGoldPublicContract';
import { fetchPublicExpress } from './expressApi';
import { loadWithLastGood } from './pageLastGood';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';

const BUILD_PHASE = 'phase-production-build';
/** One warning per outage: set when a render gets no fresh frame, cleared by the next fresh one. */
let outageWarned = false;

/**
 * The open frame of the Vicious Syndicate Gold report for the prerendered page (#656), read without a cookie: guests
 * and robots get one HTML. A prerender read gets a 503 from Express while vS is down (never a stale frame, which
 * would sit in Next's data cache), so the frame is then the last one the page accepted (`pageLastGood`: memory and a
 * file in `shared/server-data`, checked again by the same parser, #677). `null` with neither. An outage logs one
 * warning, not one per regeneration.
 */
export const loadPublicViciousGold = cache(async () => {
  let fresh = false;
  const frame = await loadWithLastGood('vicious-gold', () => readFirstPaintJson(
    signal => fetchPublicExpress(VICIOUS_GOLD_PUBLIC_PATH, signal, { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS, freshOnly: true }),
    Date.now() + PRERENDERED_DATA_READ_BUDGET_MS,
  ), raw => {
    const parsed = parsePublicViciousGold(raw);
    fresh = parsed !== null;
    return parsed;
  }, parsePublicViciousGold);
  if (fresh) outageWarned = false;
  else if (!outageWarned && process.env.NEXT_PHASE !== BUILD_PHASE) {
    outageWarned = true;
    console.warn(frame
      ? '[vicious-gold] open frame unavailable: the page renders its last good frame'
      : '[vicious-gold] open frame unavailable and none kept: the earlier copy of the page stays');
  }
  return frame;
});

/**
 * The frame a prerendered page renders. Regenerating at runtime with no frame at all throws: Next does not publish
 * the result and keeps the earlier copy, so an outage never replaces a page with data by an empty one. Only the
 * build, which has no Express, prints the stub; the warm-up after a deploy replaces it.
 */
export async function loadPublicViciousGoldPage() {
  const frame = await loadPublicViciousGold();
  if (!frame && process.env.NEXT_PHASE !== BUILD_PHASE) {
    throw new Error('Open Vicious Syndicate Gold unavailable: the earlier copy stays');
  }
  return frame;
}
