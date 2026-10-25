import 'server-only';
import {
  isLeaderboardSeasonCatalog, isLeaderboardStats, isLeaderboardTable, leaderboardApiQuery,
  type LeaderboardsInitial, type LeaderboardSelection,
} from '@/src/modules/leaderboards/public';
import { fetchPublicExpress } from './expressApi';
import { FIRST_PAINT_READ_BUDGET_MS, readFirstPaintJson } from './publicFirstPaintRead';

/**
 * Первый кадр таблиц лидеров: каталог сезонов, страница таблицы и сводка
 * выбранной таблицы, прочитанные анонимно и параллельно за общий бюджет
 * первого кадра. Что не успело — `null`, это загрузит браузер.
 */
export async function loadPublicLeaderboards(selection: LeaderboardSelection): Promise<LeaderboardsInitial> {
  const deadline = Date.now() + FIRST_PAINT_READ_BUDGET_MS;
  const read = (path: string) => readFirstPaintJson(signal => fetchPublicExpress(path, signal), deadline);
  const [catalog, table, stats] = await Promise.all([
    read('/api/leaderboards/seasons'),
    read(`/api/leaderboards/table?${leaderboardApiQuery(selection, true)}`),
    read(`/api/leaderboards/stats?${leaderboardApiQuery(selection, false)}`),
  ]);
  return {
    selection,
    catalog: isLeaderboardSeasonCatalog(catalog) ? catalog : null,
    table: isLeaderboardTable(table) ? table : null,
    stats: isLeaderboardStats(stats) ? stats : null,
  };
}
