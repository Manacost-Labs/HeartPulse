import {
  createContext,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
  useId,
  useLayoutEffect,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { usePageScrollLock } from '../../hooks/usePageScrollLock';
import { useDockedPanelEntrance } from '../transitions/useDockedPanelEntrance';
import { modalViewportVariables } from './modalSurfaceModel';
import { installLightboxIntent } from '../../shared/ui/lightboxIntent';
import { useLightboxZoom } from './useLightboxZoom';
import {
  isTopModalSurface,
  registerModalSurface,
} from './modalSurfaceManager';
import './ModalSurface.css';

type ModalSurfaceProps = {
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  backdropClassName?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  closeLabel?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  /**
   * A lightbox: the picture that opened it zooms from its place on the page
   * into the `[data-lightbox-media]` image and back on close (lightboxMotion.ts).
   * Every way of closing (Esc, the backdrop, `[data-modal-close]` controls, a
   * swipe down on a touch screen) plays the closing before `onClose`.
   */
  zoom?: boolean;
};

/** The source of the picture that opened a zooming lightbox: its first frame shows it (LightboxImage). */
export const LightboxOriginContext = createContext<string | null>(null);

installLightboxIntent();

function viewportStyle(): CSSProperties {
  if (typeof window === 'undefined') return {};
  return modalViewportVariables(window.visualViewport, {
    width: window.innerWidth,
    height: window.innerHeight,
  }) as CSSProperties;
}

export default function ModalSurface({
  children,
  className = '',
  panelClassName = '',
  backdropClassName = '',
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  closeLabel = 'Закрыть окно',
  initialFocusRef,
  onClose,
  onKeyDown,
  zoom = false,
}: ModalSurfaceProps) {
  const reactId = useId();
  const modalIdRef = useRef(`modal-surface-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const initialFocusTargetRef = useRef(initialFocusRef);
  const onCloseRef = useRef(onClose);
  const onKeyDownRef = useRef(onKeyDown);
  initialFocusTargetRef.current = initialFocusRef;
  onCloseRef.current = onClose;
  onKeyDownRef.current = onKeyDown;
  const { originSource, requestCloseRef } = useLightboxZoom(zoom, surfaceRef, panelRef, onCloseRef);
  const requestClose = () => requestCloseRef.current();

  usePageScrollLock(true);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const panel = panelRef.current;
    if (!surface || !panel) return undefined;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return registerModalSurface({
      id: modalIdRef.current,
      surface,
      panel,
      trigger,
      initialFocus: () => initialFocusTargetRef.current?.current ?? null,
      close: () => requestCloseRef.current(),
      keyDown: event => onKeyDownRef.current?.(event),
    });
  }, []);

  useDockedPanelEntrance(panelRef, !zoom);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return undefined;
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const variables = modalViewportVariables(window.visualViewport, {
          width: window.innerWidth,
          height: window.innerHeight,
        });
        for (const [property, value] of Object.entries(variables)) surface.style.setProperty(property, value);
      });
    };
    update();
    window.addEventListener('resize', update, { passive: true });
    window.visualViewport?.addEventListener('resize', update, { passive: true });
    window.visualViewport?.addEventListener('scroll', update, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);

  if (typeof document === 'undefined') return null;

  const handleBackdropClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.currentTarget !== event.target || !isTopModalSurface(modalIdRef.current)) return;
    requestClose();
  };
  const handlePanelClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-modal-close]')) return;
    event.preventDefault();
    requestClose();
  };

  return createPortal(
    <div
      ref={surfaceRef}
      className={`modal-surface ${className}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      data-modal-surface-id={modalIdRef.current}
      data-modal-surface-zoom={zoom ? '' : undefined}
      style={viewportStyle()}
    >
      <button
        type="button"
        tabIndex={-1}
        className={`modal-surface__backdrop ${backdropClassName}`.trim()}
        aria-label={closeLabel}
        data-modal-surface-backdrop=""
        onClick={handleBackdropClick}
      />
      <div
        ref={panelRef}
        className={`modal-surface__panel ${panelClassName}`.trim()}
        data-modal-surface-panel=""
        tabIndex={-1}
        onClick={handlePanelClick}
      >
        <LightboxOriginContext.Provider value={originSource}>{children}</LightboxOriginContext.Provider>
      </div>
    </div>,
    document.body,
  );
}
