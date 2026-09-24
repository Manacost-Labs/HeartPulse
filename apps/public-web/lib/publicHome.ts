import 'server-only';
import type { HomeArticle, HomeSummaryData } from '../../../src/modules/home/public';
import { homeSummaryData } from './homeSummaryData';
import { loadPublicArticles } from './publicArticles';

async function loadPublicHomeSummary(): Promise<HomeSummaryData> {
  const origin = new URL(process.env.LEGACY_WEB_ORIGIN ?? 'http://127.0.0.1:3001');
  if (!['http:', 'https:'].includes(origin.protocol)
    || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('Invalid legacy origin');
  }
  const response = await fetch(new URL('/api/home/summary', origin), {
    cache: 'no-store', credentials: 'omit', redirect: 'error',
    signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' },
  });
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
