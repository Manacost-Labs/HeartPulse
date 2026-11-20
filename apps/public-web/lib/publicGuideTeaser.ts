import 'server-only';
import { cache } from 'react';
import { setTimeout as delay } from 'node:timers/promises';
import { publicGuideTeaser, type PublicGuideTeaser } from './publicGuideTeaserData';
import { fetchPublicExpress } from './expressApi';

/** The deadlines of the two tries: a page never waits longer than their sum and one pause. */
const FIRST_TRY_MS = 4_000;
const SECOND_TRY_MS = 2_000;
const PAUSE_MS = 300;
const LAST_GOOD_LIMIT = 200;
const lastGood = new Map<string, PublicGuideTeaser>();

function remember(slug: string, teaser: PublicGuideTeaser) {
  lastGood.delete(slug);
  lastGood.set(slug, teaser);
  if (lastGood.size > LAST_GOOD_LIMIT) lastGood.delete(lastGood.keys().next().value as string);
}

/** A try that cannot answer (Express restarting, a 5xx) is `undefined`, never a thrown error. */
async function readTeaser(slug: string, timeoutMs: number): Promise<unknown | null | undefined> {
  try {
    const response = await fetchPublicExpress(`/api/guides-archive/teaser/${encodeURIComponent(slug)}`, undefined, { timeoutMs });
    if (response.status === 404) return null;
    if (!response.ok) { void response.body?.cancel().catch(() => undefined); return undefined; }
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * Uses only the anonymous Express projection for request-time SEO and 404s. A restart of Express (a deploy) must
 * not turn into a 500: one more try after a short pause, then the last good copy of this guide, else
 * `'unavailable'`, which the page says plainly.
 */
export const loadPublicGuideTeaser = cache(async (slug: string): Promise<PublicGuideTeaser | 'unavailable' | null> => {
  if (!slug || slug.length > 160 || /[\/\x00-\x1f]/.test(slug)) return null;
  let raw = await readTeaser(slug, FIRST_TRY_MS);
  if (raw === undefined) { await delay(PAUSE_MS); raw = await readTeaser(slug, SECOND_TRY_MS); }
  if (raw === null) return null;
  if (raw === undefined) return lastGood.get(slug) ?? 'unavailable';
  const teaser = publicGuideTeaser(raw, slug);
  remember(teaser.slug, teaser);
  if (teaser.slug !== slug) remember(slug, teaser);
  return teaser;
});
