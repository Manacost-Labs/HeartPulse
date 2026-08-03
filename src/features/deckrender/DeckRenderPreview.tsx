import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
  defaultView?: 'image' | 'list';
  eager?: boolean;
};


export default function DeckRenderPreview({
  deckCode,
  deckName,
  defaultView = 'image',
  ...props
}: DeckRenderPreviewProps) {
  const instanceKey = `${deckCode}\u0000${deckName}\u0000${defaultView}`;
  return (
    <DeckRenderPreviewInstance
      key={instanceKey}
      {...props}
      deckCode={deckCode}
      deckName={deckName}
      defaultView={defaultView}
    />
  );
}

type PreviewState = {
  error: string;
  imageReady: boolean;
  imageUrl: string;
  requestVersion: number;
  view: 'image' | 'list';
};

function DeckRenderPreviewInstance({
  deckCode,
  deckName,
  children,
  className = '',
  defaultView = 'image',
  eager = false,
}: DeckRenderPreviewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(eager);
  const [state, setState] = useState<PreviewState>(() => ({
    error: '',
    imageReady: false,
    imageUrl: cachedDeckRender(deckCode, deckName),
    requestVersion: 0,
    view: defaultView,
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

  const showImage = state.view === 'image' && state.imageReady;
  return (
    <div ref={rootRef} className={`deck-render-preview ${className}`.trim()} data-render-state={state.error ? 'error' : state.imageReady ? 'ready' : visible ? 'loading' : 'idle'}>
      <div className="deck-render-preview__image" hidden={!showImage}>
        {state.imageUrl ? (
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
        ) : null}
      </div>
      <div className="deck-render-preview__list" hidden={showImage}>
        {children}
      </div>

      {state.imageUrl && state.imageReady ? (
        <div className="deck-render-preview__switch">
          <button type="button" aria-pressed={state.view === 'image'} onClick={() => setState(current => ({ ...current, view: 'image' }))}>Пергамент</button>
          <button type="button" aria-pressed={state.view === 'list'} onClick={() => setState(current => ({ ...current, view: 'list' }))}>Список карт</button>
        </div>
      ) : state.error ? (
        <button type="button" className="deck-render-preview__retry" onClick={retry}>Повторить загрузку изображения</button>
      ) : null}
    </div>
  );
}
