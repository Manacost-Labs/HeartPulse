import { useMemo, type ReactNode } from 'react';
import { Copy, RefreshCw, TriangleAlert } from 'lucide-react';
import { useResolvedDeck } from '../decklist/useResolvedDeck';
import { funDeckWhy, type FunDeckRow, type FunDeckTagId } from '../funDecksPreview';
import { LoadingBlock, LoadingSurface } from '../../shared/ui/LoadingSurface';
import { funDeckEntries, type FunDeckCard } from './deckEntries';
import { funDeckClassMeta, funDeckFormat } from './deckMeta';
import { useCopyDeckCode } from './useCopyDeckCode';
import './FunDeckLayouts.css';

/** Shared pieces of the tile and row deck cards. */
export type DeckCardProps = {
  deck: FunDeckRow;
  fresh?: boolean;
  tourAnchor?: boolean;
  eager?: boolean;
  pinnedTags?: readonly FunDeckTagId[];
};

export function useFunDeck(deck: FunDeckRow) {
  const format = funDeckFormat(deck);
  const resolved = useResolvedDeck(deck.deckCode, { format, archetype: deck.nearestArchetype || undefined });
  const classMeta = funDeckClassMeta(deck, resolved.data?.heroDbfId);
  const entries = useMemo(
    () => (resolved.data ? funDeckEntries(resolved.data.cards, resolved.data.sideboards) : []),
    [resolved.data],
  );
  const subtitle = [
    classMeta.label,
    format === 'wild' ? 'Вольный' : 'Стандарт',
    resolved.data?.deckSizeLimit === 40 ? '40 карт' : '',
  ].filter(Boolean).join(' · ');
  return { ...resolved, classMeta, entries, subtitle };
}

export function cardLabel(card: FunDeckCard, cost = card.cost): string {
  return `${cost} маны · ${card.name}${card.count > 1 ? ` ×${card.count}` : ''}`;
}

export function winRateTone(deck: FunDeckRow): string {
  if (deck.winRate === null || !Number.isFinite(deck.winRate)) return '';
  return deck.winRate >= 52 ? 'is-up' : deck.winRate < 48 ? 'is-down' : '';
}

export function winRate(deck: FunDeckRow, digits: number): string {
  if (deck.winRate === null || !Number.isFinite(deck.winRate)) return '—';
  return `${deck.winRate.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
}

/** A card that opens its page, or plain art for tokens without one. */
export function CardLink({ card, cost, className, children }: { card: FunDeckCard; cost?: number; className: string; children: ReactNode }) {
  const label = cardLabel(card, cost);
  return card.pagePath ? (
    <a className={className} href={card.pagePath} aria-label={label} title={label}>{children}</a>
  ) : (
    <span className={className} role="img" aria-label={label} title={label}>{children}</span>
  );
}

export function CopyDeckButton({ deck, className }: { deck: FunDeckRow; className: string }) {
  const { state, label, copy } = useCopyDeckCode(deck.deckCode);
  return (
    <button type="button" className={`${className}${state === 'ok' ? ' is-copied' : ''}`}
      aria-label={`${label}: ${deck.title}`} onClick={() => void copy()}>
      <Copy aria-hidden="true" />
      <span aria-live="polite">{state === 'idle' ? 'Копировать код' : label}</span>
    </button>
  );
}

export function DeckLoadState({ error, reload, layout, empty = false }: {
  error: string; reload: () => void; layout: 'tiles' | 'rows'; empty?: boolean;
}) {
  if (empty) {
    return <div className={`fun-deck-layout-state fun-deck-layout-state--${layout}`}><span>Состав этой колоды пока недоступен.</span></div>;
  }
  if (error) {
    return (
      <div className={`fun-deck-layout-state fun-deck-layout-state--${layout}`} role="alert">
        <TriangleAlert aria-hidden="true" />
        <strong>Состав не загрузился</strong>
        <button type="button" onClick={reload}>
          <RefreshCw aria-hidden="true" />
          Повторить
        </button>
      </div>
    );
  }
  return (
    <LoadingSurface label="Загружаем состав колоды" quiet layout="rows"
      className={`fun-deck-layout-state fun-deck-layout-state--${layout}`} blocksClassName="fun-deck-layout-state__blocks">
      {Array.from({ length: layout === 'tiles' ? 3 : 1 }, (_, index) => <LoadingBlock key={index} className="fun-deck-layout-state__block" />)}
    </LoadingSurface>
  );
}

export function WhyTags({ deck, pinnedTags, className }: { deck: FunDeckRow; pinnedTags: readonly FunDeckTagId[]; className: string }) {
  const why = funDeckWhy(deck, pinnedTags);
  if (!why.length) return null;
  return (
    <ul className={className} role="list" aria-label="Почему фан">
      {why.map(label => <li key={label}>{label}</li>)}
    </ul>
  );
}
