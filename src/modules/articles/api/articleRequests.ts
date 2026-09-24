import type { Article } from '../model/types';

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function requestArticleAccessLink(article: Article): Promise<string> {
  const response = await fetch('/api/articles/access-link', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: article.url, title: article.title }),
  });
  const data = object(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Не удалось открыть статью');
  return typeof data.url === 'string' && data.url ? data.url : article.url;
}

export async function submitArticleVote(articleId: string, vote: 'like' | 'dislike'): Promise<Pick<Article, 'likes' | 'dislikes' | 'userVote'>> {
  const response = await fetch(`/api/articles/${encodeURIComponent(articleId)}/vote`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vote }),
  });
  const data = object(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Не удалось сохранить голос');
  return {
    likes: Number(data.likes || 0), dislikes: Number(data.dislikes || 0),
    userVote: data.userVote === 'like' || data.userVote === 'dislike' ? data.userVote : null,
  };
}
