import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
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

  useEffect(() => {
    if (!item) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && items.length > 1) onIndexChange((index - 1 + items.length) % items.length);
      if (event.key === 'ArrowRight' && items.length > 1) onIndexChange((index + 1) % items.length);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [index, item, items.length, onClose, onIndexChange]);

  if (!item) return null;

  return createPortal(
    <div className="constructed-card-lightbox" role="dialog" aria-modal="true" aria-labelledby="constructed-card-lightbox-title">
      <button type="button" className="constructed-card-lightbox__backdrop" aria-label="Закрыть просмотр" onClick={onClose} />
      <div className="constructed-card-lightbox__panel">
        <button ref={closeButtonRef} type="button" className="constructed-card-lightbox__close" aria-label="Закрыть" onClick={onClose}><X size={22} /></button>
        <div className="constructed-card-lightbox__media">
          {item.kind === 'video'
            ? <video src={item.url} controls autoPlay playsInline />
            : <img src={item.url} alt={item.label} />}
        </div>
        <footer className="constructed-card-lightbox__footer">
          <div><strong id="constructed-card-lightbox-title">{item.label}</strong><span>{index + 1} из {items.length}</span></div>
          <div className="constructed-card-lightbox__actions">
            {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Источник <ExternalLink size={15} /></a>}
            {items.length > 1 && <>
              <button type="button" aria-label="Предыдущее изображение" onClick={() => onIndexChange((index - 1 + items.length) % items.length)}><ChevronLeft size={20} /></button>
              <button type="button" aria-label="Следующее изображение" onClick={() => onIndexChange((index + 1) % items.length)}><ChevronRight size={20} /></button>
            </>}
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
