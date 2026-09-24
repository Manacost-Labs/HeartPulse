import type { Article, ArticlesData } from '../../../src/modules/articles/public';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid articles response');
  return value as Record<string, unknown>;
}

function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Keeps the serialized page payload separate from Express-only and viewer fields. */
export function articlesData(value: unknown, includeViewerVote = false): ArticlesData {
  const root = record(value);
  if (!Array.isArray(root.articles)) throw new Error('Invalid articles response');
  const articles: Article[] = root.articles.map(value => {
    const item = record(value);
    const id = text(item.id);
    const title = text(item.title);
    if (!id || !title) throw new Error('Invalid article');
    return {
      id, title, date: text(item.date), image: text(item.image),
      excerpt: text(item.excerpt), tag: text(item.tag), mode: text(item.mode),
      url: text(item.url) || '#', likes: count(item.likes), dislikes: count(item.dislikes),
      userVote: includeViewerVote && (item.userVote === 'like' || item.userVote === 'dislike') ? item.userVote : null,
    };
  });
  return { articles, updatedAt: typeof root.updatedAt === 'string' ? root.updatedAt : null };
}
