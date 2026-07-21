import { useEffect, useId, useRef, useState } from 'react';
import ModalSurface from '../components/ModalSurface/ModalSurface';
import { fallbackCardRender } from './CardPreviewTooltip';
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
  const fallback = fallbackCardRender(card.id);
  const [source, setSource] = useState(card.imageUrl || fallback);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setSource(card.imageUrl || fallback);
    setImageFailed(false);
  }, [card.id, card.imageUrl, fallback]);

  return (
    <ModalSurface
      className="card-preview-sheet"
      panelClassName="card-preview-sheet__panel"
      backdropClassName="card-preview-sheet__backdrop"
      ariaLabelledBy={titleId}
      closeLabel="Закрыть полную карту"
      initialFocusRef={closeRef}
      onClose={onClose}
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
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <figure className="card-preview-sheet__media">
        {!imageFailed ? (
          <img
            src={source}
            alt={card.name}
            onError={() => {
              if (source !== fallback) setSource(fallback);
              else setImageFailed(true);
            }}
          />
        ) : (
          <figcaption role="alert" data-card-preview-image-state="error">
            <p>Изображение карты временно недоступно.</p>
            <button
              type="button"
              data-card-preview-image-retry=""
              onClick={() => {
                setSource(card.imageUrl || fallback);
                setImageFailed(false);
              }}
            >
              Повторить загрузку
            </button>
          </figcaption>
        )}
      </figure>
    </ModalSurface>
  );
}
