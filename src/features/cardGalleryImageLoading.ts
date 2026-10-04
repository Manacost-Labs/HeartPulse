export const CARD_GALLERY_IMAGE_ROOT_MARGIN = '320px 0px';

export const CARD_GALLERY_IMAGE_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

type DeferredCardImage = {
  dataset: { cardImageSrc?: string };
  loading: 'eager' | 'lazy';
  src: string;
};

/**
 * Cards that compete at high network priority. The server cannot know the
 * viewport, so it renders the widest first row with a real `src`; only the
 * narrowest row (two cards) asks for high priority, and Chrome raises the
 * rest once layout puts them in view. A phone, whose first row sits below
 * the fold, then no longer spends its first seconds on six card renders.
 */
export const CARD_GALLERY_HIGH_PRIORITY_COUNT = 2;

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
