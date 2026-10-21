import { useMemo } from 'react';
import { standardMatchupOverview, type StandardMatchupsData } from '../modules/standardMatchups/public';
import { ClassIcon, MatchupBar, matchupSide, percent } from './StandardMatchupsVisuals';

const LEADERS = 6;

/**
 * The archetypes with the best win rate against the field, each with its share
 * of games and its best and worst pair; a card opens that archetype's overview.
 */
export function StandardMatchupsLeaders({ data, labelOf, onOpen }: {
  data: StandardMatchupsData;
  labelOf: (name: string, label?: string) => string;
  onOpen: (archetype: string) => void;
}) {
  const leaders = useMemo(() => data.rows
    .filter(row => row.winrate !== null)
    .sort((a, b) => (b.winrate ?? 0) - (a.winrate ?? 0))
    .slice(0, LEADERS)
    .map(row => standardMatchupOverview(data, row.archetype, labelOf))
    .filter(overview => overview !== null), [data, labelOf]);

  if (!leaders.length) return <p className="standard-matchups-leaders__empty">Сводка появится после загрузки.</p>;
  return (
    <ol className="standard-matchups-leaders">
      {leaders.map(({ archetype, best, worst }) => (
        <li key={archetype.id}>
          <button type="button" className="standard-matchups-leaders__card" onClick={() => onOpen(archetype.id)}
            aria-label={`Открыть матчапы: ${archetype.label}`}>
            <span className="standard-matchups-leaders__head">
              <ClassIcon classKey={archetype.classKey} size={36} />
              <span className="standard-matchups-leaders__name">
                <strong>{archetype.label}</strong>
                <small>доля игр {percent(archetype.share)}</small>
              </span>
              <span className="standard-matchups-leaders__rate" data-side={matchupSide(archetype.winrate ?? 50)}>{percent(archetype.winrate)}</span>
            </span>
            <MatchupBar value={archetype.winrate ?? 50} />
            <span className="standard-matchups-leaders__pairs">
              {best && <span data-side="up"><ClassIcon classKey={best.classKey} size={18} />лучше всего: {best.label} <b>{percent(best.vs)}</b></span>}
              {worst && <span data-side="down"><ClassIcon classKey={worst.classKey} size={18} />хуже всего: {worst.label} <b>{percent(worst.vs)}</b></span>}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
