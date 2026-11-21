import type { ReactNode } from 'react';
import type { DeckLayout } from './deckViews/DeckLayoutSwitch';
import { DeckRowCard, DeckTileCard, useDeckView, winRateTone } from './deckViews/DeckViewCards';
import { deckClassMeta } from './deckViews/deckClass';
import type { ConstructedDeck } from './constructedCardRecord';
import { cardDeckStats } from './constructedCardDeckStats';

/** A deck with the card in the shared tile or row view (StandardCardDetail «Колоды с этой картой»). */
export function ConstructedCardDeckView({ deck, format, layout, winrateLock }: {
  /** A guest does not receive the deck's winrate: the lock stands where a subscriber reads it. */
  winrateLock?: ReactNode;
  key?: React.Key;
  deck: ConstructedDeck;
  format: 'standard' | 'wild';
  layout: Exclude<DeckLayout, 'images'>;
}) {
  const title = deck.archetypeLabel || deck.archetype || deck.title;
  const view = useDeckView(deck.deckCode, { format, archetype: title });
  const classMeta = deckClassMeta(deck.className);
  const { winRate, stats, note } = cardDeckStats(deck);
  const props = {
    deckCode: deck.deckCode,
    title,
    subtitle: `${classMeta.label} · ${format === 'wild' ? 'Вольный' : 'Стандарт'}`,
    icon: classMeta.icon,
    stats: winrateLock ? [{ label: stats[0]?.label ?? 'Винрейт', value: winrateLock }] : stats.map((stat, index) => (index === 0 ? { ...stat, tone: winRateTone(winRate) } : stat)),
    tags: note && !winrateLock ? [note] : [],
    tagsLabel: 'Оценка',
    view,
    heading: 'h3' as const,
  };
  return layout === 'tiles' ? <DeckTileCard {...props} /> : <DeckRowCard {...props} />;
}
