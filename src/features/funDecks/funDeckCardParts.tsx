import { useMemo, type ReactNode } from 'react';
import { Copy, RefreshCw, TriangleAlert } from 'lucide-react';
import { useResolvedDeck } from '../decklist/useResolvedDeck';
import { funDeckWhy, type FunDeckRow, type FunDeckTagId } from '../funDecksPreview';
import { LoadingBlock, LoadingSurface } from '../../shared/ui/LoadingSurface';
import { funDeckEntries, type FunDeckCard } from './deckEntries';
import { funDeckClassMeta, funDeckFormat } from './deckMeta';
import { useCopyDeckCode } from './useCopyDeckCode';
import { useNearScreen } from './useNearScreen';
import './FunDeckLayouts.css';

/** Shared pieces of the tile and row deck cards. */
export type DeckCardProps = {
  deck: FunDeckRow;
  fresh?: boolean;
  tourAnchor?: boolean;
  eager?: boolean;
  pinnedTags?: readonly FunDeckTagId[];
};

/** `eager`: in view on arrival, resolved at once; the others wait until they are about a screen away. */
export function useFunDeck(deck: FunDeckRow, eager = false) {
  const format = funDeckFormat(deck);
  const { ref, near } = useNearScreen<HTMLElement>(eager);
  const resolved = useResolvedDeck(deck.deckCode, { format, archetype: deck.nearestArchetype || undefined, enabled: near });
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
  return { ...resolved, classMeta, entries, subtitle, ref };
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

/**
 * A card that opens its page, or plain art for tokens without one. The data
 * attributes are what the page's single hover preview reads; there is no
 * `title`, which would show a second tooltip next to the preview.
 */
export function CardLink({ card, cost, className, children }: { card: FunDeckCard; cost?: number; className: string; children: ReactNode }) {
  const label = cardLabel(card, cost);
  const preview = { 'data-fun-card': card.id, 'data-fun-card-name': card.name, 'data-fun-card-image': card.cardImage || card.image || undefined };
  return card.pagePath ? (
    <a className={className} href={card.pagePath} aria-label={label} {...preview}>{children}</a>
  ) : (
    <span className={className} role="img" aria-label={label} {...preview}>{children}</span>
  );
}

export function CopyDeckButton({ deckCode, title, className }: { deckCode: string; title: string; className: string }) {
  const { state, label, copy } = useCopyDeckCode(deckCode);
  return (
    <button type="button" className={`${className}${state === 'ok' ? ' is-copied' : ''}`}
      aria-label={`${label}: ${title}`} onClick={() => void copy()}>
      <Copy aria-hidden="true" />
      <span aria-live="polite">{state === 'idle' ? 'Копировать код' : label}</span>
    </button>
  );
}

const TILE_BLOCKS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'] as const;
const ROW_BLOCKS = ['a'] as const;

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
      {(layout === 'tiles' ? TILE_BLOCKS : ROW_BLOCKS).map(id => <LoadingBlock key={id} className="fun-deck-layout-state__block" />)}
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
