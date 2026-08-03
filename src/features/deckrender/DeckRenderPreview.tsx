import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2, X } from 'lucide-react';
import ModalSurface from '../../components/ModalSurface/ModalSurface';
import {
  cachedDeckRender,
  invalidateDeckRender,
  requestDeckRender,
} from './deckRenderClient';
import './DeckRenderPreview.css';

type DeckRenderPreviewProps = {
  deckCode: string;
  deckName: string;
  children: ReactNode;
  className?: string;
  eager?: boolean;
};


export default function DeckRenderPreview({
  deckCode,
  deckName,
  ...props
}: DeckRenderPreviewProps) {
  const instanceKey = `${deckCode}\u0000${deckName}`;
  return (
    <DeckRenderPreviewInstance
      key={instanceKey}
      {...props}
      deckCode={deckCode}
      deckName={deckName}
    />
  );
}

type PreviewState = {
  error: string;
  imageReady: boolean;
  imageUrl: string;
  requestVersion: number;
};

function DeckRenderPreviewInstance({
  deckCode,
  deckName,
  children,
  className = '',
  eager = false,
}: DeckRenderPreviewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(eager);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [state, setState] = useState<PreviewState>(() => ({
    error: '',
    imageReady: false,
    imageUrl: cachedDeckRender(deckCode, deckName),
    requestVersion: 0,
  }));

  useEffect(() => {
    if (visible) return;
    const target = rootRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: '500px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !deckCode.trim()) return;
    let active = true;
    void requestDeckRender(deckCode, deckName)
      .then(url => {
        if (active) setState(current => ({ ...current, error: '', imageReady: false, imageUrl: url }));
      })
      .catch(cause => {
        if (active) {
          const message = cause instanceof Error ? cause.message : 'Не удалось собрать изображение колоды';
          setState(current => ({ ...current, error: message, imageReady: false }));
        }
      });
    return () => { active = false; };
  }, [deckCode, deckName, state.requestVersion, visible]);

  const retry = useCallback(() => {
    invalidateDeckRender(deckCode, deckName);
    setState(current => ({
      ...current,
      error: '',
      imageReady: false,
      imageUrl: '',
      requestVersion: current.requestVersion + 1,
    }));
  }, [deckCode, deckName]);

  const showImage = state.imageReady;
  return (
    <div ref={rootRef} className={`deck-render-preview ${className}`.trim()} data-render-state={state.error ? 'error' : state.imageReady ? 'ready' : visible ? 'loading' : 'idle'}>
      <div className="deck-render-preview__image" hidden={!showImage}>
        {state.imageUrl ? (
          <button
            type="button"
            className="deck-render-preview__open"
            aria-label={`Открыть колоду «${deckName}» в полном размере`}
            onClick={() => setLightboxOpen(true)}
          >
            <img
              src={state.imageUrl}
              alt={`Колода «${deckName}» в стиле «Пергамент»`}
              width="2048"
              height="2048"
              // The request itself is already deferred by IntersectionObserver.
              // Once its URL is ready the image must load eagerly: lazy images in
              // a hidden staging container are not fetched by Chromium, so their
              // onLoad event can never reveal the parchment preview.
              loading="eager"
              decoding="async"
              onLoad={() => setState(current => ({ ...current, error: '', imageReady: true }))}
              onError={() => setState(current => ({ ...current, error: 'Не удалось загрузить готовое изображение колоды', imageReady: false }))}
            />
            <span className="deck-render-preview__open-icon" aria-hidden="true">
              <Maximize2 />
            </span>
          </button>
        ) : null}
      </div>
      <div className="deck-render-preview__list" hidden={showImage}>
        {children}
      </div>

      {state.error ? (
        <button type="button" className="deck-render-preview__retry" onClick={retry}>Повторить загрузку изображения</button>
      ) : null}

      {lightboxOpen && state.imageUrl ? (
        <ModalSurface
          className="deck-render-lightbox"
          panelClassName="deck-render-lightbox__panel"
          backdropClassName="deck-render-lightbox__backdrop"
          ariaLabel={`Колода «${deckName}» в полном размере`}
          closeLabel="Закрыть просмотр колоды"
          initialFocusRef={closeButtonRef}
          onClose={() => setLightboxOpen(false)}
        >
          <button
            ref={closeButtonRef}
            type="button"
            className="deck-render-lightbox__close"
            aria-label="Закрыть"
            onClick={() => setLightboxOpen(false)}
          >
            <X aria-hidden="true" />
          </button>
          <img
            className="deck-render-lightbox__image"
            src={state.imageUrl}
            alt={`Колода «${deckName}» в стиле «Пергамент»`}
            decoding="async"
          />
        </ModalSurface>
      ) : null}
    </div>
  );
}
