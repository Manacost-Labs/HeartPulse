/**
 * Link-preview (Open Graph / Twitter) images of hearthpulse.net. The PNGs are
 * rendered by `scripts/render-share-images.mjs` from the same section list and
 * committed under `public/assets/og/`. Messengers (Telegram, VK) cache a
 * preview by its URL, so a re-render must bump `SHARE_IMAGE_VERSION` (and the
 * copy of the default URL in `src/shared/seo/publicUrlPolicy.ts`). The legacy
 * `/assets/og-preview.png` keeps a copy of the default image for old links.
 */
export const SHARE_IMAGE_VERSION = '20261027';
export const SHARE_IMAGE_WIDTH = 1200;
export const SHARE_IMAGE_HEIGHT = 630;
export const SHARE_IMAGE_ORIGIN = 'https://hearthpulse.net';

export const SHARE_IMAGE_SECTIONS = ['default', 'standard', 'battlegrounds', 'arena', 'leaderboards', 'articles'] as const;
export type ShareImageSection = typeof SHARE_IMAGE_SECTIONS[number];

// Longest prefix wins; a prefix matches the path itself and everything below it.
const SECTION_PREFIXES: ReadonlyArray<readonly [string, ShareImageSection]> = [
  ['/standard', 'standard'],
  ['/archetypes', 'standard'],
  ['/battlegrounds', 'battlegrounds'],
  ['/heroes', 'battlegrounds'],
  ['/library', 'battlegrounds'],
  ['/tierlist', 'arena'],
  ['/classes', 'arena'],
  ['/legendaries', 'arena'],
  ['/leaderboards', 'leaderboards'],
  ['/articles', 'articles'],
  ['/guides-archive', 'articles'],
];

/** Site-relative URL of a section preview, versioned so caches refetch it after a re-render. */
export function shareImagePath(section: ShareImageSection = 'default'): string {
  return `/assets/og/hearthpulse-${section}.png?v=${SHARE_IMAGE_VERSION}`;
}

/** Absolute URL of a section preview for HTML rendered outside Next metadata. */
export function shareImageUrl(section: ShareImageSection = 'default', origin = SHARE_IMAGE_ORIGIN): string {
  return `${origin.replace(/\/$/, '')}${shareImagePath(section)}`;
}

/** The preview section of a public pathname; unlisted paths use the general site preview. */
export function shareImageSectionForPath(pathname: string): ShareImageSection {
  const path = pathname.replace(/\/+$/, '') || '/';
  let match: ShareImageSection = 'default';
  let length = 0;
  for (const [prefix, section] of SECTION_PREFIXES) {
    if ((path === prefix || path.startsWith(`${prefix}/`)) && prefix.length > length) {
      match = section;
      length = prefix.length;
    }
  }
  return match;
}
