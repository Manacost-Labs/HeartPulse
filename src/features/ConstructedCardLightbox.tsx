import React, { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import ModalSurface from '../components/ModalSurface/ModalSurface';
import { LightboxImage } from '../components/ModalSurface/LightboxImage';
import { preloadLightboxImage } from '../shared/ui/lightboxIntent';
import { fallbackCardImageElementToOrigin } from '../config/publicAssetDelivery';
import type { ConstructedCardMediaItem } from './constructedCardMedia';

type ConstructedCardLightboxProps = {
  items: ConstructedCardMediaItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
};

export default function ConstructedCardLightbox({ items, index, onClose, onIndexChange }: ConstructedCardLightboxProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const item = items[index] ?? null;
  const next = items[(index + 1) % items.length] ?? null;
  const nextImage = next?.kind === 'image' ? next.url : null;
  // The next picture is one arrow press away.
  useEffect(() => { if (nextImage) preloadLightboxImage(nextImage); }, [nextImage]);

  if (!item) return null;

  return (
    <ModalSurface
      className="constructed-card-lightbox"
      panelClassName="constructed-card-lightbox__panel"
      backdropClassName="constructed-card-lightbox__backdrop"
      ariaLabelledBy="constructed-card-lightbox-title"
      closeLabel="Закрыть просмотр"
      initialFocusRef={closeButtonRef}
      onClose={onClose}
      zoom
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
      <button ref={closeButtonRef} type="button" className="constructed-card-lightbox__close" aria-label="Закрыть" data-modal-close=""><X size={22} /></button>
      <div className="constructed-card-lightbox__media">
        {item.kind === 'video'
          ? <video src={item.url} controls autoPlay playsInline />
          : (
            <LightboxImage
              key={`${item.id}:${item.url}`}
              src={item.url}
              thumb={item.thumbnailUrl}
              alt={item.label}
              onError={event => { fallbackCardImageElementToOrigin(event.currentTarget); }}
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
