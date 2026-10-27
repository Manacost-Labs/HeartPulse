// Таблицы лидеров для сквозного сценария выбора региона и сезона: поверх
// общей фикстуры (Европа, текущий сезон) Стандарт есть ещё в Америке, а у
// Европы собран прошлый, 155-й сезон. Первое место в них занимает свой игрок,
// по которому видно, какая таблица открыта.
import { leaderboardsFixture } from './leaderboardsFixture.mjs';

export const AMERICA_LEADER = 'Americano';
export const PAST_SEASON_LEADER = 'LastSeasonKing';

function europe(url) {
  const copy = new URL(url);
  copy.searchParams.set('region', 'EU');
  copy.searchParams.delete('season');
  return leaderboardsFixture(copy);
}

/** Тот же ответ Европы, но с другой доской и другим первым местом. */
function retitled(url, board, leader) {
  const body = europe(url);
  if (!body) return null;
  const data = { ...body.data, board: { ...body.data.board, ...board } };
  if (data.rows?.[0]?.rank === 1) data.rows = [{ ...data.rows[0], name: leader }, ...data.rows.slice(1)];
  return { ...body, data };
}

function board(url) {
  const mode = url.searchParams.get('mode') ?? 'standard';
  const region = url.searchParams.get('region');
  if (mode === 'standard' && region === 'US') return retitled(url, { region: 'US' }, AMERICA_LEADER);
  if (mode === 'standard' && url.searchParams.get('season') === '155') {
    return retitled(url, { season_id: 155, season_start: '2026-09-01', is_latest: false, final: true }, PAST_SEASON_LEADER);
  }
  return leaderboardsFixture(url);
}

function seasons(url) {
  const body = leaderboardsFixture(url);
  const modes = body.data.modes.map(entry => {
    if (entry.mode !== 'standard') return entry;
    const eu = entry.regions.EU;
    const seasonsWithPast = eu.seasons.map(season => season.season_id === 155
      ? { ...season, season_start: '2026-09-01', final: true, has_data: true, day: '2026-09-30', total_size: 16000 }
      : season);
    return { ...entry, regions: { EU: { ...eu, seasons: seasonsWithPast }, US: eu } };
  });
  return { ...body, data: { ...body.data, modes } };
}

/** `externalRoutes` для `startPublicCardPilot`. */
export const leaderboardsExternalRoutes = Object.freeze({
  '/v1/leaderboards': board,
  '/v1/leaderboards/stats': board,
  '/v1/leaderboards/seasons': seasons,
});
