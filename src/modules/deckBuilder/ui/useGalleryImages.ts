import { useEffect, useRef } from 'react';
import type { BuilderCard } from '../model/selection';

export const GALLERY_IMAGE_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='360' height='497'/%3E";

/** Defers full card renders until they approach the viewport or the configuration scroll area. */
export function useGalleryImages(cards: BuilderCard[]) {
  const gallery = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = gallery.current;
    if (!element) return;
    const activate = (image: HTMLImageElement) => {
      const source = image.dataset.gallerySrc;
      if (!source) return;
      image.src = source;
      delete image.dataset.gallerySrc;
    };
    const images = element.querySelectorAll<HTMLImageElement>('img[data-gallery-src]');
    if (!('IntersectionObserver' in window)) { images.forEach(activate); return; }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        activate(entry.target as HTMLImageElement);
        observer.unobserve(entry.target);
      }
    }, { root: element.closest('.hp-builder-configuration-body'), rootMargin: '160px' });
    images.forEach(image => observer.observe(image));
    return () => observer.disconnect();
  }, [cards]);
  return gallery;
}
