import 'server-only';
import { cache } from 'react';
import { publicArchetypeTeaser } from './publicArchetypeTeaserData';
import { fetchPublicExpress } from './expressApi';

/** Reads only the anonymous Express teaser; viewer cookies never enter SSR. */
export const loadPublicArchetypeTeaser = cache(async (format: 'standard' | 'wild', slug: string) => {
  if (!/^[a-z0-9-]{1,90}$/.test(slug)) return null;
  const response = await fetchPublicExpress(`/api/constructed-archetypes/teaser/${format}/${slug}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Public archetype temporarily unavailable');
  return publicArchetypeTeaser(await response.json(), format, slug);
});
