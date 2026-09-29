import 'server-only';
import { articlesData } from './articlesData';
import { fetchPublicExpress } from './expressApi';

/** Fetches the anonymous Express projection so SSR never serializes viewer state. */
export async function loadPublicArticles() {
  const response = await fetchPublicExpress('/api/articles');
  if (response.status === 404) return { articles: [], updatedAt: null };
  if (!response.ok) throw new Error('Public articles temporarily unavailable');
  return articlesData(await response.json());
}
