/**
 * Cache version of the constructed card pictures behind `/api/card-image/`.
 * The route answers `immutable`, so a new value is what makes browsers and
 * edges fetch a picture again after its card changed. Kept apart from
 * `constructedCardMedia` so light callers (the hover preview) do not pull the
 * media catalogue into their bundle.
 */
export const CONSTRUCTED_CARD_IMAGE_VERSION = 'constructed-cards-patch-36-2-20260805';
