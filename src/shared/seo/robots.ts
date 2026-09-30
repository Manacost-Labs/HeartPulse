export type PublicIndexPolicy = 'index' | 'noindex-follow' | 'noindex-nofollow';

/** Robots directives of an indexable page: large image, full snippet and video previews. */
export const INDEXABLE_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

export function robotsContent(indexPolicy: PublicIndexPolicy): string {
  if (indexPolicy === 'noindex-nofollow') return 'noindex, nofollow';
  if (indexPolicy === 'noindex-follow') return 'noindex, follow';
  return INDEXABLE_ROBOTS;
}
