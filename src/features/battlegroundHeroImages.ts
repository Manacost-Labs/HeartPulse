const HERO_IMAGE_CACHE_VERSION = 'bg-heroes-20260806b';

export function battlegroundHeroCardImage(cardId: unknown): string {
  const normalized = String(cardId || '').trim();
  if (!/^[A-Za-z0-9_]+$/.test(normalized)) return '';
  return `/api/card-image/${encodeURIComponent(normalized)}/full.webp?v=${HERO_IMAGE_CACHE_VERSION}`;
}

type BattlegroundHeroImageCandidates = {
  cardId?: unknown;
  apiImage?: unknown;
  apiNestedImage?: unknown;
  legacyImage?: unknown;
  libraryImage?: unknown;
  fallback: string;
};

function imageUrl(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Keeps hero cards on Arena's verified image cache whenever the library can
 * identify the card. Upstream URLs remain fallbacks for legacy-only heroes.
 */
export function preferredBattlegroundHeroImage({
  cardId,
  apiImage,
  apiNestedImage,
  legacyImage,
  libraryImage,
  fallback,
}: BattlegroundHeroImageCandidates): string {
  return battlegroundHeroCardImage(cardId)
    || imageUrl(apiImage)
    || imageUrl(apiNestedImage)
    || imageUrl(legacyImage)
    || imageUrl(libraryImage)
    || fallback;
}
