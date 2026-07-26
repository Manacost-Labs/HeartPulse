import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import ModalSurface from '../components/ModalSurface/ModalSurface';
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
          : <img src={item.url} alt={item.label} />}
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
