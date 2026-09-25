import 'server-only';
import { cache } from 'react';
import { publicGuideTeaser } from './publicGuideTeaserData';

/** Uses only the anonymous Express projection for request-time SEO and 404s. */
export const loadPublicGuideTeaser = cache(async (slug: string) => {
  if (!slug || slug.length > 160 || /[\/\x00-\x1f]/.test(slug)) return null;
  const origin = new URL(process.env.LEGACY_WEB_ORIGIN ?? 'http://127.0.0.1:3001');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('Invalid legacy origin');
  }
  const response = await fetch(new URL(`/api/guides-archive/teaser/${encodeURIComponent(slug)}`, origin), {
    cache: 'no-store', credentials: 'omit', redirect: 'error',
    signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Public guide teaser temporarily unavailable');
  return publicGuideTeaser(await response.json(), slug);
});
