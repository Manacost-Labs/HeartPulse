import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { AppErrorKind } from '../components/appErrorRecovery';
import { classifyAppError } from '../components/appErrorRecovery';
import '../vendor/hsreplay-deck-view/hsreplay-deck-view.css';
import HsReplayDeckFallback from './HsReplayDeckFallback';
import type {
  CardPreviewModuleLoader,
} from './HsReplayDeckPreviewController';
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
  previewModuleLoader?: CardPreviewModuleLoader;
  previewControllerLoader?: DeckPreviewControllerLoader;
};

type DeckViewApi = NonNullable<typeof window.HSReplayDeckView>;
type DeckRenderState = 'loading' | 'ready' | 'error';
type DeckPreviewState = 'loading' | 'ready' | 'error';
type DeckPreviewControllerProps = {
  cards: HsReplayDeckCard[];
  container: HTMLElement;
  previewModuleLoader?: CardPreviewModuleLoader;
};
type DeckPreviewController = ComponentType<DeckPreviewControllerProps>;
type DeckPreviewControllerModule = { default: DeckPreviewController };
type DeckPreviewControllerLoader = () => Promise<DeckPreviewControllerModule>;

let deckPreviewControllerPromise: Promise<DeckPreviewControllerModule> | null = null;

function loadDeckPreviewController(): Promise<DeckPreviewControllerModule> {
  if (!deckPreviewControllerPromise) {
    deckPreviewControllerPromise = import('./HsReplayDeckPreviewController').catch(cause => {
      deckPreviewControllerPromise = null;
      throw cause;
    });
  }
  return deckPreviewControllerPromise;
}

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

export default function HsReplayDeckList({
  cards,
  className = '',
  label = 'Состав колоды',
  previewModuleLoader,
  previewControllerLoader = loadDeckPreviewController,
}: HsReplayDeckListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previewRequestRef = useRef(0);
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState<AppErrorKind>('render');
  const [renderState, setRenderState] = useState<DeckRenderState>('loading');
  const [renderRevision, setRenderRevision] = useState(0);
  const [previewState, setPreviewState] = useState<DeckPreviewState>('loading');
  const [previewRevision, setPreviewRevision] = useState(0);
  const [previewController, setPreviewController] = useState<DeckPreviewController | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !cards.length) return undefined;
    let active = true;
    container.replaceChildren();
    previewRequestRef.current += 1;
    setPreviewController(null);
    setPreviewState('loading');
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
        setRenderState('ready');
        setPreviewState('loading');
        const request = ++previewRequestRef.current;
        void previewControllerLoader()
          .then(module => {
            if (!active || request !== previewRequestRef.current) return;
            setPreviewController(() => module.default);
            setPreviewState('ready');
          })
          .catch(() => {
            if (active && request === previewRequestRef.current) setPreviewState('error');
          });
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
      previewRequestRef.current += 1;
      container.replaceChildren();
    };
  }, [cards, previewControllerLoader, previewRevision, renderRevision]);

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
  const PreviewController = previewController;
  const previewContainer = containerRef.current;
  return (
    <div
      className={`traditional-deck-list ${className}`}
      aria-label={label}
      data-deck-render-state={renderState}
    >
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
      {renderState === 'ready' && previewState === 'error' && (
        <div className="traditional-deck-list__preview-recovery" data-deck-preview-controller-state="error">
          <AsyncSurfaceState
            variant="stale"
            title="Карты не открылись"
            actionLabel="Повторить"
            onAction={() => setPreviewRevision(revision => revision + 1)}
            compact
          />
        </div>
      )}
      {previewState === 'ready' && PreviewController && previewContainer && (
        <PreviewController
          cards={cards}
          container={previewContainer}
          previewModuleLoader={previewModuleLoader}
        />
      )}
    </div>
  );
}
