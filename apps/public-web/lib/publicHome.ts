import 'server-only';
import type { HomeArticle, HomeSummaryData } from '@/src/modules/home/public';
import { homeSummaryData } from './homeSummaryData';
import { loadPublicArticles } from './publicArticles';
import { fetchPublicExpress } from './expressApi';

async function loadPublicHomeSummary(): Promise<HomeSummaryData> {
  const response = await fetchPublicExpress('/api/home/summary');
  if (!response.ok) throw new Error('Public home summary temporarily unavailable');
  return homeSummaryData(await response.json());
}

/** Keep the homepage usable when either independent public feed is unavailable. */
export async function loadPublicHome(): Promise<{ summary: HomeSummaryData | null; articles: HomeArticle[] }> {
  const [summary, articles] = await Promise.allSettled([loadPublicHomeSummary(), loadPublicArticles()]);
  return {
    summary: summary.status === 'fulfilled' ? summary.value : null,
    articles: articles.status === 'fulfilled' ? articles.value.articles : [],
  };
}
