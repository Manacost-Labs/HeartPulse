import { useMemo } from 'react';
import { useResolvedDeck } from '../decklist/useResolvedDeck';
import { funDeckWhy, type FunDeckRow, type FunDeckTagId } from '../funDecksPreview';
import { funDeckEntries } from './deckEntries';
import { funDeckClassMeta, funDeckFormat } from './deckMeta';
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
