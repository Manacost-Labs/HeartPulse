import { useMemo, type CSSProperties } from 'react';

type ManaCurveCard = {
  cost: number;
  count: number;
};

const BUCKETS = ['0', '1', '2', '3', '4', '5', '6', '7+'] as const;

export default function DeckManaCurve({ cards }: { cards: ManaCurveCard[] }) {
  const values = useMemo(() => {
    const counts = Array.from({ length: BUCKETS.length }, () => 0);
    for (const card of cards) {
      const cost = Math.max(0, Number.isFinite(card.cost) ? Math.floor(card.cost) : 0);
      counts[Math.min(cost, BUCKETS.length - 1)] += card.count;
    }
    return counts;
  }, [cards]);
  const maximum = Math.max(1, ...values);

  return (
    <section className="deck-builder__mana-curve" aria-labelledby="deck-builder-mana-curve-title">
      <div>
        <span className="deck-builder__eyebrow">Баланс колоды</span>
        <h3 id="deck-builder-mana-curve-title">Кривая маны</h3>
      </div>
      <ol>
        {BUCKETS.map((bucket, index) => (
          <li key={bucket} aria-label={`${bucket} маны: ${values[index]} карт`}>
            <span className="deck-builder__mana-bar">
              <i style={{ '--mana-height': values[index] / maximum } as CSSProperties} />
            </span>
            <strong>{values[index]}</strong>
            <small>{bucket}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}
