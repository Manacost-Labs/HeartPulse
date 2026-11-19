import 'server-only';
import type { HomeArticle, HomeSummaryData } from '@/src/modules/home/public';
import { homeSummaryData } from './homeSummaryData';
import { articlesData } from './articlesData';
import { readPublicJsonOrNull } from './firstPaintStore';
import { HOME_PATHS } from './publicDataPaths';
import { homeArticlesCheck, homeSummaryCheck } from './publicPayloadChecks';

/** Both feeds come from the last good store; null requests a browser fallback, unlike an empty feed. */
export async function loadPublicHome(): Promise<{ summary: HomeSummaryData | null; articles: HomeArticle[] | null }> {
  const [summary, articles] = await Promise.all([
    readPublicJsonOrNull(HOME_PATHS.summary, false, homeSummaryCheck).then(raw => raw === null ? null : homeSummaryData(raw)).catch(() => null),
    readPublicJsonOrNull(HOME_PATHS.articles, false, homeArticlesCheck).then(raw => raw === null ? null : articlesData(raw).articles).catch(() => null),
  ]);
  return { summary, articles };
}
