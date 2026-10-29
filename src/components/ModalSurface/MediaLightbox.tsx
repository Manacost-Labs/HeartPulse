import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { preloadLightboxImage } from '../../shared/ui/lightboxIntent';
import { LightboxImage } from './LightboxImage';
import ModalSurface from './ModalSurface';
import type { MediaLightboxController } from './mediaLightboxController';
import { useMediaLightboxPaging } from './useMediaLightboxPaging';
import './MediaLightbox.css';

export type MediaLightboxItem = {
  /** Unique among the items: it keys the slide, so a picture that stays beside the one on show is not reloaded. */
  id: string;
  kind?: 'image' | 'video';
  src: string;
  srcSet?: string;
  sizes?: string;
  /** A smaller copy already on the page: this picture's first frame, until the full size is decoded. */
  thumb?: string | null;
  alt: string;
  title?: string;
  description?: string | null;
  /** A line of facts under the title (size, source). */
  meta?: string | null;
};

type MediaLightboxProps = {
  items: readonly MediaLightboxItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  /** Controls of the picture on show (a download or source link), before the close button: give them the class `media-lightbox__action`. */
  actions?: ReactNode;
  /** The error of one picture's file (a caller's fallback image). */
  onImageError?: (event: SyntheticEvent<HTMLImageElement>, item: MediaLightboxItem) => void;
};

type Slot = 'prev' | 'current' | 'next';

/** The picture on the page whose trigger preloads `src` (`data-lightbox-src`): where a closing lightbox flies back to. */
function pageThumbnail(src: string): HTMLImageElement | null {
  for (const trigger of document.querySelectorAll<HTMLElement>('[data-lightbox-src]')) {
    if (trigger.dataset.lightboxSrc === src) return trigger.querySelector('img');
  }
  return null;
}

const KEY_ZOOM = 1.5;
const SHOWN = '[data-slot="current"] img[data-lightbox-media]';

/**
 * The one viewer of pictures: a zooming ModalSurface (the thumbnail that was
 * pressed flies into it and back) with paging, a counter and the gestures of a
 * photo viewer: swipe sideways to page, down to close, pinch and double tap to
 * zoom, drag to pan. Keys: ← → page, + − 0 zoom, Esc closes. The neighbours are
 * mounted beside the picture on show and preloaded, so a page turn never shows
 * an empty frame. The gesture arithmetic is mediaLightboxGestures.ts, its DOM
 * half mediaLightboxController.ts.
 */
export default function MediaLightbox(props: MediaLightboxProps) {
  const { items, index, onClose } = props;
  const [opened] = useState(() => items[index]?.id ?? null);
  const titleId = useId();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const requestCloseRef = useRef<(() => void) | null>(null);
  const keyRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  const item = items[index] ?? null;

  const closingTargets = useMemo(() => ({
    media: () => stageRef.current?.querySelector<HTMLImageElement>(SHOWN) ?? null,
    origin: (first: HTMLImageElement | null) => {
      const id = stageRef.current?.querySelector<HTMLElement>(SHOWN)?.closest<HTMLElement>('[data-item-id]')?.dataset.itemId;
      // The picture that opened the lightbox goes back to the thumbnail that was pressed; another one to its own, if that is on screen.
      if (id === opened) return first;
      const src = items.find(candidate => candidate.id === id)?.src;
      return src ? pageThumbnail(src) : null;
    },
  }), [items, opened]);

  if (!item) return null;
  const heading = item.title || item.alt;
  return (
    <ModalSurface
      className="media-lightbox"
      panelClassName={`media-lightbox__panel${items.length > 1 ? '' : ' media-lightbox__panel--single'}`}
      backdropClassName="media-lightbox__backdrop"
      ariaLabel={heading ? undefined : 'Просмотр изображений'}
      ariaLabelledBy={heading ? titleId : undefined}
      closeLabel="Закрыть просмотр"
      initialFocusRef={closeRef}
      onClose={onClose}
      zoom
      swipeClose={false}
      closingTargets={closingTargets}
      closeRef={requestCloseRef}
      onKeyDown={event => keyRef.current(event)}
    >
      <Viewer {...props} item={item} opened={opened} titleId={titleId} stageRef={stageRef} closeRef={closeRef} requestCloseRef={requestCloseRef} keyRef={keyRef} />
    </ModalSurface>
  );
}

function Viewer({ items, index, onIndexChange, actions, onImageError, item, opened, titleId, stageRef, closeRef, requestCloseRef, keyRef }: MediaLightboxProps & {
  item: MediaLightboxItem;
  opened: string | null;
  titleId: string;
  stageRef: RefObject<HTMLDivElement | null>;
  closeRef: RefObject<HTMLButtonElement | null>;
  requestCloseRef: RefObject<(() => void) | null>;
  keyRef: RefObject<(event: KeyboardEvent) => void>;
}) {
  const count = items.length;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const { page, controllerRef, announcement } = useMediaLightboxPaging({ stageRef, trackRef, index, count, item, onIndexChange, requestCloseRef });
  const previous = items[(index - 1 + count) % count];
  const next = items[(index + 1) % count];
  // Both neighbours are one turn away.
  useEffect(() => {
    if (count < 2) return;
    for (const neighbour of [previous, next]) if (neighbour.kind !== 'video') preloadLightboxImage(neighbour.src, neighbour.srcSet, neighbour.sizes);
  }, [count, previous, next]);
  keyRef.current = event => handleKey(event, { count, page, controllerRef });

  return (
    <>
      <div className="media-lightbox__bar">
        <span className="media-lightbox__counter">{count > 1 ? `${index + 1} из ${count}` : ''}</span>
        <div className="media-lightbox__actions">
          {actions}
          <button ref={closeRef} type="button" className="media-lightbox__button" aria-label="Закрыть" data-modal-close=""><X size={22} aria-hidden="true" /></button>
        </div>
      </div>
      <div ref={stageRef} className="media-lightbox__stage">
        <div ref={trackRef} className="media-lightbox__track">
          {slidesAround(items, index).map(({ slot, item: entry, key }) => (
            <Slide key={key} slot={slot} item={entry} opened={opened} onError={onImageError} />
          ))}
        </div>
      </div>
      {count > 1 && (
        <>
          <button type="button" className="media-lightbox__button media-lightbox__nav media-lightbox__nav--prev" aria-label="Предыдущая картинка"
            onClick={() => page(-1)}><ChevronLeft size={24} aria-hidden="true" /></button>
          <button type="button" className="media-lightbox__button media-lightbox__nav media-lightbox__nav--next" aria-label="Следующая картинка"
            onClick={() => page(1)}><ChevronRight size={24} aria-hidden="true" /></button>
        </>
      )}
      <div className="media-lightbox__caption">
        <strong id={titleId}>{item.title || item.alt}</strong>
        {item.meta && <span>{item.meta}</span>}
        {item.description && <p>{item.description}</p>}
      </div>
      <p className="media-lightbox__live" role="status" aria-live="polite">{announcement}</p>
    </>
  );
}

/**
 * The slides around the picture on show, keyed by their item so that a
 * neighbour that becomes the picture on show keeps its element and its loaded
 * image. With two items the same one sits on both sides: the next slide keeps
 * the plain key.
 */
function slidesAround(items: readonly MediaLightboxItem[], index: number): { slot: Slot; item: MediaLightboxItem; key: string }[] {
  const count = items.length;
  const item = items[index];
  const slides: { slot: Slot; item: MediaLightboxItem; key: string }[] = [{ slot: 'current', item, key: item.id }];
  if (count < 2) return slides;
  const previous = items[(index - 1 + count) % count];
  const next = items[(index + 1) % count];
  slides.push({ slot: 'next', item: next, key: next.id });
  slides.unshift({ slot: 'prev', item: previous, key: previous.id === next.id ? `${previous.id}~prev` : previous.id });
  return slides;
}

function handleKey(event: KeyboardEvent, { count, page, controllerRef }: {
  count: number;
  page: (step: number, travelled?: number, instant?: boolean) => void;
  controllerRef: RefObject<MediaLightboxController | null>;
}) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    if (count < 2) return;
    event.preventDefault();
    page(event.key === 'ArrowLeft' ? -1 : 1, 0, true);
  } else if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    controllerRef.current?.zoomBy(KEY_ZOOM);
  } else if (event.key === '-' || event.key === '_') {
    event.preventDefault();
    controllerRef.current?.zoomBy(1 / KEY_ZOOM);
  } else if (event.key === '0') {
    event.preventDefault();
    controllerRef.current?.resetZoom();
  }
}

function Slide({ slot, item, opened, onError }: {
  slot: Slot;
  item: MediaLightboxItem;
  opened: string | null;
  onError?: MediaLightboxProps['onImageError'];
}) {
  const current = slot === 'current';
  // The picture that opened the lightbox starts from the thumbnail that was pressed; another one only from its own.
  const thumb = item.thumb ?? (item.id === opened ? undefined : '');
  return (
    <div className="media-lightbox__slide" data-slot={slot} data-item-id={item.id} aria-hidden={current ? undefined : true} inert={!current}>
      <div className="media-lightbox__pan">
        {item.kind === 'video'
          ? (current
            ? <video src={item.src} controls autoPlay playsInline />
            : item.thumb ? <img className="media-lightbox__image" src={item.thumb} alt="" /> : null)
          : (
            <LightboxImage
              className="media-lightbox__image"
              src={item.src}
              srcSet={item.srcSet}
              sizes={item.sizes}
              thumb={thumb}
              alt={current ? item.alt : ''}
              media={current}
              onError={onError ? event => onError(event, item) : undefined}
            />
          )}
      </div>
    </div>
  );
}
