import { useMemo, type CSSProperties } from 'react';
import { LineChart } from '../../../shared/ui/analytics/LineChart';
import type { ChartPoint } from '../../../shared/ui/analytics/analyticsModel';
import { LEADERBOARD_RATING_LABELS, formatLeaderboardDay, formatPlayers } from '../model/leaderboardsView';
import { histogramBars, histogramTicks, summaryLine, type HistogramBar } from '../model/leaderboardSummary';
import type { LeaderboardStats } from '../model/types';
import '../../../shared/ui/analytics/Analytics.css';

function dayTick(day: string): string {
  return `${Number(day.slice(8, 10))}.${day.slice(5, 7)}`;
}

function RatingHistogram({ bars, unit }: { bars: HistogramBar[]; unit: string }) {
  const ticks = histogramTicks(bars);
  return <figure className="leaderboards-histogram">
    <figcaption className="leaderboards-muted">{unit === 'Рейтинг' ? 'Распределение рейтинга' : `Распределение: ${unit.toLowerCase()}`}</figcaption>
    <div className="leaderboards-histogram__plot">
      <div className="leaderboards-histogram__bars" role="img" aria-label={`Распределение игроков по рейтингу: ${bars.map(bar => bar.label).join('; ')}`}>
        {bars.map(bar => <span key={bar.from} title={bar.label} style={{ '--lb-bar': Math.max(bar.height, 0.04) } as CSSProperties} />)}
      </div>
      <div className="leaderboards-histogram__ticks" aria-hidden="true">{ticks.map((tick, index) => <span key={index}>{tick}</span>)}</div>
    </div>
  </figure>;
}

/**
 * Сводка над таблицей одной спокойной строкой: игроки (и изменение за день),
 * и пороги топ-100/1000/5000 — каждый порог переводит
 * к своему месту. У режимов с рейтингом под строкой — гистограмма рейтинга.
 */
export function LeaderboardSummary({ stats, onRank }: { stats: LeaderboardStats; onRank: (rank: number) => void }) {
  const line = summaryLine(stats);
  const bars = histogramBars(stats);
  return <div className="leaderboards-summary">
    <p className="leaderboards-summary__line">
      <span><strong>{line.players}</strong>{line.delta && <span className="leaderboards-muted"> {line.delta}</span>}</span>
      {line.thresholds.map(threshold => <button key={threshold.rank} type="button" className="leaderboards-summary__jump"
        title={`Перейти к ${formatPlayers(threshold.rank)}-му месту`} onClick={() => onRank(threshold.rank)}>
        {threshold.label}{threshold.rating && <strong> {threshold.rating}</strong>}
      </button>)}
    </p>
    {stats.snapshot.truncated && <p className="leaderboards-muted">Сохранены первые {formatPlayers(stats.snapshot.stored)} мест</p>}
    {bars.length > 0 && <RatingHistogram bars={bars} unit={LEADERBOARD_RATING_LABELS[stats.board.mode] ?? 'Рейтинг'} />}
  </div>;
}

/** Графики под таблицей: игроки и порог топа по дням (распределение рейтинга — в сводке). */
export function LeaderboardCharts({ stats }: { stats: LeaderboardStats }) {
  const { board, series } = stats;
  const unit = LEADERBOARD_RATING_LABELS[board.mode] ?? 'Рейтинг';
  // Средние победы Арены дробные: целочисленная ось их бы округлила.
  const ratingUnit = board.mode === 'arena' ? '' : 'count';
  const players = useMemo<ChartPoint[]>(() => series.map(point => ({
    x: point.day, y: point.players, tick: dayTick(point.day), label: formatLeaderboardDay(point.day),
  })), [series]);
  const thresholds = useMemo<ChartPoint[]>(() => series.map(point => ({
    x: point.day, y: point.at1000 ?? point.at100, tick: dayTick(point.day), label: formatLeaderboardDay(point.day),
  })), [series]);
  const thresholdRank = series.some(point => point.at1000 !== null) ? 1000 : 100;

  if (series.length < 2) return null;
  return <section className="leaderboards-charts" aria-label="Графики таблицы">
      <LineChart title="Игроков в таблице по дням" unit="count" color="#8d171d" points={players} xLabel="День" />
      {board.rated && <LineChart title={`Порог топ-${formatPlayers(thresholdRank)} по дням`}
        subtitle={unit} unit={ratingUnit} color="#8f536d" points={thresholds} xLabel="День" />}
  </section>;
}
