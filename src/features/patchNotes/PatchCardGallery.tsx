import { lazy, Suspense, useMemo, useState } from 'react';
import type { PatchNotesPoolItem, PatchNotesSectionImage } from '../../modules/patchNotes/public';
import type { MediaLightboxItem } from '../../components/ModalSurface/MediaLightbox';
import { publicResourceImageUrl, publicResourceUrl } from '../../publicResourceUrl';

const MediaLightbox = lazy(() => import('../../components/ModalSurface/MediaLightbox'));

export type CardGalleryHandlers = {
  onHover: (item: PatchNotesPoolItem, element: HTMLElement) => void;
  onLeave: () => void;
  onOpenSheet: (item: PatchNotesPoolItem) => void;
};

type Picture = { src: string; shape: 'card' | 'portrait' };

const HSJSON = '/api/public-resource/hsjson/v1';
const isLocalAsset = (value: string) => value.startsWith('/assets/');
const isProxied = (value: string) => publicResourceUrl(value).startsWith('/api/public-resource/');

/**
 * The picture of a pool or section card: a stored illustration, the library render (through the image
 * proxy), a Battlegrounds hero portrait, or the game render of a card known only by its id.
 */
export function cardGalleryPicture(item: PatchNotesPoolItem): Picture | null {
  const raw = item.renderUrl?.trim() ?? '';
  if (isLocalAsset(raw)) return { src: raw, shape: 'card' };
  if (raw && isProxied(raw)) return { src: publicResourceImageUrl(raw, { width: 256 }), shape: 'card' };
  if (!item.cardId) return null;
  const id = encodeURIComponent(item.cardId);
  if (item.cardType === 'hero') return { src: publicResourceImageUrl(`${HSJSON}/256x/${id}.jpg`, { width: 192 }), shape: 'portrait' };
  return { src: publicResourceImageUrl(`${HSJSON}/render/latest/ruRU/256x/${id}.png`, { width: 256 }), shape: 'card' };
}

/** The larger picture a hover preview or the preview sheet shows; `null` lets it fall back to the game render. */
export function cardGalleryPreview(item: PatchNotesPoolItem): string | null {
  const raw = item.renderUrl?.trim() ?? '';
  if (isLocalAsset(raw)) return raw;
  if (raw && isProxied(raw)) return publicResourceUrl(raw);
  if (item.cardId && item.cardType === 'hero') return `${HSJSON}/256x/${encodeURIComponent(item.cardId)}.jpg`;
  return null;
}

function statsOf(stats: string | null | undefined): { attack: string; health: string } | null {
  const match = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(stats ?? '');
  return match ? { attack: match[1], health: match[2] } : null;
}

/** A drawn card for a card no library pictures yet: tier, cost, name, rule text, attack and health. */
function BlankCard({ item, mark, costUnit }: { item: PatchNotesPoolItem; mark?: string; costUnit: string }) {
  const stats = statsOf(item.stats);
  const tier = typeof item.tier === 'number' && item.tier > 0 ? Math.min(item.tier, 7) : null;
  return (
    <span className="hp-gal__blank">
      <span className="hp-gal__blank-top">
        {tier && <span className="hp-gal__tier" aria-label={`Уровень таверны ${tier}`}>{'★'.repeat(tier)}</span>}
        {typeof item.cost === 'number' && <span className="hp-gal__cost" aria-label={`Стоимость: ${item.cost} ${costUnit}`}>{item.cost}</span>}
      </span>
      <span className="hp-gal__blank-name">
        {mark && <span className="hp-gal__mark" aria-hidden="true">{mark}</span>}
        {item.name}
      </span>
      {item.text && <span className="hp-gal__blank-text">{item.text}</span>}
      {(stats || item.tribe) && (
        <span className="hp-gal__blank-foot">
          {stats && <span className="hp-gal__gem hp-gal__gem--attack" aria-label={`Атака ${stats.attack}`}>{stats.attack}</span>}
          {item.tribe && <span className="hp-gal__tribe">{item.tribe}</span>}
          {stats && <span className="hp-gal__gem hp-gal__gem--health" aria-label={`Здоровье ${stats.health}`}>{stats.health}</span>}
        </span>
      )}
    </span>
  );
}

function GalleryTile({ item, mark, costUnit, showText, handlers }: {
  item: PatchNotesPoolItem; mark?: string; costUnit: string; showText: boolean; handlers: CardGalleryHandlers;
}) {
  const picture = cardGalleryPicture(item);
  const [failed, setFailed] = useState(false);
  const shown = picture && !failed ? picture : null;
  if (!picture) {
    return <div className="hp-gal__card hp-gal__card--blank"><BlankCard item={item} mark={mark} costUnit={costUnit} /></div>;
  }
  if (!shown) {
    // A picture that fails keeps its box: the drawn card takes the same frame, so nothing below moves.
    return (
      <div className="hp-gal__card hp-gal__card--blank">
        <span className="hp-gal__frame" data-shape={picture.shape} data-missing="true">
          {picture.shape === 'card' && <BlankCard item={item} costUnit={costUnit} />}
        </span>
        <span className="hp-gal__caption">
          <span className="hp-gal__name">
            {mark && <span className="hp-gal__mark" aria-hidden="true">{mark}</span>}
            {item.name}
          </span>
          {showText && item.text && <span className="hp-gal__text">{item.text}</span>}
        </span>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="hp-gal__card"
      data-lightbox-module="card-preview"
      aria-label={`${item.name}: показать карту`}
      onPointerEnter={event => { if (event.pointerType === 'mouse') handlers.onHover(item, event.currentTarget); }}
      onPointerLeave={handlers.onLeave}
      onBlur={handlers.onLeave}
      onClick={() => handlers.onOpenSheet(item)}
    >
      <span className="hp-gal__frame" data-shape={shown.shape}>
        <img
          className="hp-gal__img"
          src={shown.src}
          alt=""
          width={shown.shape === 'portrait' ? 192 : 256}
          height={shown.shape === 'portrait' ? 192 : 358}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </span>
      <span className="hp-gal__caption">
        <span className="hp-gal__name">
          {mark && <span className="hp-gal__mark" aria-hidden="true">{mark}</span>}
          {item.name}
        </span>
        {showText && item.text && <span className="hp-gal__text">{item.text}</span>}
      </span>
    </button>
  );
}

/** Pictures of the cards, heroes or skins a pool list or a section item names; a card without one is drawn. */
export function PatchCardGallery({ items, handlers, mark, status, costUnit = 'золота', showText = true, label }: {
  items: readonly PatchNotesPoolItem[];
  handlers: CardGalleryHandlers;
  mark?: string;
  /** Pool status (`removed`, `added`, `returning`) that colours the mark. */
  status?: string;
  costUnit?: string;
  /** The caption under a picture: off where the render already carries the rule text. */
  showText?: boolean;
  label?: string;
}) {
  return (
    <ul className="hp-gal" data-status={status} aria-label={label}>
      {items.map((item, index) => (
        <li key={`${item.cardId ?? item.name}-${index}`} className="hp-gal__item">
          <GalleryTile item={item} mark={mark} costUnit={costUnit} showText={showText} handlers={handlers} />
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
