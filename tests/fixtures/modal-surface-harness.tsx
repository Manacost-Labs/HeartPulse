import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ModalSurface from '../../src/components/ModalSurface/ModalSurface';
import ConstructedCardLightbox from '../../src/features/ConstructedCardLightbox';

const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const media = [
  { id: 'one', label: 'Первая карта', url: pixel, thumbnailUrl: pixel, sourceUrl: null, kind: 'image' as const },
  { id: 'two', label: 'Вторая карта', url: pixel, thumbnailUrl: pixel, sourceUrl: null, kind: 'image' as const },
];

function Harness() {
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [firstOpen, setFirstOpen] = useState(false);
  const [secondOpen, setSecondOpen] = useState(false);
  const firstCloseRef = useRef<HTMLButtonElement | null>(null);
  const secondCloseRef = useRef<HTMLButtonElement | null>(null);

  return (
    <main>
      <button id="lightbox-trigger" type="button" onClick={() => setLightboxIndex(0)}>Открыть карты</button>
      <button id="first-trigger" type="button" onClick={() => setFirstOpen(true)}>Открыть первое окно</button>

      {lightboxIndex >= 0 && (
        <ConstructedCardLightbox
          items={media}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(-1)}
          onIndexChange={setLightboxIndex}
        />
      )}

      {firstOpen && (
        <ModalSurface
          className="harness-modal harness-modal--first"
          panelClassName="harness-panel"
          backdropClassName="harness-backdrop"
          ariaLabel="Первое окно"
          initialFocusRef={firstCloseRef}
          onClose={() => setFirstOpen(false)}
        >
          <button ref={firstCloseRef} id="first-close" type="button" onClick={() => setFirstOpen(false)}>Закрыть первое</button>
          <button id="nested-trigger" type="button" onClick={() => setSecondOpen(true)}>Открыть второе</button>
        </ModalSurface>
      )}

      {secondOpen && (
        <ModalSurface
          className="harness-modal harness-modal--second"
          panelClassName="harness-panel"
          backdropClassName="harness-backdrop"
          ariaLabel="Второе окно"
          initialFocusRef={secondCloseRef}
          onClose={() => setSecondOpen(false)}
        >
          <button ref={secondCloseRef} id="second-close" type="button" onClick={() => setSecondOpen(false)}>Закрыть второе</button>
        </ModalSurface>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>);
