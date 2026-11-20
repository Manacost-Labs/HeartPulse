import 'server-only';
import { cache } from 'react';
import { readPublicJson } from './firstPaintStore';
import { isPublicDataMissing } from './publicCatalogCache';
import { archetypePublicPath } from './publicDataPaths';
import { archetypePublicCheck } from './publicPayloadChecks';
import { publicArchetypeTeaser } from './publicArchetypeTeaserData';

/**
 * The open layer of an archetype page (general slice, builds with deck codes and
 * card lists), read anonymously from `/api/constructed-archetypes/public/…`
 * through the store of last good copies: viewer cookies never enter SSR, and a
 * source outage serves the previous answer instead of an emptier page.
 * `null` is a page that does not exist (404/400); no data at all throws, so a
 * regenerated page is never built without it.
 */
export const loadPublicArchetypeTeaser = cache(async (format: 'standard' | 'wild', slug: string) => {
  if (!/^[a-z0-9-]{1,90}$/.test(slug)) return null;
  let raw: unknown;
  try {
    raw = await readPublicJson(archetypePublicPath(format, slug), false, archetypePublicCheck(format, slug));
  } catch (error) {
    if (isPublicDataMissing(error)) return null;
    throw new Error('Public archetype temporarily unavailable');
  }
  return publicArchetypeTeaser(raw, format, slug);
});
