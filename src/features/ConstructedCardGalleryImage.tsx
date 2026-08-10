import { useEffect, useRef } from 'react';
import { fallbackCardImageToOrigin } from '../config/publicAssetDelivery';
import {
  activateDeferredCardImage,
  cardGalleryPriorityCount,
  CARD_GALLERY_IMAGE_PLACEHOLDER,
  CARD_GALLERY_IMAGE_ROOT_MARGIN,
} from './cardGalleryImageLoading';

export function useCardGalleryImageLoading(cards: readonly unknown[]) {
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const immediateImageCount = cardGalleryPriorityCount(
    typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth,
  );

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery) return undefined;
    const deferredImages = [...gallery.querySelectorAll<HTMLImageElement>('img[data-card-image-src]')];
    if (!('IntersectionObserver' in window)) {
      deferredImages.forEach(image => activateDeferredCardImage(image, 'lazy'));
      return undefined;
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
  }, [cards]);

  return { galleryRef, immediateImageCount };
}

export default function ConstructedCardGalleryImage({
  src,
  alt,
  immediate,
}: {
  src: string;
  alt: string;
  immediate: boolean;
}) {
  return (
    <img
      src={immediate ? src : CARD_GALLERY_IMAGE_PLACEHOLDER}
      data-card-image-src={immediate ? undefined : src}
      alt={alt}
      width={360}
      height={497}
      loading={immediate ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={immediate ? 'high' : 'low'}
      onError={fallbackCardImageToOrigin}
    />
  );
}
