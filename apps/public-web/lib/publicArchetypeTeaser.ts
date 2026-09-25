import 'server-only';
import { cache } from 'react';
import { publicArchetypeTeaser } from './publicArchetypeTeaserData';

/** Reads only the anonymous Express teaser; viewer cookies never enter SSR. */
export const loadPublicArchetypeTeaser = cache(async (format: 'standard' | 'wild', slug: string) => {
  if (!/^[a-z0-9-]{1,90}$/.test(slug)) return null;
  const origin = new URL(process.env.LEGACY_WEB_ORIGIN ?? 'http://127.0.0.1:3001');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('Invalid legacy origin');
  }
  const response = await fetch(new URL(`/api/constructed-archetypes/teaser/${format}/${slug}`, origin), {
    cache: 'no-store', credentials: 'omit', redirect: 'error',
    signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Public archetype temporarily unavailable');
  return publicArchetypeTeaser(await response.json(), format, slug);
});
