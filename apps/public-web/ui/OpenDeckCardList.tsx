import './OpenDeckList.css';
import type { OpenDeckCard } from '@/src/features/archetypeOpenBuilds';

/**
 * The card list of an open deck, as plain server HTML: a name and a count for
 * a pair, the cost and the rarity as attributes the stylesheet draws. A row
 * is one string, not a tree of spans: a deck list repeats dozens of times per
 * page, and the markup appears twice (HTML and the RSC payload). No images and
 * no client code, so the same markup serves a guest, a robot and a reader
 * without scripts.
 */
export function OpenDeckCardList({ cards, label }: { cards: readonly OpenDeckCard[]; label: string }) {
  return <ol className="open-deck__cards" aria-label={label}>
    {cards.map(card => <li key={card.dbfId} data-cost={card.cost} data-rarity={card.rarity.toLowerCase()}>
      {card.count > 1 ? `${card.name} ×${card.count}` : card.name}
    </li>)}
  </ol>;
}
