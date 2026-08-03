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
  children,
  className = '',
  defaultView = 'image',
  eager = false,
}: DeckRenderPreviewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(eager);
  const [imageUrl, setImageUrl] = useState(() => cachedDeckRender(deckCode, deckName));
  const [imageReady, setImageReady] = useState(false);
  const [error, setError] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const [view, setView] = useState<'image' | 'list'>(defaultView);

  useEffect(() => {
    setView(defaultView);
    setImageUrl(cachedDeckRender(deckCode, deckName));
    setImageReady(false);
    setError('');
  }, [deckCode, deckName, defaultView]);

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
    setError('');
    void requestDeckRender(deckCode, deckName)
      .then(url => {
        if (active) setImageUrl(url);
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : 'Не удалось собрать изображение колоды');
      });
    return () => { active = false; };
  }, [deckCode, deckName, retryToken, visible]);

  const retry = useCallback(() => {
    invalidateDeckRender(deckCode, deckName);
    setImageUrl('');
    setImageReady(false);
    setError('');
    setRetryToken(value => value + 1);
  }, [deckCode, deckName]);

  const showImage = view === 'image' && imageReady;
  return (
    <div ref={rootRef} className={`deck-render-preview ${className}`.trim()} data-render-state={error ? 'error' : imageReady ? 'ready' : visible ? 'loading' : 'idle'}>
      <div className="deck-render-preview__image" hidden={!showImage}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`Колода «${deckName}» в стиле «Пергамент»`}
            width="2048"
            height="2048"
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            onLoad={() => setImageReady(true)}
            onError={() => setError('Не удалось загрузить готовое изображение колоды')}
          />
        ) : null}
      </div>
      <div className="deck-render-preview__list" hidden={showImage}>
        {children}
      </div>

      {imageUrl && imageReady ? (
        <div className="deck-render-preview__switch" role="group" aria-label="Вид колоды">
          <button type="button" aria-pressed={view === 'image'} onClick={() => setView('image')}>Пергамент</button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>Список карт</button>
        </div>
      ) : error ? (
        <button type="button" className="deck-render-preview__retry" onClick={retry}>Повторить загрузку изображения</button>
      ) : null}
    </div>
  );
}
