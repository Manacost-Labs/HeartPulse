import { useEffect, useId, useRef, useState } from 'react';
import ModalSurface from '../components/ModalSurface/ModalSurface';
import { cardPreviewSources } from './CardPreviewTooltip';
import './CardPreviewSheet.css';

export type CardPreviewSheetCard = {
  id: string;
  name: string;
  imageUrl?: string | null;
};

type CardPreviewSheetProps = {
  card: CardPreviewSheetCard;
  onClose: () => void;
};

export default function CardPreviewSheet({ card, onClose }: CardPreviewSheetProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const sources = cardPreviewSources(card.id, card.imageUrl);
  const sourcesKey = sources.join('|');
  const [sourceIndex, setSourceIndex] = useState(0);
  const imageFailed = sourceIndex >= sources.length;
  const source = sources[Math.min(sourceIndex, sources.length - 1)];

  useEffect(() => {
    setSourceIndex(0);
  }, [sourcesKey]);

  return (
    <ModalSurface
      className="card-preview-sheet"
      panelClassName="card-preview-sheet__panel"
      backdropClassName="card-preview-sheet__backdrop"
      ariaLabelledBy={titleId}
      closeLabel="Закрыть полную карту"
      initialFocusRef={closeRef}
      onClose={onClose}
      zoom
    >
      <header className="card-preview-sheet__header">
        <div>
          <p className="card-preview-sheet__eyebrow">Полная карта</p>
          <h2 id={titleId}>{card.name}</h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="card-preview-sheet__close"
          aria-label="Закрыть полную карту"
          data-modal-close=""
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <figure className="card-preview-sheet__media">
        {!imageFailed ? (
          // The sheet keeps one picture and its own error path (fallback render,
          // then a retry): it zooms once the picture was preloaded, else fades.
          <img
            data-lightbox-media=""
            src={source}
            alt={card.name}
            onError={() => setSourceIndex(index => index + 1)}
          />
        ) : (
          <figcaption role="alert" data-card-preview-image-state="error">
            <p>Изображение карты временно недоступно.</p>
            <button
              type="button"
              data-card-preview-image-retry=""
              onClick={() => setSourceIndex(0)}
            >
              Повторить загрузку
            </button>
          </figcaption>
        )}
      </figure>
    </ModalSurface>
  );
}
