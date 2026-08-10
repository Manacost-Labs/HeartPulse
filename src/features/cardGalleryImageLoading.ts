export const CARD_GALLERY_IMAGE_ROOT_MARGIN = '320px 0px';

export const CARD_GALLERY_IMAGE_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

type DeferredCardImage = {
  dataset: { cardImageSrc?: string };
  loading: 'eager' | 'lazy';
  src: string;
};

export function cardGalleryPriorityCount(viewportWidth: number): number {
  if (viewportWidth <= 640) return 2;
  if (viewportWidth <= 900) return 4;
  if (viewportWidth <= 1240) return 5;
  return 6;
}

export function activateDeferredCardImage(
  image: DeferredCardImage,
  loading: DeferredCardImage['loading'] = 'eager',
): boolean {
  const source = String(image.dataset.cardImageSrc ?? '').trim();
  if (!source) return false;
  delete image.dataset.cardImageSrc;
  image.loading = loading;
  image.src = source;
  return true;
}
