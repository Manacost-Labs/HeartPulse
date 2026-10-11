import { constructedCardHorizontalArtwork } from '../model/horizontalArtwork';

/** Missing Koloda tiles fall back once; a failed fallback cannot loop. */
export function fallbackConstructedCardArtwork(image: HTMLImageElement, cardId: string | null): void {
  if (cardId && image.getAttribute('src') === constructedCardHorizontalArtwork(cardId)) {
    image.src = `/api/card-image/${encodeURIComponent(cardId)}/tile.webp?v=card_tile_v1`;
  }
}
