import { activateDeferredCardImage, CARD_GALLERY_IMAGE_ROOT_MARGIN } from './model/galleryImageLoading';

/** Starts proximity loading for a mounted gallery; the caller owns the returned cleanup. */
export function observeCardGalleryImages(gallery: HTMLElement): () => void {
  const deferredImages = gallery.querySelectorAll<HTMLImageElement>('img[data-card-image-src]');
  if (!('IntersectionObserver' in window)) {
    deferredImages.forEach(image => activateDeferredCardImage(image, 'lazy'));
    return () => undefined;
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const image = entry.target as HTMLImageElement;
      activateDeferredCardImage(image);
      observer.unobserve(image);
    }
  }, { rootMargin: CARD_GALLERY_IMAGE_ROOT_MARGIN });
  deferredImages.forEach(image => observer.observe(image));
  return () => observer.disconnect();
}
