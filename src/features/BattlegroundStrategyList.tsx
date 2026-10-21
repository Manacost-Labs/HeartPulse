import { useState } from 'react';
import { STRATEGY_ROWS_SHOWN, type StrategyRow } from './bgLibraryStrategyRows';
import './BattlegroundStrategyList.css';

type BattlegroundStrategyListProps = {
  rows: Array<StrategyRow & { href: string }>;
  onOpen: (href: string, event: React.MouseEvent<HTMLAnchorElement>) => void;
};

/** Builds that use the card as compact link rows; the rest open behind "Показать все". */
export function BattlegroundStrategyList({ rows, onOpen }: BattlegroundStrategyListProps) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, STRATEGY_ROWS_SHOWN);
  return (
    <div className="bg-strategy-list">
      <ul>
        {shown.map(row => (
          <li key={row.key}>
            <a className="bg-strategy-list__row" href={row.href} onClick={event => onOpen(row.href, event)}>
              <span className="bg-strategy-list__copy">
                <span className="bg-strategy-list__label">{row.label}</span>
                <span className="bg-strategy-list__title">{row.title}</span>
                {row.description ? <span className="bg-strategy-list__description">{row.description}</span> : null}
              </span>
              <span className="bg-strategy-list__minions">
                {row.minions.map(minion => (
                  <img key={minion.key} src={minion.image} alt={minion.name} title={minion.name} width="40" height="40"
                    loading="lazy" decoding="async" data-current={minion.current || undefined}
                    onError={event => { event.currentTarget.hidden = true; }} />
                ))}
              </span>
            </a>
          </li>
        ))}
      </ul>
      {rows.length > STRATEGY_ROWS_SHOWN ? (
        <button type="button" className="bg-strategy-list__more" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
          {expanded ? 'Свернуть' : `Показать все (${rows.length})`}
        </button>
      ) : null}
    </div>
  );
}
