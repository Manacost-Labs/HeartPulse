import { formatPlayers, formatRating, formatRatingTick, playersDelta } from './leaderboardsView';
import type { LeaderboardStats } from './types';

/** «1 игрок», «3 игрока», «25 игроков». */
export function playersLabel(value: number): string {
  const last = value % 10;
  const tens = value % 100;
  const word = last === 1 && tens !== 11 ? 'игрок'
    : last >= 2 && last <= 4 && (tens < 12 || tens > 14) ? 'игрока' : 'игроков';
  return `${formatPlayers(value)} ${word}`;
}

export type SummaryThreshold = { rank: number; label: string; rating: string | null };

export type LeaderboardSummaryLine = {
  players: string;
  /** «+143 за день»; `null` — снимок один или число не изменилось. */
  delta: string | null;
  /** Топ-100/1000/5000, до которых таблица дотянулась; рейтинг — у режимов с рейтингом. */
  thresholds: SummaryThreshold[];
};

/**
 * Сводка над таблицей одной строкой: игроки и пороги топа (они же — переходы
 * к месту). Рейтинг первого места не повторяется: он в первой строке таблицы.
 */
export function summaryLine(stats: LeaderboardStats): LeaderboardSummaryLine {
  const { board, snapshot } = stats;
  const delta = playersDelta(stats);
  return {
    players: playersLabel(snapshot.players),
    delta: delta === null || delta === 0 ? null : `${delta > 0 ? '+' : '−'}${formatPlayers(Math.abs(delta))} за день`,
    // Сохранено меньше мест, чем порог (обрезанная таблица), — к такому месту не перейти.
    thresholds: stats.thresholds.filter(item => item.reached && item.rank <= snapshot.stored).map(item => ({
      rank: item.rank,
      label: `топ-${formatPlayers(item.rank)}`,
      rating: board.rated && item.rating !== null ? formatRating(board.mode, item.rating) : null,
    })),
  };
}

export type HistogramBar = { from: number; to: number; players: number; height: number; label: string };

/**
 * Столбики компактной гистограммы рейтинга: высота — доля от самого полного
 * диапазона (0–1), подпись — диапазон и число игроков для подсказки.
 */
export function histogramBars(stats: LeaderboardStats): HistogramBar[] {
  const buckets = stats.board.rated ? stats.histogram ?? [] : [];
  const peak = Math.max(0, ...buckets.map(bucket => bucket.players));
  if (buckets.length < 2 || peak === 0) return [];
  return buckets.map(bucket => ({
    ...bucket,
    height: bucket.players / peak,
    label: `${formatRating(stats.board.mode, bucket.from)}–${formatRating(stats.board.mode, bucket.to)}: ${playersLabel(bucket.players)}`,
  }));
}

/** Подписи оси гистограммы: начало, середина и конец шкалы. */
export function histogramTicks(bars: HistogramBar[]): string[] {
  if (!bars.length) return [];
  const from = bars[0].from;
  const to = bars[bars.length - 1].to;
  return [from, (from + to) / 2, to].map(formatRatingTick);
}
