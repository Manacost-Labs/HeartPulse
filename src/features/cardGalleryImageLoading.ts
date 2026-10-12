export {
  activateDeferredCardImage, cardGalleryEagerMinWidth,
  CARD_GALLERY_HIGH_PRIORITY_COUNT, CARD_GALLERY_IMAGE_PLACEHOLDER, CARD_GALLERY_IMAGE_ROOT_MARGIN,
} from '../modules/constructedCards/public/index';

// Keep the previous facade contract without adding an unused module export.
export function cardGalleryPriorityCount(viewportWidth: number): number {
  if (viewportWidth <= 640) return 2;
  if (viewportWidth <= 900) return 4;
  if (viewportWidth <= 1240) return 5;
  return 6;
}
