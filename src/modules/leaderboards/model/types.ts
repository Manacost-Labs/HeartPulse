/**
 * Типы страницы «Таблицы лидеров». Повторяют server/modules/leaderboards/types.ts:
 * клиент не импортирует сервер, а тест присваивает типы в обе стороны.
 */

export const LEADERBOARD_MODES = ['standard', 'wild', 'battlegrounds', 'battlegroundsduo', 'arena', 'undergroundarena', 'twist'] as const;
export const LEADERBOARD_REGIONS = ['EU', 'US', 'AP'] as const;

export type LeaderboardMode = typeof LEADERBOARD_MODES[number];
export type LeaderboardRegion = typeof LEADERBOARD_REGIONS[number];

export type LeaderboardSeason = {
  id: number;
  /** Дата начала сезона (YYYY-MM-DD); Blizzard знает её только у ежемесячных сезонов. */
  start: string | null;
  latest: boolean;
  /** Сезон закончился и прочитан в последний раз. */
  final: boolean;
  players: number | null;
};

export type LeaderboardSeasonCatalog = {
  modes: Array<{
    mode: LeaderboardMode;
    rated: boolean;
    /** Только сезоны, у которых уже есть сохранённая таблица, новые первыми. */
    regions: Record<LeaderboardRegion, LeaderboardSeason[]>;
  }>;
};

export type LeaderboardBoard = {
  mode: LeaderboardMode;
  region: LeaderboardRegion;
  season: number;
  seasonStart: string | null;
  latest: boolean;
  final: boolean;
  rated: boolean;
};

export type LeaderboardSnapshot = {
  day: string;
  capturedAt: string;
  /** Игроков в таблице Blizzard. */
  players: number;
  /** Сохранено строк; меньше `players`, когда таблица обрезана (`truncated`). */
  stored: number;
  truncated: boolean;
  stale: boolean;
};

export type LeaderboardRow = {
  rank: number;
  name: string;
  rating: number | null;
  /** Место в предыдущем снимке; `null` — игрока там не было или снимка нет. */
  previousRank: number | null;
};

export type LeaderboardTable = {
  board: LeaderboardBoard;
  snapshot: LeaderboardSnapshot;
  query: string | null;
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  /** Есть снимок за прошлый день: колонка «За сутки» имеет смысл. */
  hasPrevious: boolean;
  rows: LeaderboardRow[];
};

export type LeaderboardThreshold = { rank: number; reached: boolean; rating: number | null };

export type LeaderboardStats = {
  board: LeaderboardBoard;
  snapshot: LeaderboardSnapshot;
  topRating: number | null;
  thresholds: LeaderboardThreshold[];
  rating: { min: number; max: number; mean: number; median: number | null } | null;
  histogram: Array<{ from: number; to: number; players: number }> | null;
  series: Array<{ day: string; players: number; top: number | null; at100: number | null; at1000: number | null; at5000: number | null }>;
};

export type LeaderboardPlayerSeason = {
  mode: LeaderboardMode;
  season: number;
  seasonStart: string | null;
  latest: boolean;
  final: boolean;
  rated: boolean;
  bestRank: number;
  bestDay: string;
  lastRank: number;
  lastRating: number | null;
  lastDay: string;
  /** Игрок есть в последнем снимке таблицы, а не только в прошлых днях. */
  inLatest: boolean;
  series: Array<{ day: string; rank: number; rating: number | null; players: number; final: boolean }>;
};

export type LeaderboardPlayer = {
  region: LeaderboardRegion;
  name: string;
  /** Под этим ником в одной таблице несколько аккаунтов: Blizzard не показывает номер BattleTag. */
  sharedName: boolean;
  seasons: LeaderboardPlayerSeason[];
};

export type LeaderboardPlayerHit = {
  region: LeaderboardRegion;
  name: string;
  current: Array<{ mode: LeaderboardMode; season: number; rank: number; rating: number | null }>;
};
