import React, { useCallback, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { Maximize2 } from 'lucide-react';
import { LoadingBlock } from '../../shared/ui/LoadingSurface';
import {
  cachedDeckRender,
  deckRenderImageRetryUrl,
  invalidateDeckRender,
  requestFreshDeckRender,
  requestDeckRender,
  sameOriginDeckRenderAsset,
  type DeckRenderAsset,
} from './deckRenderClient';
import {
  MAX_IMAGE_LOAD_RETRIES,
  recoverExhaustedImageLoad,
  type DeckImageLoadState,
} from './deckImageLoadState';
import '../../shared/ui/LoadingSurface.css';
import './DeckRenderPreview.css';
import { DeckRenderLightbox } from './DeckRenderLightbox';

export type DeckRenderState = 'idle' | 'loading' | 'ready' | 'error';

type DeckRenderPreviewProps = {
  deckCode: string;
  deckName: string;
  children: ReactNode;
  className?: string;
  eager?: boolean;
  initialAsset?: DeckRenderAsset | null;
  /**
   * Reports the preview's state. The square placeholder is a plain block and
   * announces nothing: the gallery or page that owns the previews keeps the
   * one loading status, and uses this to know when its previews are ready.
   */
  onRenderStateChange?: (state: DeckRenderState) => void;
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

// A render or a retry replaces the image rather than refreshing it in place,
// so the preview is never aria-busy (see LoadingSurface).
function useReportedRenderState(renderState: DeckRenderState, onChange?: (state: DeckRenderState) => void) {
  const report = useEffectEvent((next: DeckRenderState) => onChange?.(next));
  useEffect(() => { report(renderState); }, [renderState]);
}

type PreviewState = DeckImageLoadState & {
  renderRecoveryAttempt: number;
  requestVersion: number;
};

function DeckRenderPreviewInstance({
  deckCode,
  deckName,
  children,
  className = '',
  eager = false,
  initialAsset = null,
  onRenderStateChange,
}: DeckRenderPreviewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const imageRetryTimerRef = useRef<number | null>(null);
  const [visible, setVisible] = useState(eager);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [state, setState] = useState<PreviewState>(() => {
    const cached = initialAsset
      ? sameOriginDeckRenderAsset(initialAsset)
      : cachedDeckRender(deckCode, deckName);
    return {
      error: '',
      fullImageUrl: cached?.imageUrl || '',
      imageRetryAttempt: 0,
      imageReady: false,
      previewImageUrl: cached?.previewImageUrl || '',
      renderRecoveryAttempt: 0,
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
    const request = state.requestVersion > 0 ? requestFreshDeckRender : requestDeckRender;
    void request(deckCode, deckName)
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
      renderRecoveryAttempt: 0,
      requestVersion: current.requestVersion + 1,
    }));
  }, [deckCode, deckName]);

  const retryImageLoad = useCallback(() => {
    if (state.error) return;
    if (imageRetryTimerRef.current !== null) window.clearTimeout(imageRetryTimerRef.current);
    if (state.imageRetryAttempt >= MAX_IMAGE_LOAD_RETRIES) {
      const recoveringServerCache = state.fullImageUrl
        && state.previewImageUrl === state.fullImageUrl
        && state.renderRecoveryAttempt === 0;
      if (recoveringServerCache) invalidateDeckRender(deckCode, deckName);
      setState(current => recoverExhaustedImageLoad(current));
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
  }, [deckCode, deckName, state.error, state.fullImageUrl, state.imageRetryAttempt,
    state.previewImageUrl, state.renderRecoveryAttempt]);

  const showImage = state.imageReady;
  const showFallback = Boolean(state.error);
  const showLoading = !showImage && !showFallback;
  const renderState: DeckRenderState = state.error ? 'error' : state.imageReady ? 'ready' : visible ? 'loading' : 'idle';
  useReportedRenderState(renderState, onRenderStateChange);
  return (
    <div
      ref={rootRef}
      className={`deck-render-preview ${className}`.trim()}
      data-render-state={renderState}
    >
      <div className="deck-render-preview__image" hidden={!showImage}>
        {state.previewImageUrl ? (
          <button
            type="button"
            className="deck-render-preview__open"
            aria-label={`Открыть колоду «${deckName}» в полном размере`}
            data-lightbox-src={state.fullImageUrl || undefined}
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
      {showLoading ? <LoadingBlock className="deck-render-preview__loading" /> : null}
      <div className="deck-render-preview__list" hidden={!showFallback}>
        {children}
      </div>

      {state.error ? (
        <button type="button" className="deck-render-preview__retry" onClick={retry}>Повторить загрузку изображения</button>
      ) : null}

      {lightboxOpen && state.fullImageUrl ? (
        <DeckRenderLightbox deckName={deckName} imageUrl={state.fullImageUrl} onClose={() => setLightboxOpen(false)} />
      ) : null}
    </div>
  );
}
