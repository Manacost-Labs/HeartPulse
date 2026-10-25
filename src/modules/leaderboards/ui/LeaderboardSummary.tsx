import { useMemo } from 'react';
import { ColumnChart } from '../../../shared/ui/analytics/ColumnChart';
import { LineChart } from '../../../shared/ui/analytics/LineChart';
import type { ChartPoint } from '../../../shared/ui/analytics/analyticsModel';
import {
  LEADERBOARD_RATING_LABELS, formatLeaderboardDay, formatPlayers, formatRating,
  formatRatingTick, playersDelta,
} from '../model/leaderboardsView';
import type { LeaderboardStats } from '../model/types';
import '../../../shared/ui/analytics/Analytics.css';

function Plaque({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="leaderboards-plaque">
    <dt>{label}</dt>
    <dd>{value}{note && <small>{note}</small>}</dd>
  </div>;
}

function dayTick(day: string): string {
  return `${Number(day.slice(8, 10))}.${day.slice(5, 7)}`;
}

/**
 * Сводка над таблицей небольшими плашками: сколько в ней игроков, рейтинг
 * первого места и пороги топ-100/1000/5000 (только у режимов с рейтингом).
 */
export function LeaderboardSummary({ stats }: { stats: LeaderboardStats }) {
  const { board, snapshot } = stats;
  const delta = playersDelta(stats);

  return <div className="leaderboards-summary">
    <dl className="leaderboards-plaques" aria-label="Пороги таблицы">
      <Plaque label="Игроков" value={formatPlayers(snapshot.players)}
        note={delta === null || delta === 0 ? undefined : `${delta > 0 ? '+' : ''}${formatPlayers(delta)} за день`} />
      {board.rated && <Plaque label="1-е место" value={formatRating(board.mode, stats.topRating)} />}
      {board.rated && stats.thresholds.filter(threshold => threshold.reached).map(threshold => <Plaque key={threshold.rank}
        label={`Топ-${formatPlayers(threshold.rank)}`} value={formatRating(board.mode, threshold.rating)} />)}
    </dl>
    {snapshot.truncated && <p className="leaderboards-muted">Сохранены первые {formatPlayers(snapshot.stored)} мест</p>}
  </div>;
}

/** Графики под таблицей: игроки и порог топа по дням, распределение рейтинга. */
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
  const columns = useMemo(() => (stats.histogram ?? []).map(bucket => ({
    label: formatRatingTick(bucket.from),
    value: bucket.players,
    detail: `${formatRating(board.mode, bucket.from)}–${formatRating(board.mode, bucket.to)}: ${formatPlayers(bucket.players)} игроков`,
  })), [stats.histogram, board.mode]);

  if (series.length < 2 && !columns.length) return null;
  return <section className="leaderboards-charts" aria-label="Графики таблицы">
      {players.length > 1 && <LineChart title="Игроков в таблице по дням" unit="count" color="#8d171d" points={players} xLabel="День" />}
      {board.rated && thresholds.length > 1 && <LineChart title={`Порог топ-${formatPlayers(thresholdRank)} по дням`}
        subtitle={unit} unit={ratingUnit} color="#8f536d" points={thresholds} xLabel="День" />}
      {board.rated && columns.length > 0 && <ColumnChart title="Распределение рейтинга"
        subtitle={`Сколько игроков в таблице в каждом диапазоне: ${unit.toLowerCase()}`} unit="count" color="#8f536d" rows={columns} xLabel={unit} />}
  </section>;
}
