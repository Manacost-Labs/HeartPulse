import React, { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
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

type PreviewAction =
  | { type: 'image-loaded' }
  | { type: 'image-failed'; message: string }
  | { type: 'render-ready'; url: string }
  | { type: 'retry' }
  | { type: 'switch-view'; view: 'image' | 'list' };

function previewReducer(state: PreviewState, action: PreviewAction): PreviewState {
  switch (action.type) {
    case 'image-loaded':
      return { ...state, error: '', imageReady: true };
    case 'image-failed':
      return { ...state, error: action.message, imageReady: false };
    case 'render-ready':
      return { ...state, error: '', imageReady: false, imageUrl: action.url };
    case 'retry':
      return {
        ...state,
        error: '',
        imageReady: false,
        imageUrl: '',
        requestVersion: state.requestVersion + 1,
      };
    case 'switch-view':
      return { ...state, view: action.view };
  }
}

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
  const [state, dispatch] = useReducer(previewReducer, undefined, (): PreviewState => ({
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
        if (active) dispatch({ type: 'render-ready', url });
      })
      .catch(cause => {
        if (active) {
          dispatch({
            type: 'image-failed',
            message: cause instanceof Error ? cause.message : 'Не удалось собрать изображение колоды',
          });
        }
      });
    return () => { active = false; };
  }, [deckCode, deckName, state.requestVersion, visible]);

  const retry = useCallback(() => {
    invalidateDeckRender(deckCode, deckName);
    dispatch({ type: 'retry' });
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
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            onLoad={() => dispatch({ type: 'image-loaded' })}
            onError={() => dispatch({ type: 'image-failed', message: 'Не удалось загрузить готовое изображение колоды' })}
          />
        ) : null}
      </div>
      <div className="deck-render-preview__list" hidden={showImage}>
        {children}
      </div>

      {state.imageUrl && state.imageReady ? (
        <div className="deck-render-preview__switch">
          <button type="button" aria-pressed={state.view === 'image'} onClick={() => dispatch({ type: 'switch-view', view: 'image' })}>Пергамент</button>
          <button type="button" aria-pressed={state.view === 'list'} onClick={() => dispatch({ type: 'switch-view', view: 'list' })}>Список карт</button>
        </div>
      ) : state.error ? (
        <button type="button" className="deck-render-preview__retry" onClick={retry}>Повторить загрузку изображения</button>
      ) : null}
    </div>
  );
}
