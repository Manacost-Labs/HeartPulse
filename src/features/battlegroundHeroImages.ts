const HERO_IMAGE_CACHE_VERSION = 'bg-heroes-20260806b';
const BATTLEGROUND_IMAGE_ORIGIN = 'https://api.kolodahearthstone.com';

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
    const isFirstPartyRelative = source.startsWith('/uploads/');
    if (!isFirstPartyRelative && !source.startsWith(`${BATTLEGROUND_IMAGE_ORIGIN}/`)) return source;
    const url = new URL(source, BATTLEGROUND_IMAGE_ORIGIN);
    if (
      url.protocol !== 'https:'
      || url.hostname !== 'api.kolodahearthstone.com'
    ) {
      return source;
    }
    if (url.pathname.startsWith('/uploads/cards/')) return isFirstPartyRelative ? url.toString() : source;
    if (!url.pathname.startsWith('/uploads/framed/')) return source;
    url.pathname = `/uploads/cards/${encodeURIComponent(normalizedCardId)}.png`;
    return url.toString();
  } catch {
    return source;
  }
}

type BattlegroundBuddyImageCard = {
  card_id?: unknown;
  image?: unknown;
  image_gold?: unknown;
};

export function preferredBattlegroundGoldenBuddyImage(
  buddyCard: BattlegroundBuddyImageCard | null | undefined,
  goldenBuddy: BattlegroundBuddyImageCard | null | undefined,
): string {
  const cardId = goldenBuddy?.card_id || buddyCard?.card_id;
  for (const source of [buddyCard?.image_gold, goldenBuddy?.image_gold, goldenBuddy?.image]) {
    const candidate = battlegroundFullCardImage(cardId, source);
    if (candidate) return candidate;
  }
  return battlegroundHeroCardImage(cardId);
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
