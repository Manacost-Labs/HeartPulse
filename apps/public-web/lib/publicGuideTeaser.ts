import 'server-only';
import { cache } from 'react';
import { publicGuideTeaser } from './publicGuideTeaserData';
import { fetchPublicExpress } from './expressApi';

/** Uses only the anonymous Express projection for request-time SEO and 404s. */
export const loadPublicGuideTeaser = cache(async (slug: string) => {
  if (!slug || slug.length > 160 || /[\/\x00-\x1f]/.test(slug)) return null;
  const response = await fetchPublicExpress(`/api/guides-archive/teaser/${encodeURIComponent(slug)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Public guide teaser temporarily unavailable');
  return publicGuideTeaser(await response.json(), slug);
});
