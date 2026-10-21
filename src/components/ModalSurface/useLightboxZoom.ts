import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { lightboxOrigin, playLightbox, swipeToClose, type LightboxMotion } from './lightboxMotion';

/**
 * ModalSurface's `zoom`: the origin picture (read once, before the content's
 * first render, while the press that opened the lightbox is current), the
 * opening played before the first paint, and `requestClose`, through which
 * every way of closing plays the closing before the caller's `onClose`.
 */
export function useLightboxZoom(zoom: boolean, surfaceRef: RefObject<HTMLElement | null>, panelRef: RefObject<HTMLElement | null>,
  onCloseRef: RefObject<() => void>) {
  const [origin] = useState(() => (zoom && typeof document !== 'undefined' ? lightboxOrigin() : null));
  const motionRef = useRef<LightboxMotion | null>(null);
  const closingRef = useRef(false);
  const requestCloseRef = useRef(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const motion = motionRef.current;
    if (!motion) { onCloseRef.current(); return; }
    void motion.close().finally(() => onCloseRef.current());
  });

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const panel = panelRef.current;
    if (!zoom || !surface || !panel?.animate) return undefined;
    const media = panel.querySelector<HTMLImageElement>('img[data-lightbox-media]');
    const motion = playLightbox(surface, panel, media, origin);
    motionRef.current = motion;
    const backdrop = surface.querySelector<HTMLElement>('[data-modal-surface-backdrop]');
    const stopSwipe = swipeToClose(panel, backdrop, () => requestCloseRef.current());
    return () => { stopSwipe(); motion.cancel(); motionRef.current = null; };
  }, [zoom, origin, surfaceRef, panelRef]);

  return { originSource: origin ? origin.currentSrc || origin.src : null, requestCloseRef };
}
