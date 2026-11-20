export { observeCardGalleryImages } from '../galleryImageObserver';
export {
  activateDeferredCardImage, cardGalleryEagerMinWidth,
  CARD_GALLERY_EAGER_COUNT, CARD_GALLERY_HIGH_PRIORITY_COUNT, CARD_GALLERY_IMAGE_PLACEHOLDER, CARD_GALLERY_IMAGE_ROOT_MARGIN,
} from '../model/galleryImageLoading';

/** What the card page's «Сборка» block (`src/features/CardAssembleTeaser.tsx`) needs. Only the card routes import this entry for it. */
export { useCardAssemble } from '../useCardAssemble';
export { assembleBestBase } from '../model/cardAssemble';
export { assemblePageHref } from '../model/assemblePage';
export type { CardAssembleData } from '../model/cardAssemble';
export { creaturesLabel } from '../model/plural';
export { formatChoicePercent } from '../model/cardChoices';
