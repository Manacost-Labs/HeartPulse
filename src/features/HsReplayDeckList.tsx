import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import '../vendor/hsreplay-deck-view/hsreplay-deck-view.js';
import '../vendor/hsreplay-deck-view/hsreplay-deck-view.css';
import './HsReplayDeckList.css';

export type HsReplayDeckCard = {
  id: string;
  dbfId: number;
  name: string;
  cost: number;
  rarity: string;
  elite: boolean;
  count: number;
  image: string;
};

type HsReplayDeckListProps = {
  cards: HsReplayDeckCard[];
  className?: string;
  label?: string;
};

export default function HsReplayDeckList({ cards, className = '', label = 'Состав колоды' }: HsReplayDeckListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const container = containerRef.current;
    const api = window.HSReplayDeckView;
    if (!container || !api?.renderDeck || !cards.length) return undefined;
    setError('');
    try {
      api.renderDeck(container, cards, {
        className: 'traditional-deck-list__render',
        group: true,
        sort: true,
        clear: true,
        showSingleCountBox: false,
      });
    } catch {
      setError('Не удалось отобразить состав колоды');
    }
    return () => container.replaceChildren();
  }, [cards]);

  if (!cards.length) {
    return <div className={`traditional-deck-list traditional-deck-list--empty ${className}`} role="status"><RefreshCw size={20} /><span>Состав колоды обновляется</span></div>;
  }
  return (
    <div className={`traditional-deck-list ${className}`} aria-label={label}>
      {error && <div className="traditional-deck-list__error" role="alert"><AlertTriangle size={18} /> {error}</div>}
      <div ref={containerRef} data-deck-cards={cards.flatMap(card => Array.from({ length: card.count }, () => card.dbfId)).join(',')} />
    </div>
  );
}
