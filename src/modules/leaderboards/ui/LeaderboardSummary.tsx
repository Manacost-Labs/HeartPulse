import { useMemo } from 'react';
import { ColumnChart } from '../../../shared/ui/analytics/ColumnChart';
import { LineChart } from '../../../shared/ui/analytics/LineChart';
import type { ChartPoint } from '../../../shared/ui/analytics/analyticsModel';
import {
  LEADERBOARD_MODE_LABELS, LEADERBOARD_RATING_LABELS, formatLeaderboardDay, formatLeaderboardTime, formatPlayers, formatRating,
  formatRatingTick, playersDelta,
} from '../model/leaderboardsView';
import type { LeaderboardStats } from '../model/types';
import '../../../shared/ui/analytics/Analytics.css';

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="leaderboards-tile">
    <dt className="leaderboards-label">{label}</dt>
    <dd><span className="leaderboards-tile__value">{value}</span>{note && <span className="leaderboards-tile__note">{note}</span>}</dd>
  </div>;
}

function dayTick(day: string): string {
  return `${Number(day.slice(8, 10))}.${day.slice(5, 7)}`;
}

/**
 * Сводка выбранной таблицы над ней: сколько в ней игроков, рейтинг первого
 * места и пороги топ-100/1000/5000 (только у режимов с рейтингом).
 */
export function LeaderboardSummary({ stats }: { stats: LeaderboardStats }) {
  const { board, snapshot, series } = stats;
  const delta = playersDelta(stats);
  const unit = LEADERBOARD_RATING_LABELS[board.mode] ?? 'Рейтинг';

  return <section className="leaderboards-summary" aria-labelledby="leaderboards-summary-title">
    <div className="leaderboards-summary__head">
      <h2 id="leaderboards-summary-title">Пороги и статистика</h2>
      <p className="leaderboards-muted">
        Снимок {formatLeaderboardTime(snapshot.capturedAt)}
        {snapshot.stale && ' · данные давно не обновлялись'}
        {board.final && ' · сезон завершён'}
      </p>
    </div>
    <dl className="leaderboards-tiles">
      <Tile label="Игроков в таблице" value={formatPlayers(snapshot.players)}
        note={delta === null ? undefined : `${delta >= 0 ? '+' : ''}${formatPlayers(delta)} за день`} />
      {board.rated && <Tile label={`${unit}: 1-е место`} value={formatRating(board.mode, stats.topRating)} />}
      {board.rated && stats.thresholds.map(threshold => <Tile key={threshold.rank} label={`Порог топ-${formatPlayers(threshold.rank)}`}
        value={threshold.reached ? formatRating(board.mode, threshold.rating) : '—'}
        note={threshold.reached ? undefined : 'в таблице меньше игроков'} />)}
      {!board.rated && <Tile label="Дней в истории сезона" value={formatPlayers(series.length)} />}
    </dl>
    {!board.rated && <p className="leaderboards-muted leaderboards-summary__note">
      В режиме «{LEADERBOARD_MODE_LABELS[board.mode]}» Blizzard показывает только места в Легенде, без рейтинга.
    </p>}
    {snapshot.truncated && <p className="leaderboards-muted leaderboards-summary__note">
      Таблица очень большая: сохранены первые {formatPlayers(snapshot.stored)} мест из {formatPlayers(snapshot.players)}.
    </p>}
  </section>;
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
  return <section className="leaderboards-summary" aria-label="Графики таблицы">
    <div className="leaderboards-charts">
      {players.length > 1 && <LineChart title="Игроков в таблице по дням" unit="count" color="#8d171d" points={players} xLabel="День" />}
      {board.rated && thresholds.length > 1 && <LineChart title={`Порог топ-${formatPlayers(thresholdRank)} по дням`}
        subtitle={unit} unit={ratingUnit} color="#8f536d" points={thresholds} xLabel="День" />}
      {board.rated && columns.length > 0 && <ColumnChart title="Распределение рейтинга"
        subtitle={`Сколько игроков в таблице в каждом диапазоне: ${unit.toLowerCase()}`} unit="count" color="#8f536d" rows={columns} xLabel={unit} />}
    </div>
  </section>;
}
