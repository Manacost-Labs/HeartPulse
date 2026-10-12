export const CARD_GALLERY_IMAGE_ROOT_MARGIN = '320px 0px';
export const CARD_GALLERY_IMAGE_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
export const CARD_GALLERY_HIGH_PRIORITY_COUNT = 2;

/** The browser selects wider first-row candidates without a different hydration tree. */
export function cardGalleryEagerMinWidth(index: number): number | undefined {
  if (index === 2 || index === 3) return 641;
  if (index === 4) return 901;
  if (index === 5) return 1241;
  return undefined;
}

type DeferredCardImage = {
  dataset: { cardImageSrc?: string };
  loading: 'eager' | 'lazy';
  src: string;
};

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
