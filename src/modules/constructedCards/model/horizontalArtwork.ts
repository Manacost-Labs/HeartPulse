/** Koloda's horizontal artwork is delivered through the existing image proxy. */
export function constructedCardHorizontalArtwork(cardId: string): string {
  return `/api/public-resource/db/uploads/horizontal-art/constructed_card/${encodeURIComponent(cardId)}.webp`;
}
