import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import ModalSurface from '../components/ModalSurface/ModalSurface';
import { fallbackCardImageElementToOrigin } from '../config/publicAssetDelivery';
import type { ConstructedCardMediaItem } from './constructedCardMedia';

type ConstructedCardLightboxProps = {
  items: ConstructedCardMediaItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
};

const warmedLightboxImages = new Set<string>();
function preloadImage(url: string | null | undefined): void {
  const source = String(url ?? '').trim();
  if (!source || typeof Image === 'undefined' || warmedLightboxImages.has(source)) return;
  warmedLightboxImages.add(source);
  const image = new Image();
  image.decoding = 'async';
  image.onerror = () => warmedLightboxImages.delete(source);
  image.src = source;
}

function ConstructedLightboxImage({
  item,
  next,
}: {
  item: ConstructedCardMediaItem;
  next: ConstructedCardMediaItem | null;
}) {
  const [fullImageReady, setFullImageReady] = useState(false);
  const hasPreview = item.thumbnailUrl !== item.url;
  const warmNext = () => {
    if (next?.kind === 'image') preloadImage(next.url);
  };
  return (
    <>
      <img
        src={fullImageReady || !hasPreview ? item.url : item.thumbnailUrl}
        alt={item.label}
        decoding="async"
        onError={event => {
          if (fallbackCardImageElementToOrigin(event.currentTarget)) return;
          if (hasPreview && !fullImageReady) setFullImageReady(true);
        }}
        onLoad={!hasPreview ? warmNext : undefined}
      />
      {hasPreview && !fullImageReady && (
        <img
          src={item.url}
          alt=""
          aria-hidden="true"
          hidden
          onLoad={() => {
            setFullImageReady(true);
            warmNext();
          }}
          onError={event => {
            if (!fallbackCardImageElementToOrigin(event.currentTarget)) setFullImageReady(true);
          }}
        />
      )}
    </>
  );
}

export default function ConstructedCardLightbox({ items, index, onClose, onIndexChange }: ConstructedCardLightboxProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const item = items[index] ?? null;

  if (!item) return null;
  const next = items[(index + 1) % items.length] ?? null;

  return (
    <ModalSurface
      className="constructed-card-lightbox"
      panelClassName="constructed-card-lightbox__panel"
      backdropClassName="constructed-card-lightbox__backdrop"
      ariaLabelledBy="constructed-card-lightbox-title"
      closeLabel="Закрыть просмотр"
      initialFocusRef={closeButtonRef}
      onClose={onClose}
      onKeyDown={event => {
        if (event.defaultPrevented || items.length <= 1) return;
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onIndexChange((index - 1 + items.length) % items.length);
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          onIndexChange((index + 1) % items.length);
        }
      }}
    >
      <button ref={closeButtonRef} type="button" className="constructed-card-lightbox__close" aria-label="Закрыть" onClick={onClose}><X size={22} /></button>
      <div className="constructed-card-lightbox__media">
        {item.kind === 'video'
          ? <video src={item.url} controls autoPlay playsInline />
          : (
            <ConstructedLightboxImage
              key={`${item.id}:${item.url}`}
              item={item}
              next={next}
            />
          )}
      </div>
      <footer className="constructed-card-lightbox__footer">
        <div>
          <strong id="constructed-card-lightbox-title">{item.label}</strong>
          {item.description && <p>{item.description}</p>}
          <span>{index + 1} из {items.length}</span>
        </div>
        <div className="constructed-card-lightbox__actions">
          {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Источник <ExternalLink size={15} /></a>}
          {items.length > 1 && <>
            <button type="button" aria-label="Предыдущее изображение" onClick={() => onIndexChange((index - 1 + items.length) % items.length)}><ChevronLeft size={20} /></button>
            <button type="button" aria-label="Следующее изображение" onClick={() => onIndexChange((index + 1) % items.length)}><ChevronRight size={20} /></button>
          </>}
        </div>
      </footer>
    </ModalSurface>
  );
}
