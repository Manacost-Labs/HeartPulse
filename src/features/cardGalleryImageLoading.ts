export {
  activateDeferredCardImage, cardGalleryEagerMinWidth,
  CARD_GALLERY_EAGER_COUNT, CARD_GALLERY_HIGH_PRIORITY_COUNT, CARD_GALLERY_IMAGE_PLACEHOLDER, CARD_GALLERY_IMAGE_ROOT_MARGIN,
} from '../modules/constructedCards/public/index';

// This legacy count describes eager candidates, independently of network fetchPriority.
export function cardGalleryPriorityCount(viewportWidth: number): number {
  if (viewportWidth <= 640) return 2;
  if (viewportWidth <= 900) return 4;
  if (viewportWidth <= 1240) return 5;
  return 6;
}
