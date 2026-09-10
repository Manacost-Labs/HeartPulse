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
 * The details API exposes a small framed portrait for some buddies alongside
 * the current full-card asset. Keep the API-provided cache version, but switch
 * only this first-party framed URL to its matching full-card representation.
 */
export function battlegroundFullCardImage(cardId: unknown, sourceImage: unknown): string {
  const source = imageUrl(sourceImage);
  const normalizedCardId = String(cardId || '').trim();
  if (!source || !/^[A-Za-z0-9_]+$/.test(normalizedCardId)) return source;

  try {
    const url = new URL(source);
    if (
      url.protocol !== 'https:'
      || url.hostname !== 'api.kolodahearthstone.com'
      || !url.pathname.startsWith('/uploads/framed/')
    ) {
      return source;
    }
    url.pathname = `/uploads/cards/${encodeURIComponent(normalizedCardId)}.png`;
    return url.toString();
  } catch {
    return source;
  }
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
