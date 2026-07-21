import React from 'react';

type DeckFallbackCard = {
  id: string;
  name: string;
  cost: number;
  count: number;
};

export default function HsReplayDeckFallback({ cards }: { cards: DeckFallbackCard[] }) {
  return (
    <ul className="traditional-deck-list__fallback" aria-label="Текстовый состав колоды">
      {cards.map(card => (
        <li key={card.id}>
          <span className="traditional-deck-list__fallback-cost" aria-label={`${card.cost} маны`}>{card.cost}</span>
          <span className="traditional-deck-list__fallback-name">{card.name}</span>
          <strong aria-label={`${card.count} копии`}>×{card.count}</strong>
        </li>
      ))}
    </ul>
  );
}
