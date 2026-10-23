import 'server-only';
import { articlesData } from './articlesData';
import { fetchPublicExpress } from './expressApi';
import { PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';

const NO_ARTICLES = { articles: [], updatedAt: null };

/**
 * The anonymous Express projection for the prerendered `/articles/`, so the
 * HTML never serializes viewer state. It never throws: a regeneration right
 * after `revalidatePath` renders in the request, and a throw there would be a
 * 500. Without data (the build without an API, Express down) the page ships an
 * empty seed and the browser loads the list itself (ArticlesPageClient).
 */
export async function loadPublicArticles() {
  try {
    const response = await fetchPublicExpress('/api/articles', undefined, { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS });
    if (!response.ok) return NO_ARTICLES;
    return articlesData(await response.json());
  } catch {
    return NO_ARTICLES;
  }
}
