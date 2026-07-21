import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { CardPreviewSheetCard } from './CardPreviewSheet';
import CardPreviewTooltip, { type CardPreviewTarget } from './CardPreviewTooltip';
import type { HsReplayDeckCard } from './HsReplayDeckList';
import { bindDeckPreviewInteractions } from './hsReplayDeckPreviewInteractions';
import './HsReplayDeckPreviewController.css';

export type CardPreviewComponent = ComponentType<{
  card: CardPreviewSheetCard;
  onClose: () => void;
}>;

export type CardPreviewModule = { default: CardPreviewComponent };
export type CardPreviewModuleLoader = () => Promise<CardPreviewModule>;

type CardPreviewLoadState = 'idle' | 'loading' | 'ready' | 'error';

type HsReplayDeckPreviewControllerProps = {
  cards: HsReplayDeckCard[];
  container: HTMLElement;
  previewModuleLoader?: CardPreviewModuleLoader;
};

let cardPreviewModulePromise: Promise<CardPreviewModule> | null = null;

function loadCardPreviewModule(): Promise<CardPreviewModule> {
  if (!cardPreviewModulePromise) {
    cardPreviewModulePromise = import('./CardPreviewSheet').catch(cause => {
      cardPreviewModulePromise = null;
      throw cause;
    });
  }
  return cardPreviewModulePromise;
}

function CardPreviewLoadStatus({
  card,
  state,
  onClose,
  onRetry,
}: {
  card: CardPreviewSheetCard;
  state: Exclude<CardPreviewLoadState, 'idle' | 'ready'>;
  onClose: () => void;
  onRetry: () => void;
}) {
  const failed = state === 'error';
  return (
    <section
      className="deck-card-preview-status"
      data-card-preview-load-state={state}
      role={failed ? 'alert' : 'status'}
      aria-live={failed ? 'assertive' : 'polite'}
    >
      <strong>{failed ? 'Не удалось открыть полную карту' : `Открываем карту «${card.name}»`}</strong>
      <span>{failed ? 'Состав колоды продолжает работать.' : 'Загружаем русское изображение карты.'}</span>
      <div>
        {failed && (
          <button
            type="button"
            className="recoverable-surface__action"
            data-card-preview-retry=""
            onClick={onRetry}
          >
            Повторить
          </button>
        )}
        <button type="button" onClick={onClose}>{failed ? 'Закрыть' : 'Отмена'}</button>
      </div>
    </section>
  );
}

export default function HsReplayDeckPreviewController({
  cards,
  container,
  previewModuleLoader = loadCardPreviewModule,
}: HsReplayDeckPreviewControllerProps) {
  const requestRef = useRef(0);
  const componentRef = useRef<CardPreviewComponent | null>(null);
  const loaderRef = useRef(previewModuleLoader);
  const triggerRef = useRef<HTMLElement | null>(null);
  const sheetCardRef = useRef<CardPreviewSheetCard | null>(null);
  loaderRef.current = previewModuleLoader;

  const [tooltip, setTooltip] = useState<CardPreviewTarget | null>(null);
  const [sheetCard, setSheetCard] = useState<CardPreviewSheetCard | null>(null);
  const [previewComponent, setPreviewComponent] = useState<CardPreviewComponent | null>(null);
  const [loadState, setLoadState] = useState<CardPreviewLoadState>('idle');

  const focusTrigger = () => {
    const trigger = triggerRef.current;
    if (!trigger?.isConnected || trigger.closest('[inert]')) return;
    trigger.focus({ preventScroll: true });
  };

  const closePreview = () => {
    requestRef.current += 1;
    sheetCardRef.current = null;
    if (loadState !== 'ready') focusTrigger();
    setSheetCard(null);
    setLoadState('idle');
  };

  const openPreview = (card: CardPreviewSheetCard, trigger?: HTMLElement) => {
    if (trigger) triggerRef.current = trigger;
    else if (!triggerRef.current && document.activeElement instanceof HTMLElement) triggerRef.current = document.activeElement;
    sheetCardRef.current = card;
    setTooltip(null);
    setSheetCard(card);
    if (componentRef.current) {
      setLoadState('ready');
      return;
    }

    const request = ++requestRef.current;
    setLoadState('loading');
    void loaderRef.current()
      .then(module => {
        if (request !== requestRef.current) return;
        componentRef.current = module.default;
        focusTrigger();
        setPreviewComponent(() => module.default);
        setLoadState('ready');
      })
      .catch(() => {
        if (request === requestRef.current) setLoadState('error');
      });
  };

  useEffect(() => {
    const cleanup = bindDeckPreviewInteractions({
      container,
      cards,
      showPreview: setTooltip,
      hidePreview: cardId => setTooltip(current => current?.id === cardId ? null : current),
      openSheet: openPreview,
    });
    return () => {
      requestRef.current += 1;
      cleanup();
    };
  }, [cards, container]);

  const PreviewSheet = previewComponent;
  return (
    <>
      {tooltip && !sheetCard && <CardPreviewTooltip preview={tooltip} />}
      {sheetCard && loadState === 'ready' && PreviewSheet && (
        <PreviewSheet card={sheetCard} onClose={closePreview} />
      )}
      {sheetCard && (loadState === 'loading' || loadState === 'error') && (
        <CardPreviewLoadStatus
          card={sheetCard}
          state={loadState}
          onClose={closePreview}
          onRetry={() => openPreview(sheetCard)}
        />
      )}
    </>
  );
}
