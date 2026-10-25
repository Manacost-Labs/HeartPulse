import { formatLeaderboardDay, formatPlayers, formatRating, formatSeasonLabel } from './leaderboardsView';
import { LEADERBOARD_MODES, type LeaderboardMode, type LeaderboardPlayer, type LeaderboardPlayerSeason } from './types';

/** Режимы, где у игрока есть сохранённые сезоны, в порядке вкладок. */
export function playerModes(player: LeaderboardPlayer): LeaderboardMode[] {
  return LEADERBOARD_MODES.filter(mode => player.seasons.some(season => season.mode === mode));
}

/** Сезоны игрока в режиме, новые первыми. */
export function modeSeasons(player: LeaderboardPlayer, mode: LeaderboardMode): LeaderboardPlayerSeason[] {
  return player.seasons.filter(season => season.mode === mode).sort((left, right) => right.season - left.season);
}

/** Лучшее место за все сезоны режима; при равенстве — более новый сезон. */
export function bestSeason(seasons: LeaderboardPlayerSeason[]): LeaderboardPlayerSeason | null {
  return seasons.reduce<LeaderboardPlayerSeason | null>((best, season) => (!best || season.bestRank < best.bestRank ? season : best), null);
}

export type ProfileView = 'days' | 'seasons';

export type ProfilePoint = {
  key: string;
  /** Короткая подпись оси: «24.10» или «155». */
  tick: string;
  /** Полная подпись подсказки. */
  label: string;
  /** Значение графика: рейтинг у режимов с рейтингом, иначе место. */
  value: number;
  detail: string;
};

function pointDetail(mode: LeaderboardMode, rank: number, rating: number | null): string {
  return rating === null ? `${formatPlayers(rank)} место` : `${formatPlayers(rank)} место · ${formatRating(mode, rating)}`;
}

/**
 * Точки мини-графика. «Дни» — снимки выбранного сезона, «Сезоны» — итоговое
 * (или последнее) место каждого сезона режима, старые слева. У режимов с
 * рейтингом рисуется рейтинг, место остаётся в подсказке.
 */
export function profilePoints(view: ProfileView, seasons: LeaderboardPlayerSeason[], selected: LeaderboardPlayerSeason | null): ProfilePoint[] {
  if (view === 'days') {
    if (!selected) return [];
    const useRating = selected.rated && selected.series.every(point => point.rating !== null);
    return selected.series.map(point => ({
      key: point.day,
      tick: `${Number(point.day.slice(8, 10))}.${point.day.slice(5, 7)}`,
      label: formatLeaderboardDay(point.day),
      value: useRating ? point.rating ?? 0 : point.rank,
      detail: pointDetail(selected.mode, point.rank, point.rating),
    }));
  }
  const ordered = [...seasons].sort((left, right) => left.season - right.season);
  const useRating = ordered.every(season => season.rated && season.lastRating !== null);
  return ordered.map(season => ({
    key: String(season.season),
    tick: String(season.season),
    label: formatSeasonLabel({ id: season.season, start: season.seasonStart }),
    value: useRating ? season.lastRating ?? 0 : season.lastRank,
    detail: `${season.final ? 'итог' : 'последнее'}: ${pointDetail(season.mode, season.lastRank, season.lastRating)}`,
  }));
}

/** Какие виды графика есть: нужно хотя бы две точки. */
export function profileViews(seasons: LeaderboardPlayerSeason[], selected: LeaderboardPlayerSeason | null): ProfileView[] {
  const views: ProfileView[] = [];
  if (selected && selected.series.length > 1) views.push('days');
  if (seasons.length > 1) views.push('seasons');
  return views;
}

/** Рисуется ли рейтинг: тогда выше — лучше; место рисуется перевёрнутым, первое место сверху. */
export function profileUsesRating(view: ProfileView, seasons: LeaderboardPlayerSeason[], selected: LeaderboardPlayerSeason | null): boolean {
  if (view === 'days') return Boolean(selected?.rated && selected.series.every(point => point.rating !== null));
  return seasons.length > 0 && seasons.every(season => season.rated && season.lastRating !== null);
}

export type PlotPoint = { x: number; y: number };

/**
 * Координаты точек в поле `width × height` с отступом `pad`. Места идут по
 * логарифмической шкале: разница между 1 и 10 местом видна так же, как между
 * 1000 и 10 000. Одна шкала без нуля: график показывает форму, а числа — подписи.
 */
export function plotPoints(values: number[], { width, height, pad, rank }: { width: number; height: number; pad: number; rank: boolean }): PlotPoint[] {
  if (!values.length) return [];
  const scaled = values.map(value => (rank ? -Math.log10(Math.max(1, value)) : value));
  const low = Math.min(...scaled);
  const high = Math.max(...scaled);
  const span = high - low || 1;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  return scaled.map((value, index) => ({
    x: values.length > 1 ? pad + index * step : width / 2,
    y: high === low ? height / 2 : pad + (1 - (value - low) / span) * (height - pad * 2),
  }));
}
