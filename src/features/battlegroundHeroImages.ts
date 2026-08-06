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
 * Preserves the dedicated Battlegrounds hero portrait supplied by the stats
 * and library feeds. The generic card-image cache is only a final fallback:
 * Blizzard renders several legacy hero IDs as hero-power card frames there.
 * Known remote portraits are still delivered same-origin by publicResourceUrl
 * at the rendering boundary.
 */
export function preferredBattlegroundHeroImage({
  cardId,
  apiImage,
  apiNestedImage,
  legacyImage,
  libraryImage,
  fallback,
}: BattlegroundHeroImageCandidates): string {
  return imageUrl(apiImage)
    || imageUrl(apiNestedImage)
    || imageUrl(libraryImage)
    || imageUrl(legacyImage)
    || battlegroundHeroCardImage(cardId)
    || fallback;
}
