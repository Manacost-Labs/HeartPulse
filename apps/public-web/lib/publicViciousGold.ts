import 'server-only';
import { cache } from 'react';
import { parsePublicViciousGold, VICIOUS_GOLD_PUBLIC_PATH } from '@/shared/viciousGoldPublicContract';
import { fetchPublicExpress } from './expressApi';
import { loadWithLastGood } from './pageLastGood';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';

/** One warning per outage: set when a render gets no fresh frame, cleared by the next fresh one. */
let outageWarned = false;

/**
 * The open frame of the Vicious Syndicate Gold report for the prerendered page (#656), read without a cookie: guests
 * and robots get one HTML. A prerender read gets a 503 from Express while vS is down (never a stale frame, which
 * would sit in Next's data cache), so the regeneration renders the last frame the page accepted (`pageLastGood`:
 * memory and a file in `shared/server-data`, checked again by the same parser) instead of throwing on every attempt
 * (#677). `null` only with neither, as in the build without Express: the page then loads the frame in the browser.
 * An outage logs one warning, not an error per regeneration.
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
  else if (!outageWarned) {
    outageWarned = true;
    console.warn(frame
      ? '[vicious-gold] open frame unavailable: the page renders its last good frame'
      : '[vicious-gold] open frame unavailable and none kept: the page loads it in the browser');
  }
  return frame;
});
