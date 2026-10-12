import 'server-only';
import type { HomeArticle, HomeSummaryData } from '@/src/modules/home/public';
import { homeSummaryData } from './homeSummaryData';
import { articlesData } from './articlesData';
import { fetchPublicExpress } from './expressApi';
import { FIRST_PAINT_READ_BUDGET_MS, readFirstPaintJson } from './publicFirstPaintRead';

/** Both feeds share one first-paint budget; null requests a browser fallback, unlike an empty feed. */
export async function loadPublicHome(): Promise<{ summary: HomeSummaryData | null; articles: HomeArticle[] | null }> {
  const deadline = Date.now() + FIRST_PAINT_READ_BUDGET_MS;
  const read = (path: string) => readFirstPaintJson(signal => fetchPublicExpress(path, signal), deadline);
  const [summary, articles] = await Promise.all([
    read('/api/home/summary').then(raw => raw === null ? null : homeSummaryData(raw)).catch(() => null),
    read('/api/articles').then(raw => raw === null ? null : articlesData(raw).articles).catch(() => null),
  ]);
  return { summary, articles };
}
