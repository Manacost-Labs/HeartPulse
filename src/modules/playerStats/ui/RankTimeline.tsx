import { CLASS_LABELS, classIconUrl, formatGameDate, rankLabel } from '../model/format';
import type { ConstructedStats } from '../model/stats';
import { GameTimeline } from './GameTimeline';
import './PlayerStatsCharts.css';

/** Every fifth star level from Bronze 10 to Legend: rank 10 and rank 5 of each league. */
const TICK_LEVELS = Array.from({ length: 11 }, (_, index) => 1 + index * 5);
const RESULT_LABELS: Record<string, string> = { win: 'Победа', loss: 'Поражение', tie: 'Ничья' };

/** Ladder rank after each ranked game; the axis marks rank 10 and rank 5 of every league. */
export function RankTimeline({ points }: { points: ConstructedStats['rankSeries'] }) {
  return (
    <GameTimeline
      points={points}
      label={`Ранг после каждой из ${points.length} рейтинговых игр`}
      leftAxis={84}
      ticks={() => TICK_LEVELS.map(level => level * 4)}
      formatValue={value => rankLabel({ starLevel: Math.round(value / 4), stars: 0, legendRank: null })}
      describe={point => `${formatGameDate(point.startedAt)}: ${RESULT_LABELS[point.result] ?? point.result}, ${rankLabel(point.rank)}`}
      renderCard={point => (
        <div className="player-stats-timeline__card-head">
          <img src={classIconUrl(point.playerClass)} alt="" />
          <div>
            <small>{formatGameDate(point.startedAt)}</small>
            <strong>{CLASS_LABELS[point.playerClass]}</strong>
          </div>
          <dl>
            <div><dt>Итог</dt><dd data-tone={point.result === 'win' ? 'better' : 'worse'}>{RESULT_LABELS[point.result] ?? point.result}</dd></div>
            <div><dt>Ранг</dt><dd>{rankLabel(point.rank)}</dd></div>
          </dl>
        </div>
      )}
    />
  );
}
