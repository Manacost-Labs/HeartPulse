import 'server-only';
import {
  isLeaderboardSeasonCatalog, isLeaderboardStats, isLeaderboardTable,
  type LeaderboardsInitial, type LeaderboardSelection,
} from '@/src/modules/leaderboards/public';
import { readPublicJsonOrNull } from './firstPaintStore';
import { leaderboardPaths } from './publicDataPaths';

/**
 * Первый кадр таблиц лидеров: каталог сезонов, страница таблицы и сводка
 * выбранной таблицы, прочитанные анонимно и параллельно. Если Express не
 * успел, берётся последняя удачная копия (`firstPaintStore.ts`); `null` — копии
 * нет вовсе, и страницу до этого не допускает `proxy.ts` (503).
 */
export async function loadPublicLeaderboards(selection: LeaderboardSelection): Promise<LeaderboardsInitial> {
  const paths = leaderboardPaths(selection);
  const [catalog, table, stats] = await Promise.all([
    readPublicJsonOrNull(paths.catalog), readPublicJsonOrNull(paths.table), readPublicJsonOrNull(paths.stats),
  ]);
  return {
    selection,
    catalog: isLeaderboardSeasonCatalog(catalog) ? catalog : null,
    table: isLeaderboardTable(table) ? table : null,
    stats: isLeaderboardStats(stats) ? stats : null,
  };
}
