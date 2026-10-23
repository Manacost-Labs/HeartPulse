import { useMemo } from 'react';
import { cardImageUrl, formatGameDate, formatNumber, formatSigned } from '../model/format';
import type { RatingPoint } from '../model/stats';
import { GameTimeline } from './GameTimeline';
import { MinionBoard } from './MinionBoard';
import './PlayerStatsCharts.css';

/** Battlegrounds rating after each game; the card is HSReplay's: hero, place, rating change, final board. */
export function RatingTimeline({ points, names }: { points: readonly RatingPoint[]; names: Record<string, string> }) {
  const timeline = useMemo(() => points.map(point => ({ ...point, value: point.rating })), [points]);
  const heroName = (cardId: string) => names[cardId] ?? cardId;
  return (
    <GameTimeline
      points={timeline}
      label={`Рейтинг после каждой из ${points.length} игр`}
      formatValue={value => formatNumber(Math.round(value))}
      describe={point => `${formatGameDate(point.startedAt)}: ${heroName(point.heroCardId)}, ${point.placement}-е место, рейтинг ${point.rating}`}
      renderCard={point => (
        <>
          <div className="player-stats-timeline__card-head">
            <span className="player-stats-timeline__portrait"><img src={cardImageUrl(point.heroCardId)} alt="" /></span>
            <div>
              <small>Герой</small>
              <strong>{heroName(point.heroCardId)}</strong>
              <small>{formatGameDate(point.startedAt)}</small>
            </div>
            <dl>
              <div><dt>Место</dt><dd>{point.placement}</dd></div>
              <div>
                <dt>Рейтинг</dt>
                <dd>
                  {formatNumber(point.rating)}
                  {point.delta !== null ? <span data-tone={point.delta >= 0 ? 'better' : 'worse'}> ({formatSigned(point.delta)})</span> : null}
                </dd>
              </div>
            </dl>
          </div>
          <MinionBoard board={point.board} names={names} size="sm" />
        </>
      )}
    />
  );
}
