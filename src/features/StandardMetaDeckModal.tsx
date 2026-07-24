import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Copy,
  Maximize2,
  RefreshCw,
  ShieldCheck,
  TableProperties,
  Trophy,
  X,
} from 'lucide-react';
import ModalSurface from '../components/ModalSurface/ModalSurface';
import HsReplayDeckList, { type HsReplayDeckCard } from './HsReplayDeckList';
import './StandardMetaModal.css';

type MetaClass =
  | 'deathknight'
  | 'demonhunter'
  | 'druid'
  | 'hunter'
  | 'mage'
  | 'paladin'
  | 'priest'
  | 'rogue'
  | 'shaman'
  | 'warlock'
  | 'warrior';

type DeckModalState = {
  item: {
    archetype: string;
    archetypeLabel: string;
    classKey: MetaClass | null;
  };
  recommendation: {
    archetype: string;
    archetypeLabel: string;
    deckCode: string;
    streamer: string | null;
    sampleGames: number | null;
    winrate: number | null;
    classKey: MetaClass;
    deckCards: HsReplayDeckCard[];
  } | null;
  preview: {
    hash: string;
    state: string;
    ready: boolean;
    imageUrl: string | null;
    error: string | null;
  } | null;
  loadingRecommendation: boolean;
  loadingPreview: boolean;
  error: string;
  previewError: string;
};

function classIcon(classKey: MetaClass | null): string {
  return classKey ? `/class_icon/ui/${classKey}-64.webp` : '/class_icon/neutral.webp';
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
}

/** Preserved shared modal for deck-card and nested-lightbox regression fixtures. */
export function DeckModal({
  state,
  onClose,
  onRenderPreview,
}: {
  state: DeckModalState;
  onClose: () => void;
  onRenderPreview: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [presentation, setPresentation] = useState<'list' | 'image'>('list');

  useEffect(() => setPresentation('list'), [state.recommendation?.deckCode]);

  const copyDeck = async () => {
    if (!state.recommendation?.deckCode) return;
    const deckCode = state.recommendation.deckCode;
    let didCopy = false;
    try {
      await navigator.clipboard.writeText(deckCode);
      didCopy = true;
    } catch {
      const fallback = document.createElement('textarea');
      fallback.value = deckCode;
      fallback.setAttribute('readonly', '');
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      document.body.appendChild(fallback);
      fallback.select();
      didCopy = document.execCommand('copy');
      fallback.remove();
    }
    if (didCopy) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <ModalSurface
      className="standard-meta-modal"
      panelClassName="standard-meta-modal__panel"
      backdropClassName="standard-meta-modal__backdrop"
      ariaLabelledBy="standard-meta-deck-title"
      closeLabel="Закрыть окно сборки"
      initialFocusRef={closeRef}
      onClose={onClose}
    >
      <button ref={closeRef} type="button" className="standard-meta-modal__close" onClick={onClose} aria-label="Закрыть окно">
        <X size={22} />
      </button>
      <header className="standard-meta-modal__header">
        <img src={classIcon(state.recommendation?.classKey ?? state.item.classKey)} alt="" width="64" height="64" decoding="async" />
        <div>
          <span className="standard-meta-modal__eyebrow">РЕКОМЕНДУЕМАЯ СБОРКА · BETA</span>
          <h2 id="standard-meta-deck-title">{state.item.archetypeLabel}</h2>
          <p>{state.item.archetype}</p>
        </div>
      </header>
      {state.loadingRecommendation && (
        <div className="standard-meta-modal__status standard-meta-modal__status--full" role="status">
          <RefreshCw className="standard-meta-modal__spinner" size={30} />
          <strong>Подбираем свежую сборку</strong>
          <span>Сравниваем доступные колоды и размер выборки.</span>
        </div>
      )}
      {!state.loadingRecommendation && state.error && (
        <div className="standard-meta-modal__status standard-meta-modal__status--warning standard-meta-modal__status--full" role="alert">
          <AlertTriangle size={30} />
          <strong>Сборка пока не найдена</strong>
          <span>{state.error}</span>
        </div>
      )}
      {state.recommendation && (
        <div className="standard-meta-modal__content">
          <div className="standard-meta-modal__presentation" aria-label="Представление колоды">
            <button type="button" aria-pressed={presentation === 'list'} onClick={() => setPresentation('list')}><TableProperties size={16} /> Состав</button>
            <button type="button" aria-pressed={presentation === 'image'} onClick={() => { setPresentation('image'); if (!state.preview && !state.loadingPreview) onRenderPreview(); }}><Maximize2 size={16} /> Изображение</button>
          </div>
          <div className="standard-meta-modal__image-stage">
            {presentation === 'list' ? (
              <HsReplayDeckList cards={state.recommendation.deckCards || []} label={`Состав колоды ${state.item.archetypeLabel}`} />
            ) : state.preview?.ready && state.preview.imageUrl ? (
              <a href={state.preview.imageUrl} target="_blank" rel="noreferrer" className="standard-meta-modal__image-link" aria-label="Открыть изображение колоды в полном размере">
                <img src={state.preview.imageUrl} alt={`Колода ${state.item.archetypeLabel}`} decoding="async" />
                <span><Maximize2 size={16} /> Полный размер</span>
              </a>
            ) : state.loadingPreview || (state.preview && !state.preview.ready && state.preview.state !== 'error') ? (
              <div className="standard-meta-modal__status" role="status">
                <RefreshCw className="standard-meta-modal__spinner" size={30} />
                <strong>DeckView рисует колоду</strong>
                <span>Окно обновится автоматически.</span>
              </div>
            ) : (
              <div className="standard-meta-modal__status standard-meta-modal__status--warning">
                <AlertTriangle size={30} />
                <strong>Изображение пока недоступно</strong>
                <span>{state.previewError || state.preview?.error || 'Код колоды уже можно скопировать.'}</span>
                <button type="button" onClick={onRenderPreview}><RefreshCw size={16} /> Повторить</button>
              </div>
            )}
          </div>
          <aside className="standard-meta-modal__details">
            <div className="standard-meta-modal__deck-meta">
              {state.recommendation.streamer && <span><Trophy size={15} /> {state.recommendation.streamer}</span>}
              {state.recommendation.sampleGames !== null && <span>{state.recommendation.sampleGames.toLocaleString('ru-RU')} игр</span>}
              {state.recommendation.winrate !== null && <span>{formatPercent(state.recommendation.winrate)} WR</span>}
            </div>
            <div className="standard-meta-modal__code-block">
              <span>Код колоды</span>
              <code>{state.recommendation.deckCode}</code>
            </div>
            <div className="standard-meta-modal__actions">
              <button
                type="button"
                className={`standard-meta-modal__copy-button${copied ? ' standard-meta-modal__copy-button--copied' : ''}`}
                onClick={copyDeck}
                aria-label={copied ? 'Код колоды скопирован' : 'Скопировать код колоды'}
              >
                {copied ? <ShieldCheck size={19} aria-hidden="true" /> : <Copy size={19} aria-hidden="true" />}
                <span aria-live="polite">{copied ? 'Код скопирован' : 'Скопировать код'}</span>
              </button>
            </div>
          </aside>
        </div>
      )}
    </ModalSurface>
  );
}
