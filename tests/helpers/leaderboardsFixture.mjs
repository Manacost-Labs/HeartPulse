// Ответы hs-data-api /v1/leaderboards* в его формате ({ data, meta }) для
// браузерных тестов: Стандарт Европы (два дня, без рейтинга) и Поля сражений
// Европы (рейтинг), сезоны и история одного игрока. Остальное — 404, как у
// несобранной таблицы.

const DAYS = ['2026-10-24', '2026-10-25'];
const CAPTURED = '2026-10-25T16:10:02+00:00';
const BOARDS = {
  standard: { season: 156, start: '2026-10-01', rated: false, players: 16625, rows: 130 },
  battlegrounds: { season: 19, start: null, rated: true, players: 6543, rows: 130 },
};

function rows(mode) {
  const board = BOARDS[mode];
  return Array.from({ length: board.rows }, (_, index) => ({
    rank: index + 1,
    name: index === 0 ? (mode === 'standard' ? 'TrueBench' : 'XQN') : `${mode === 'standard' ? 'Legend' : 'Bob'}${index + 1}`,
    rating: board.rated ? 20104 - index * 37 : null,
    // Вчера первые два поменялись местами, третьего не было.
    previous_rank: index === 0 ? 2 : index === 1 ? 1 : index === 2 ? null : index + 1,
  }));
}

function board(mode) {
  const value = BOARDS[mode];
  return { region: 'EU', mode, season_id: value.season, season_start: value.start, is_latest: true, final: false, rated: value.rated };
}

function snapshot(mode) {
  const value = BOARDS[mode];
  return { day: DAYS[1], captured_at: CAPTURED, total_size: value.players, stored_rows: value.rows, truncated: false, final: false, stale: false };
}

function seasons() {
  return {
    regions: ['EU', 'US', 'AP'],
    modes: Object.entries(BOARDS).map(([mode, value]) => ({
      mode, rated: value.rated,
      regions: { EU: { latest_season: value.season, seasons: [
        { season_id: value.season, season_start: value.start, is_latest: true, final: false, has_data: true, day: DAYS[1], total_size: value.players, truncated: false },
        { season_id: value.season - 1, season_start: null, is_latest: false, final: false, has_data: false, day: null, total_size: null, truncated: false },
      ] } },
    })),
  };
}

function table(url) {
  const mode = url.searchParams.get('mode') ?? 'standard';
  if (!BOARDS[mode] || url.searchParams.get('region') !== 'EU') return null;
  const query = url.searchParams.get('q');
  const limit = Number(url.searchParams.get('limit') ?? 25);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const matched = rows(mode).filter(row => !query || row.name.toLowerCase().includes(query.toLowerCase()));
  return { board: board(mode), snapshot: snapshot(mode), days: DAYS, query, total: matched.length, rows: matched.slice(offset, offset + limit) };
}

function stats(url) {
  const mode = url.searchParams.get('mode') ?? 'standard';
  if (!BOARDS[mode] || url.searchParams.get('region') !== 'EU') return null;
  const rated = BOARDS[mode].rated;
  return {
    board: board(mode), snapshot: snapshot(mode), top_rating: rated ? 20104 : null,
    thresholds: [100, 1000, 5000].map(rank => ({ rank, reached: BOARDS[mode].players >= rank, rating: rated ? 20104 - rank * 2 : null })),
    rating: rated ? { rated_players: 6543, min: 8000, max: 20104, mean: 9480.2, median: 9010 } : null,
    histogram: rated ? Array.from({ length: 8 }, (_, index) => ({ from: 8000 + index * 500, to: 8500 + index * 500, players: 1800 - index * 200 })) : null,
    histogram_bucket: rated ? 500 : null,
    series: DAYS.map((day, index) => ({
      day, captured_at: CAPTURED, total_size: BOARDS[mode].players - (1 - index) * 120, stored_rows: BOARDS[mode].rows, truncated: false, final: false,
      rating_at_1: rated ? 20050 + index * 54 : null, rating_at_100: rated ? 12990 + index * 20 : null,
      rating_at_1000: rated ? 10100 + index * 20 : null, rating_at_5000: rated ? 8300 + index * 20 : null,
    })),
  };
}

function player(url) {
  if (url.searchParams.get('region') !== 'EU' || url.searchParams.get('name')?.toLowerCase() !== 'xqn') return null;
  return {
    player: { region: 'EU', name: 'XQN' }, shared_name: false,
    seasons: [
      {
        mode: 'battlegrounds', season_id: 19, season_start: null, is_latest: true, final: false, rated: true,
        best_rank: 1, best_day: DAYS[1], last_rank: 1, last_rating: 20104, last_day: DAYS[1], in_latest_snapshot: true, days: 2,
        series: [
          { day: DAYS[0], rank: 2, rating: 20050, total_size: 6423, final: false },
          { day: DAYS[1], rank: 1, rating: 20104, total_size: 6543, final: false },
        ],
      },
      {
        mode: 'battlegrounds', season_id: 18, season_start: null, is_latest: false, final: true, rated: true,
        best_rank: 3, best_day: DAYS[0], last_rank: 4, last_rating: 18800, last_day: DAYS[0], in_latest_snapshot: true, days: 1,
        series: [{ day: DAYS[0], rank: 4, rating: 18800, total_size: 7100, final: true }],
      },
    ],
  };
}

/** Тело ответа hs-data-api для пути `/v1/leaderboards*` или `null` (ответ 404). */
export function leaderboardsFixture(url) {
  const data = url.pathname === '/v1/leaderboards' ? table(url)
    : url.pathname === '/v1/leaderboards/stats' ? stats(url)
      : url.pathname === '/v1/leaderboards/player' ? player(url)
        : url.pathname === '/v1/leaderboards/seasons' ? seasons()
          : null;
  return data ? { data, meta: { source_id: 'blizzard_leaderboards', stale: false, count: 0 } } : null;
}
