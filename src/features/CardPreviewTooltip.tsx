import { AnchoredImagePreview } from '../shared/ui/AnchoredImagePreview';
import { publicResourceUrl } from '../publicResourceUrl';
import { withCardImageRepairVersion } from '../../shared/cardImageRepairs';
import { cardImageDeliveryUrl, cardImageOriginUrl } from '../config/publicAssetDelivery';
import { CONSTRUCTED_CARD_IMAGE_VERSION } from './constructedCardImageVersion';
import './CardPreviewTooltip.css';

export type CardPreviewTarget = {
  id: string;
  name: string;
  imageUrl?: string | null;
  rect: DOMRect;
};

export function fallbackCardRender(id: string): string {
  return `/api/public-resource/hsjson/v1/render/latest/ruRU/512x/${encodeURIComponent(id)}.png`;
}

function cardImagePath(id: string): string | null {
  if (!/^[A-Za-z0-9_]{1,80}$/.test(id)) return null;
  return `/api/card-image/${encodeURIComponent(id)}/full.webp?v=${withCardImageRepairVersion(CONSTRUCTED_CARD_IMAGE_VERSION, id)}`;
}

/**
 * The full card picture a hover preview starts with: the card image through
 * the card CDN host, which the edge nodes answer from their own cache (about
 * 60 KB). The HearthstoneJSON render is a ~0.5 MB PNG that every edge fetches
 * from the origin on its first request, longer than a hover lasts.
 */
export function cardPreviewImage(id: string): string {
  const path = cardImagePath(id);
  return path ? cardImageDeliveryUrl(path) : fallbackCardRender(id);
}

/**
 * Renders of the card's current face that the card image already shows: the
 * HearthstoneJSON render, and the data API render, whose `?v=` is the catalog
 * sync time, so its edge copy goes cold several times a day. A caller's other
 * picture (a patch-notes version of the card, a cosmetic) stays first.
 */
function isCurrentCardRender(source: string, id: string): boolean {
  const path = source.split('?')[0];
  return path === fallbackCardRender(id)
    || path === `/api/public-resource/db/uploads/constructed-related/${encodeURIComponent(id)}.png`;
}

/**
 * Picture order for one card: the caller's own picture, the card image via the
 * CDN, the same image from the site itself (the CDN is down), the caller's
 * current-face render, the HearthstoneJSON render.
 */
export function cardPreviewSources(id: string, imageUrl?: string | null): string[] {
  const path = cardImagePath(id);
  const own = publicResourceUrl(imageUrl);
  const ownFirst = own && !(path && isCurrentCardRender(own, id)) ? [own] : [];
  return [...new Set([
    ...ownFirst,
    cardPreviewImage(id),
    ...(path ? [cardImageOriginUrl(path)] : []),
    ...(own ? [own] : []),
    fallbackCardRender(id),
  ])];
}

/** `bare`: the card render alone, without the plate (the fun-decks page). */
export default function CardPreviewTooltip({ preview, bare = false, keepOnScroll = false }: { preview: CardPreviewTarget; bare?: boolean; keepOnScroll?: boolean }) {
  const [preferredSource, ...fallbacks] = cardPreviewSources(preview.id, preview.imageUrl);
  return (
    <AnchoredImagePreview
      key={`${preview.id}:${preferredSource}`}
      source={preferredSource}
      fallbackSource={fallbacks}
      name={preview.name}
      accessibleName={`Полная карта ${preview.name}`}
      anchorRect={preview.rect}
      previewId={preview.id}
      bare={bare}
      keepOnScroll={keepOnScroll}
      className="card-preview-tooltip"
      data-card-preview-id={preview.id}
    />
  );
}
