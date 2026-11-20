import 'server-only';
import { cache } from 'react';
import { publicArchetypeTeaser } from './publicArchetypeTeaserData';
import { takeArchetypeDetailRead } from './publicArchetypeDetailRead';

/** Reads only the anonymous Express teaser; viewer cookies never enter SSR. */
export const loadPublicArchetypeTeaser = cache(async (format: 'standard' | 'wild', slug: string) => {
  if (!/^[a-z0-9-]{1,90}$/.test(slug)) return null;
  const { status, json } = await takeArchetypeDetailRead(format, slug);
  if (status === 404) return null;
  if (status !== 200) throw new Error('Public archetype temporarily unavailable');
  return publicArchetypeTeaser(json, format, slug);
});
