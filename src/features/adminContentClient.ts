/** Browser client for the admin content sections (articles and gallery). Contract: docs/specs/admin-crm.md. */
import type { Article, ArticleDraft, GalleryDraft, GalleryItem } from './adminContentListModel';

const JSON_HEADERS: HeadersInit = { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' };

// The single same-origin transport for admin content (CSRF header, no caching, readable errors).
async function request<T>(path: string, fallbackError: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init, headers: JSON_HEADERS });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(failure.error || fallbackError);
  }
  return await response.json() as T;
}

const body = (value: unknown) => JSON.stringify(value);

export const adminContentClient = {
  async articles(): Promise<Article[]> {
    const data = await request<{ articles?: Article[] }>(`/api/articles?t=${Date.now()}`, 'Не удалось загрузить статьи');
    return Array.isArray(data.articles) ? data.articles : [];
  },
  /** Creates the article, or updates it when `id` is given. */
  saveArticle(draft: ArticleDraft, id = ''): Promise<{ article: Article }> {
    return request('/api/admin-articles', 'Не удалось сохранить статью', { method: id ? 'PATCH' : 'POST', body: body({ id, article: draft }) });
  },
  deleteArticle(id: string): Promise<unknown> {
    return request('/api/admin-articles', 'Не удалось удалить статью', { method: 'DELETE', body: body({ id }) });
  },
  async gallery(): Promise<GalleryItem[]> {
    const data = await request<{ items?: GalleryItem[] }>(`/api/admin/gallery?t=${Date.now()}`, 'Не удалось загрузить галерею');
    return Array.isArray(data.items) ? data.items : [];
  },
  /** The original is sent as a data URL; the server stores it and builds the previews. */
  uploadGalleryItem(draft: GalleryDraft, dataUrl: string): Promise<{ item: GalleryItem }> {
    return request('/api/admin/gallery', 'Не удалось загрузить арт', { method: 'POST', body: body({ ...draft, dataUrl }) });
  },
  deleteGalleryItem(id: string): Promise<unknown> {
    return request(`/api/admin/gallery/${encodeURIComponent(id)}`, 'Не удалось удалить арт', { method: 'DELETE' });
  },
};

export type AdminContentClient = typeof adminContentClient;
