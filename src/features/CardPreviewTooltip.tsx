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
 * Picture order for one card: the caller's own picture, the current
 * HearthstoneJSON render, then the card image (via the CDN, then from the site
 * itself). The card image is only a fallback: its cache is not refreshed after
 * balance patches (#574: `BE_012` still shows the text before 37.0.2), and a
 * preview must never show a card's old text.
 */
export function cardPreviewSources(id: string, imageUrl?: string | null): string[] {
  const render = fallbackCardRender(id);
  const path = cardImagePath(id);
  const own = publicResourceUrl(imageUrl);
  return [...new Set([
    own || render,
    render,
    ...(path ? [cardImageDeliveryUrl(path), cardImageOriginUrl(path)] : []),
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
