import { AnchoredImagePreview } from '../shared/ui/AnchoredImagePreview';
import { publicResourceUrl } from '../publicResourceUrl';
import { constructedCardRenderImage } from './constructedCardMedia';
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

/**
 * The full card picture a hover preview starts with. The edge nodes keep
 * `/api/card-image/<id>/full.webp` on local disk (about 60 KB), while the
 * HearthstoneJSON render is a ~0.5 MB PNG that every edge fetches from the
 * origin on its first request, which takes longer than a hover lasts.
 */
export function cardPreviewImage(id: string): string {
  return constructedCardRenderImage(id) ?? fallbackCardRender(id);
}

/** Picture order for one card: the caller's own picture, then the edge copy, then the render. */
export function cardPreviewSources(id: string, imageUrl?: string | null): string[] {
  const render = fallbackCardRender(id);
  const own = publicResourceUrl(imageUrl);
  // Callers that pass the default render of this very card get the light edge copy first.
  const preferred = own && own !== render ? own : cardPreviewImage(id);
  return [...new Set([preferred, cardPreviewImage(id), render])];
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
