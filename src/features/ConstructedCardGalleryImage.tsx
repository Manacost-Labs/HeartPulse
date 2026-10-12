import { useCallback, useEffect, useRef } from 'react';
import { observeCardGalleryImages, CARD_GALLERY_HIGH_PRIORITY_COUNT, CARD_GALLERY_IMAGE_PLACEHOLDER } from '../modules/constructedCards/public';
import { fallbackCardImageElementToOrigin } from '../config/publicAssetDelivery';
export function useCardGalleryImageLoading(cards: readonly unknown[]) {
  const galleryRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (galleryRef.current) return observeCardGalleryImages(galleryRef.current);
    return undefined;
  }, [cards]);
  return { galleryRef, immediateImageCount: CARD_GALLERY_HIGH_PRIORITY_COUNT };
}

type GalleryImageProps = { src: string; alt: string; immediate: boolean; highPriority: boolean; minWidth?: number };

export default function ConstructedCardGalleryImage({ src, alt, immediate, highPriority, minWidth }: GalleryImageProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const retry = useCallback((image: HTMLImageElement) => {
    if (!fallbackCardImageElementToOrigin(image)) return;
    if (image.dataset.cardImageSrc) image.dataset.cardImageSrc = image.src;
    // A selected picture source overrides img.src, including an origin retry.
    image.parentElement?.querySelectorAll('source').forEach(source => { source.srcset = image.src; });
  }, []);
  useEffect(() => {
    const image = imageRef.current;
    // Preloads can fail before hydration attaches an error listener.
    if (image?.complete && image.naturalWidth === 0) retry(image);
  }, [src, retry]);
  const image = <img
    ref={imageRef}
    className="constructed-cards__gallery-image"
    src={immediate ? src : CARD_GALLERY_IMAGE_PLACEHOLDER}
    data-card-image-src={immediate ? undefined : src}
    alt={alt}
    width={360}
    height={497}
    loading={immediate || minWidth !== undefined ? 'eager' : 'lazy'}
    decoding="async"
    fetchPriority={highPriority ? 'high' : immediate || minWidth !== undefined ? undefined : 'low'}
    onError={event => retry(event.currentTarget)}
  />;
  return minWidth === undefined ? image : <picture className="constructed-cards__gallery-picture">
    <source media={`(min-width: ${minWidth}px)`} srcSet={src} width={360} height={497} />
    {image}
  </picture>;
}
