import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2, X } from 'lucide-react';
import ModalSurface from '../../components/ModalSurface/ModalSurface';
import {
  cachedDeckRender,
  deckRenderImageRetryUrl,
  invalidateDeckRender,
  requestDeckRender,
  type DeckRenderAsset,
} from './deckRenderClient';
import {
  MAX_IMAGE_LOAD_RETRIES,
  settleExhaustedImageLoad,
  type DeckImageLoadState,
} from './deckImageLoadState';
import './DeckRenderPreview.css';

type DeckRenderPreviewProps = {
  deckCode: string;
  deckName: string;
  children: ReactNode;
  className?: string;
  eager?: boolean;
  initialAsset?: DeckRenderAsset | null;
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

type PreviewState = DeckImageLoadState & {
  requestVersion: number;
};

function DeckRenderPreviewInstance({
  deckCode,
  deckName,
  children,
  className = '',
  eager = false,
  initialAsset = null,
}: DeckRenderPreviewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const imageRetryTimerRef = useRef<number | null>(null);
  const [visible, setVisible] = useState(eager);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [state, setState] = useState<PreviewState>(() => {
    const cached = initialAsset || cachedDeckRender(deckCode, deckName);
    return {
      error: '',
      fullImageUrl: cached?.imageUrl || '',
      imageRetryAttempt: 0,
      imageReady: false,
      previewImageUrl: cached?.previewImageUrl || '',
      requestVersion: 0,
    };
  });

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
    if (!visible || !deckCode.trim() || (state.fullImageUrl && state.previewImageUrl)) return;
    let active = true;
    void requestDeckRender(deckCode, deckName)
      .then(asset => {
        if (active) setState(current => ({
          ...current,
          error: '',
          fullImageUrl: asset.imageUrl,
          imageReady: false,
          imageRetryAttempt: 0,
          previewImageUrl: asset.previewImageUrl,
        }));
      })
      .catch(cause => {
        if (active) {
          const message = cause instanceof Error ? cause.message : 'Не удалось собрать изображение колоды';
          setState(current => ({ ...current, error: message, imageReady: false }));
        }
      });
    return () => { active = false; };
  }, [deckCode, deckName, state.fullImageUrl, state.previewImageUrl, state.requestVersion, visible]);

  useEffect(() => () => {
    if (imageRetryTimerRef.current !== null) window.clearTimeout(imageRetryTimerRef.current);
  }, []);

  const retry = useCallback(() => {
    invalidateDeckRender(deckCode, deckName);
    setState(current => ({
      ...current,
      error: '',
      imageRetryAttempt: 0,
      imageReady: false,
      fullImageUrl: '',
      previewImageUrl: '',
      requestVersion: current.requestVersion + 1,
    }));
  }, [deckCode, deckName]);

  const retryImageLoad = useCallback(() => {
    if (state.error) return;
    if (imageRetryTimerRef.current !== null) window.clearTimeout(imageRetryTimerRef.current);
    if (state.imageRetryAttempt >= MAX_IMAGE_LOAD_RETRIES) {
      setState(current => settleExhaustedImageLoad(current));
      return;
    }
    const expectedImageUrl = state.previewImageUrl;
    const delayMs = 250 * (2 ** state.imageRetryAttempt);
    imageRetryTimerRef.current = window.setTimeout(() => {
      imageRetryTimerRef.current = null;
      setState(current => {
        if (!current.previewImageUrl || current.previewImageUrl !== expectedImageUrl || current.imageReady) return current;
        return {
          ...current,
          error: '',
          imageRetryAttempt: current.imageRetryAttempt + 1,
        };
      });
    }, delayMs);
  }, [state.error, state.imageRetryAttempt, state.previewImageUrl]);

  const showImage = state.imageReady;
  const showFallback = Boolean(state.error);
  const showLoading = !showImage && !showFallback;
  return (
    <div
      ref={rootRef}
      className={`deck-render-preview ${className}`.trim()}
      data-render-state={state.error ? 'error' : state.imageReady ? 'ready' : visible ? 'loading' : 'idle'}
      aria-busy={showLoading}
    >
      <div className="deck-render-preview__image" hidden={!showImage}>
        {state.previewImageUrl ? (
          <button
            type="button"
            className="deck-render-preview__open"
            aria-label={`Открыть колоду «${deckName}» в полном размере`}
            onClick={() => setLightboxOpen(true)}
          >
            <img
              src={deckRenderImageRetryUrl(state.previewImageUrl, state.imageRetryAttempt)}
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
              onError={retryImageLoad}
            />
            <span className="deck-render-preview__open-icon" aria-hidden="true">
              <Maximize2 />
            </span>
          </button>
        ) : null}
      </div>
      <div className="deck-render-preview__loading" hidden={!showLoading} aria-hidden="true">
        <span>Собираем изображение колоды…</span>
      </div>
      <div className="deck-render-preview__list" hidden={!showFallback}>
        {children}
      </div>

      {state.error ? (
        <button type="button" className="deck-render-preview__retry" onClick={retry}>Повторить загрузку изображения</button>
      ) : null}

      {lightboxOpen && state.fullImageUrl ? (
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
            src={state.fullImageUrl}
            alt={`Колода «${deckName}» в стиле «Пергамент»`}
            decoding="async"
          />
        </ModalSurface>
      ) : null}
    </div>
  );
}
