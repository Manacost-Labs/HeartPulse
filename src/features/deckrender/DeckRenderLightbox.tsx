import React, { useRef } from 'react';
import { X } from 'lucide-react';
import ModalSurface from '../../components/ModalSurface/ModalSurface';
import { LightboxImage } from '../../components/ModalSurface/LightboxImage';

/** The full-size deck image, opened from a parchment preview. */
export function DeckRenderLightbox({ deckName, imageUrl, onClose }: {
  deckName: string;
  imageUrl: string;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  return (
    <ModalSurface
      className="deck-render-lightbox"
      panelClassName="deck-render-lightbox__panel"
      backdropClassName="deck-render-lightbox__backdrop"
      ariaLabel={`Колода «${deckName}» в полном размере`}
      closeLabel="Закрыть просмотр колоды"
      initialFocusRef={closeButtonRef}
      onClose={onClose}
      zoom
    >
      <button
        ref={closeButtonRef}
        type="button"
        className="deck-render-lightbox__close"
        aria-label="Закрыть"
        data-modal-close=""
      >
        <X aria-hidden="true" />
      </button>
      <LightboxImage
        className="deck-render-lightbox__image"
        src={imageUrl}
        alt={`Колода «${deckName}» в стиле «Пергамент»`}
      />
    </ModalSurface>
  );
}
