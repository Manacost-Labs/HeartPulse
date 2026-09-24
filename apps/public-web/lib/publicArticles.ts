import 'server-only';
import { articlesData } from './articlesData';

/** Fetches the anonymous Express projection so SSR never serializes viewer state. */
export async function loadPublicArticles() {
  const origin = new URL(process.env.LEGACY_WEB_ORIGIN ?? 'http://127.0.0.1:3001');
  if (!['http:', 'https:'].includes(origin.protocol)
    || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('Invalid legacy origin');
  }
  const response = await fetch(new URL('/api/articles', origin), {
    cache: 'no-store', credentials: 'omit', redirect: 'error',
    signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return { articles: [], updatedAt: null };
  if (!response.ok) throw new Error('Public articles temporarily unavailable');
  return articlesData(await response.json());
}
