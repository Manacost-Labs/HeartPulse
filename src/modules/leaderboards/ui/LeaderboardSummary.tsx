import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { ArrowDownRight } from 'lucide-react';
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
    <figcaption className="leaderboards-label">{unit === 'Рейтинг' ? 'Распределение рейтинга' : `Распределение: ${unit.toLowerCase()}`}</figcaption>
    <div className="leaderboards-histogram__bars" role="img" aria-label={`Распределение игроков по рейтингу: ${bars.map(bar => bar.label).join('; ')}`}>
      {bars.map(bar => <span key={bar.from} title={bar.label} style={{ '--lb-bar': Math.max(bar.height, 0.04) } as CSSProperties} />)}
    </div>
    <div className="leaderboards-histogram__ticks" aria-hidden="true">{ticks.map((tick, index) => <span key={index}>{tick}</span>)}</div>
  </figure>;
}

function ThresholdJump({ rank, onRank, children }: { rank: number; onRank: (rank: number) => void; children: ReactNode }) {
  return <button type="button" className="leaderboards-summary__jump" title={`Перейти к ${formatPlayers(rank)}-му месту`} onClick={() => onRank(rank)}>
    {children}<ArrowDownRight aria-hidden="true" />
  </button>;
}

/**
 * Сводка над таблицей полосой плиток: игроки (и изменение за день) и пороги
 * топ-100/1000/5000 — каждая плитка порога переводит к своему месту. У режимов
 * с рейтингом справа — гистограмма рейтинга.
 */
export function LeaderboardSummary({ stats, onRank }: { stats: LeaderboardStats; onRank: (rank: number) => void }) {
  const line = summaryLine(stats);
  const bars = histogramBars(stats);
  return <div className={bars.length ? 'leaderboards-summary has-histogram' : 'leaderboards-summary'}>
    <dl className="leaderboards-kpis">
      <div className="leaderboards-kpi">
        <dt className="leaderboards-label">Игроков</dt>
        <dd><strong>{line.players}</strong>{line.delta && <small>{line.delta}</small>}</dd>
      </div>
      {stats.board.rated
        ? line.thresholds.map(threshold => <div key={threshold.rank} className="leaderboards-kpi">
          <dt className="leaderboards-label">{threshold.label}</dt>
          <dd><ThresholdJump rank={threshold.rank} onRank={onRank}><strong>{threshold.rating ?? '—'}</strong></ThresholdJump></dd>
        </div>)
        // Без рейтинга у порога нет числа: одна плитка переходов вместо трёх пустых.
        : line.thresholds.length > 0 && <div className="leaderboards-kpi leaderboards-kpi--jumps">
          <dt className="leaderboards-label">Топ</dt>
          <dd>{line.thresholds.map(threshold => <ThresholdJump key={threshold.rank} rank={threshold.rank} onRank={onRank}>
            <span>{formatPlayers(threshold.rank)}</span>
          </ThresholdJump>)}</dd>
        </div>}
    </dl>
    {bars.length > 0 && <RatingHistogram bars={bars} unit={LEADERBOARD_RATING_LABELS[stats.board.mode] ?? 'Рейтинг'} />}
    {stats.snapshot.truncated && <p className="leaderboards-muted leaderboards-summary__note">Сохранены первые {formatPlayers(stats.snapshot.stored)} мест</p>}
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
