const CARD_IMAGE_VERSION = 'cosmetics-20260726';

export function cachedCardImage(cardId: string) {
  return `/api/card-image/${encodeURIComponent(cardId)}/full.webp?v=${CARD_IMAGE_VERSION}`;
}
