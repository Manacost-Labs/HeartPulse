import { join } from 'node:path';

export const CARD_IMAGE_CACHE_VERSION = 'card_img_v6_blizzard';

export const CARD_IMAGE_VARIANTS = {
  thumb: { width: 360, quality: 86 },
  full: { width: 512, quality: 90 },
} as const;

export type CardImageVariant = keyof typeof CARD_IMAGE_VARIANTS;
export type CardImageSource = 'blizzard' | 'fallback' | 'placeholder';

export function cardImageCacheFilename(
  cardId: string | number,
  variant: CardImageVariant,
  source: CardImageSource,
): string {
  return `${cardId}-${variant}-${source}-${CARD_IMAGE_CACHE_VERSION}.webp`;
}

export function cardImageCachePath(
  cacheDir: string,
  cardId: string | number,
  variant: CardImageVariant,
  source: CardImageSource,
): string {
  return join(cacheDir, cardImageCacheFilename(cardId, variant, source));
}
