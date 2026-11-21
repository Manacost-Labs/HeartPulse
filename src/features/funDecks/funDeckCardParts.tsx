import { useMemo } from 'react';
import { useDeckView } from '../deckViews/DeckViewCards';
import { funDeckWhy, type FunDeckRow, type FunDeckTagId } from '../funDecksPreview';
import { funDeckClassMeta, funDeckFormat } from './deckMeta';
import { funDeckSeed } from './funDeckSeed';
import './FunDeckLayouts.css';

/** Shared pieces of the tile and row deck cards. */
export type DeckCardProps = {
  deck: FunDeckRow;
  fresh?: boolean;
  tourAnchor?: boolean;
  eager?: boolean;
  pinnedTags?: readonly FunDeckTagId[];
};

/**
 * The deck's cards for the tile and row views. The open card list of the answer
 * is drawn at once, on the server too, and is the same for every viewer; once
 * the deck is about a screen away (`eager`: at once) its full list (rarities,
 * sideboards) is read and replaces it in place. A failed read keeps the open list.
 */
export function useFunDeck(deck: FunDeckRow, eager = false) {
  const format = funDeckFormat(deck);
  const seed = useMemo(() => funDeckSeed(deck, format), [deck, format]);
  const view = useDeckView(deck.deckCode, { format, archetype: deck.nearestArchetype || undefined }, eager, seed, true);
  const classMeta = funDeckClassMeta(deck, view.data?.heroDbfId);
  const subtitle = [
    classMeta.label,
    format === 'wild' ? 'Вольный' : 'Стандарт',
    view.data?.deckSizeLimit === 40 ? '40\u00a0карт' : '',
    deck.streamer ?? '',
  ].filter(Boolean).join(' · ');
  return { ...view, classMeta, subtitle };
}


export function winRateTone(deck: FunDeckRow): string {
  if (deck.winRate === null || !Number.isFinite(deck.winRate)) return '';
  return deck.winRate >= 52 ? 'is-up' : deck.winRate < 48 ? 'is-down' : '';
}

export function winRate(deck: FunDeckRow, digits: number): string {
  if (deck.winRate === null || !Number.isFinite(deck.winRate)) return '—';
  return `${deck.winRate.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
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
