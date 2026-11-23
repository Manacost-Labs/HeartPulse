import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { PatchNotesPoolItem, PatchNotesSectionImage } from '../../modules/patchNotes/public';
import type { MediaLightboxItem } from '../../components/ModalSurface/MediaLightbox';
import { publicResourceImageUrl, publicResourceUrl } from '../../publicResourceUrl';

const MediaLightbox = lazy(() => import('../../components/ModalSurface/MediaLightbox'));

export type CardGalleryHandlers = {
  onHover: (item: PatchNotesPoolItem, element: HTMLElement) => void;
  onLeave: () => void;
  onOpenSheet: (item: PatchNotesPoolItem) => void;
};

type Picture = { sources: string[]; shape: 'card' | 'hero' | 'portrait' };

const HSJSON = '/api/public-resource/hsjson/v1';
const isLocalAsset = (value: string) => value.startsWith('/assets/');
const isProxied = (value: string) => publicResourceUrl(value).startsWith('/api/public-resource/');

/**
 * The real pictures of a pool or section card, best first: a stored illustration or the library render
 * (through the image proxy), then the game's Russian renders of its id; a hero is its round portrait.
 * `null` only for a card known by neither a picture nor an id.
 */
export function cardGalleryPicture(item: PatchNotesPoolItem): Picture | null {
  const raw = item.renderUrl?.trim() ?? '';
  const own = isLocalAsset(raw) ? [raw] : raw && isProxied(raw) ? [publicResourceImageUrl(raw, { width: 256 })] : [];
  if (!item.cardId) return own.length ? { sources: own, shape: item.cardType === 'hero' ? 'hero' : 'card' } : null;
  const id = encodeURIComponent(item.cardId);
  // A hero is its original portrait when stored, else the round crop of its art.
  if (item.cardType === 'hero') return own.length ? { sources: own, shape: 'hero' } : { sources: [publicResourceImageUrl(`${HSJSON}/256x/${id}.jpg`, { width: 192 })], shape: 'portrait' };
  return {
    sources: [...new Set([
      ...own,
      publicResourceImageUrl(`${HSJSON}/bgs/latest/ruRU/512x/${id}.png`, { width: 256 }),
      publicResourceImageUrl(`${HSJSON}/render/latest/ruRU/256x/${id}.png`, { width: 256 }),
    ])],
    shape: 'card',
  };
}

/** The larger picture a hover preview or the preview sheet shows; `null` lets it fall back to the game render. */
export function cardGalleryPreview(item: PatchNotesPoolItem): string | null {
  const raw = item.renderUrl?.trim() ?? '';
  if (isLocalAsset(raw)) return raw;
  if (raw && isProxied(raw)) return publicResourceUrl(raw);
  if (item.cardId && item.cardType === 'hero') return `${HSJSON}/256x/${encodeURIComponent(item.cardId)}.jpg`;
  if (item.cardType === 'hero') return null;
  return null;
}

/** One retry of the same picture before the next source: a cold image proxy can fail a burst of first loads. */
const RETRY_DELAY_MS = 1200;

function GalleryTile({ item, mark, showName, showText, handlers }: {
  item: PatchNotesPoolItem; mark?: string; showName: boolean; showText: boolean; handlers: CardGalleryHandlers;
}) {
  const picture = cardGalleryPicture(item);
  const [attempt, setAttempt] = useState(0);
  const [retried, setRetried] = useState(false);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = window.setTimeout(() => { setWaiting(false); setRetried(true); }, RETRY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [waiting]);
  const onError = () => {
    if (!retried) { setWaiting(true); return; }
    setRetried(false);
    setAttempt(current => current + 1);
  };
  const src = picture?.sources[attempt] ?? null;
  const shape = picture?.shape ?? 'card';
  const caption = (showName || (showText && item.text)) ? (
    <span className="hp-gal__caption">
      {showName && (
        <span className="hp-gal__name">
          {mark && <span className="hp-gal__mark" aria-hidden="true">{mark}</span>}
          {item.name}
        </span>
      )}
      {showText && item.text && <span className="hp-gal__text">{item.text}</span>}
    </span>
  ) : null;
  if (!src) {
    // No picture could load: the tile keeps its box and its name, so nothing below moves; no card is drawn.
    return (
      <div className="hp-gal__card hp-gal__card--missing" title={item.name}>
        <span className="hp-gal__frame" data-shape={shape} data-missing="true">
          {!showName && <span className="hp-gal__missing-name">{item.name}</span>}
        </span>
        {caption}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="hp-gal__card"
      data-lightbox-module="card-preview"
      aria-label={`${item.name}: показать карту`}
      title={showName ? undefined : item.name}
      onPointerEnter={event => { if (event.pointerType === 'mouse') handlers.onHover(item, event.currentTarget); }}
      onPointerLeave={handlers.onLeave}
      onBlur={handlers.onLeave}
      onClick={() => handlers.onOpenSheet(item)}
    >
      <span className="hp-gal__frame" data-shape={shape}>
        {!waiting && (
          <img
            key={`${src}|${retried ? 1 : 0}`}
            className="hp-gal__img"
            src={src}
            alt=""
            width={shape === 'portrait' ? 192 : shape === 'hero' ? 300 : 256}
            height={shape === 'portrait' ? 192 : shape === 'hero' ? 312 : 358}
            loading="lazy"
            decoding="async"
            onError={onError}
          />
        )}
      </span>
      {caption}
    </button>
  );
}

/** Pictures of the cards, heroes or skins a pool list or a section item names. */
export function PatchCardGallery({ items, handlers, mark, status, showName = true, showText = true, label }: {
  items: readonly PatchNotesPoolItem[];
  handlers: CardGalleryHandlers;
  mark?: string;
  /** Pool status (`removed`, `added`, `returning`) that colours the mark. */
  status?: string;
  /** The name under a picture: off where the render already carries it (pool cards). */
  showName?: boolean;
  /** The caption under a picture: off where the render already carries the rule text. */
  showText?: boolean;
  label?: string;
}) {
  return (
    <ul className="hp-gal" data-status={status} data-compact={showName ? undefined : 'true'} aria-label={label}>
      {items.map((item, index) => (
        <li key={`${item.cardId ?? item.name}-${index}`} className="hp-gal__item">
          <GalleryTile item={item} mark={mark} showName={showName} showText={showText} handlers={handlers} />
        </li>
      ))}
    </ul>
  );
}

/** Tallest illustration on the page (28rem): a tall picture is narrowed so its box keeps its proportions. */
const FIGURE_MAX_HEIGHT = 448;
const figureMaxWidth = (image: PatchNotesSectionImage) => (image.width && image.height
  ? `${Math.min(image.width, Math.round(FIGURE_MAX_HEIGHT * image.width / image.height))}px` : undefined);

/** Wide illustrations (translated card overviews, event banners) of a section or an item; a press opens them full size. */
export function PatchFigures({ images }: { images: readonly PatchNotesSectionImage[] }) {
  const [open, setOpen] = useState(-1);
  const items = useMemo<MediaLightboxItem[]>(() => images.map(image => ({
    id: image.url, src: image.url, thumb: image.url, alt: image.alt, title: image.alt,
  })), [images]);
  if (!images.length) return null;
  return (
    <div className="hp-figs" data-count={images.length > 1 ? 'many' : 'one'}>
      {images.map((image, index) => (
        <figure key={image.url} className="hp-figs__item">
          <button
            type="button"
            className="hp-figs__open"
            style={{ maxWidth: figureMaxWidth(image) }}
            data-lightbox-src={image.url}
            data-lightbox-module="media-lightbox"
            aria-label={`Открыть в полном размере: ${image.alt}`}
            onClick={() => setOpen(index)}
          >
            <img
              className="hp-figs__img"
              src={image.url}
              alt={image.alt}
              width={image.width}
              height={image.height}
              loading="lazy"
              decoding="async"
            />
          </button>
        </figure>
      ))}
      {open >= 0 && (
        <Suspense fallback={null}>
          <MediaLightbox items={items} index={open} onClose={() => setOpen(-1)} onIndexChange={setOpen} />
        </Suspense>
      )}
    </div>
  );
}
