import React, { useEffect, useRef, useState } from 'react';
import type { AppErrorKind } from '../components/appErrorRecovery';
import { classifyAppError } from '../components/appErrorRecovery';
import '../vendor/hsreplay-deck-view/hsreplay-deck-view.css';
import CardPreviewTooltip, { type CardPreviewTarget } from './CardPreviewTooltip';
import HsReplayDeckFallback from './HsReplayDeckFallback';
import { AsyncSurfaceState } from './recovery/RecoverableSurface';
import './recovery/RecoverableSurface.css';
import './HsReplayDeckList.css';

export type HsReplayDeckCard = {
  id: string;
  dbfId: number;
  name: string;
  cost: number;
  rarity: string;
  elite: boolean;
  count: number;
  image: string;
  cardImage?: string;
};

type HsReplayDeckListProps = {
  cards: HsReplayDeckCard[];
  className?: string;
  label?: string;
};

type DeckViewApi = NonNullable<typeof window.HSReplayDeckView>;
type DeckRenderState = 'loading' | 'ready' | 'error';

let deckViewLoader: Promise<DeckViewApi> | null = null;

function loadedDeckView(): DeckViewApi | null {
  if (typeof window === 'undefined') return null;
  return window.HSReplayDeckView?.renderDeck ? window.HSReplayDeckView : null;
}

function loadDeckView(): Promise<DeckViewApi> {
  const loaded = loadedDeckView();
  if (loaded) return Promise.resolve(loaded);
  if (!deckViewLoader) {
    deckViewLoader = import('../vendor/hsreplay-deck-view/hsreplay-deck-view.js')
      .then(() => {
        const api = loadedDeckView();
        if (!api) throw new Error('HSReplay DeckView API is unavailable');
        return api;
      })
      .catch(cause => {
        deckViewLoader = null;
        throw cause;
      });
  }
  return deckViewLoader;
}

export default function HsReplayDeckList({ cards, className = '', label = 'Состав колоды' }: HsReplayDeckListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState<AppErrorKind>('render');
  const [renderState, setRenderState] = useState<DeckRenderState>('loading');
  const [renderRevision, setRenderRevision] = useState(0);
  const [preview, setPreview] = useState<CardPreviewTarget | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !cards.length) return undefined;
    let active = true;
    let cleanups: Array<() => void> = [];
    container.replaceChildren();
    setPreview(null);
    setError('');
    setRenderState('loading');
    void loadDeckView()
      .then(api => {
        if (!active) return;
        api.renderDeck(container, cards, {
          className: 'traditional-deck-list__render',
          group: true,
          sort: true,
          clear: true,
          showSingleCountBox: false,
        });
        if (!container.querySelector('.hsrdv-card-tile')) {
          throw new Error('HSReplay DeckView returned an empty composition');
        }
        const cardsById = new Map(cards.map(card => [card.id, card]));
        cleanups = [...container.querySelectorAll<HTMLElement>('.hsrdv-card-tile')].map(tile => {
          const card = cardsById.get(tile.dataset.cardId || '');
          if (!card) return () => undefined;
          tile.tabIndex = 0;
          const showPreview = () => setPreview({ id: card.id, name: card.name, imageUrl: card.cardImage, rect: tile.getBoundingClientRect() });
          const hidePreview = () => setPreview(current => current?.id === card.id ? null : current);
          tile.addEventListener('mouseenter', showPreview);
          tile.addEventListener('mouseleave', hidePreview);
          tile.addEventListener('focus', showPreview);
          tile.addEventListener('blur', hidePreview);
          return () => {
            tile.removeEventListener('mouseenter', showPreview);
            tile.removeEventListener('mouseleave', hidePreview);
            tile.removeEventListener('focus', showPreview);
            tile.removeEventListener('blur', hidePreview);
          };
        });
        setRenderState('ready');
      })
      .catch(cause => {
        if (!active) return;
        container.replaceChildren();
        const kind = classifyAppError(cause);
        setErrorKind(kind);
        setError(kind === 'chunk'
          ? 'Файл интерактивного вида не загрузился. Текстовый состав доступен ниже.'
          : 'Интерактивный вид не загрузился. Текстовый состав доступен ниже.');
        setRenderState('error');
      });
    return () => {
      active = false;
      cleanups.forEach(cleanup => cleanup());
      container.replaceChildren();
    };
  }, [cards, renderRevision]);

  if (!cards.length) {
    return (
      <div className={`traditional-deck-list traditional-deck-list--empty ${className}`}>
        <AsyncSurfaceState
          variant="empty"
          title="Состав колоды обновляется"
          message="Карты появятся после следующего обновления источника."
          compact
        />
      </div>
    );
  }
  return (
    <div className={`traditional-deck-list ${className}`} aria-label={label} data-deck-render-state={renderState}>
      {renderState === 'loading' && (
        <AsyncSurfaceState variant="loading" title="Рисуем состав колоды" compact />
      )}
      {renderState === 'error' && (
        <>
          <AsyncSurfaceState
            variant="error"
            title="Состав доступен в текстовом виде"
            message={error}
            actionLabel={errorKind === 'chunk' ? 'Обновить страницу' : 'Повторить'}
            onAction={() => {
              if (errorKind === 'chunk') window.location.reload();
              else setRenderRevision(revision => revision + 1);
            }}
            compact
          />
          <HsReplayDeckFallback cards={cards} />
        </>
      )}
      <div
        ref={containerRef}
        className="traditional-deck-list__host"
        data-ready={renderState === 'ready' ? 'true' : 'false'}
        data-deck-cards={cards.flatMap(card => Array.from({ length: card.count }, () => card.dbfId)).join(',')}
      />
      {preview && <CardPreviewTooltip preview={preview} />}
    </div>
  );
}
