import { useMemo } from 'react';
import { BarChart } from '../shared/ui/analytics/BarChart';
import '../shared/ui/analytics/Analytics.css';

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
  return <BarChart title="Кривая маны" subtitle="Количество карт по стоимости" unit="count" rows={BUCKETS.map((bucket, index) => ({ label: `${bucket} маны`, value: values[index], color: '#39729b' }))} />;
}
