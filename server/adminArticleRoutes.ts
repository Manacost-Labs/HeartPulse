import { randomBytes } from 'node:crypto';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import { writeJsonAtomically } from './durableJson.js';

export type AdminArticleMode = 'arena' | 'battlegrounds' | 'general';
export type AdminArticleRecord = {
  id: string;
  title: string;
  date: string;
  image: string;
  excerpt: string;
  tag: string;
  mode: AdminArticleMode;
  url: string;
  [key: string]: unknown;
};
type NormalizedAdminArticle = Pick<
  AdminArticleRecord,
  'title' | 'date' | 'image' | 'excerpt' | 'tag' | 'mode' | 'url'
>;
export type AdminArticlesDocument = {
  articles: AdminArticleRecord[];
  updatedAt: string | null;
  [key: string]: unknown;
};

export type AdminArticleRouterDependencies = {
  adminGuard: RequestHandler;
  adminAuth: (request: Request) => unknown | null;
  loadArticles: () => unknown;
  saveArticles: (document: AdminArticlesDocument) => void;
  invalidateArticles: () => void;
  deleteArticleVotes: (articleId: string) => void;
  normalizeMode: (value: unknown, article: Record<string, unknown>) => AdminArticleMode;
  setPrivateNoStore: (response: Response) => void;
  now?: () => Date;
  createId?: () => string;
  onVoteCleanupError?: (error: unknown, articleId: string) => void;
};

class AdminArticleValidationError extends Error {}

const normalizeText = (value: unknown, maxLength: number) => String(value ?? '').trim().slice(0, maxLength);

function normalizeDate(value: unknown): string {
  const raw = normalizeText(value, 40);
  if (!raw) return '';
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (direct) {
    const [, year, month, day] = direct;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (date.toISOString().slice(0, 10) === raw) return raw;
    return '';
  }
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '';
}

function normalizeSafeUrl(value: unknown, fallback: string): string {
  const raw = normalizeText(value, 2_000);
  if (!raw) return fallback;
  if (raw === '#') return raw;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch { /* invalid URL */ }
  throw new AdminArticleValidationError('Ссылка должна использовать http, https или относительный путь');
}

function normalizeArticle(
  value: unknown,
  normalizeMode: AdminArticleRouterDependencies['normalizeMode'],
  fallbackDate: string,
): NormalizedAdminArticle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AdminArticleValidationError('article must be an object');
  }
  const article = value as Record<string, unknown>;
  const title = normalizeText(article.title, 180);
  if (!title) throw new AdminArticleValidationError('Заголовок обязателен');
  return {
    title,
    date: normalizeDate(article.date) || fallbackDate,
    image: normalizeSafeUrl(article.image, ''),
    excerpt: normalizeText(article.excerpt, 4_000),
    tag: normalizeText(article.tag, 120),
    mode: normalizeMode(article.mode, article),
    url: normalizeSafeUrl(article.url, '#'),
  };
}

function articleDateMs(article: AdminArticleRecord): number {
  const parsed = Date.parse(article.date);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDocument(value: unknown): AdminArticlesDocument {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const articles = Array.isArray(source.articles)
    ? source.articles.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as AdminArticleRecord[]
    : [];
  return { ...source, articles, updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null };
}

function sortArticles(articles: AdminArticleRecord[]): AdminArticleRecord[] {
  return articles.sort((left, right) => (
    articleDateMs(right) - articleDateMs(left)
    || String(right.id ?? '').localeCompare(String(left.id ?? ''))
  ));
}

export function writeArticlesFile(dataDirectory: string, document: AdminArticlesDocument): string {
  return writeJsonAtomically(dataDirectory, 'articles.json', document);
}

export function createAdminArticleRouter(dependencies: AdminArticleRouterDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? (() => new Date());
  const createId = dependencies.createId ?? (() => `${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`);

  const authorize = (request: Request, response: Response) => {
    dependencies.setPrivateNoStore(response);
    return dependencies.adminAuth(request);
  };

  router.post('/admin-articles', dependencies.adminGuard, (request, response) => {
    if (!authorize(request, response)) return response.status(401).json({ error: 'Требуется вход' });
    const timestamp = now();
    let article: NormalizedAdminArticle;
    try {
      article = normalizeArticle(request.body?.article, dependencies.normalizeMode, timestamp.toISOString().slice(0, 10));
    } catch (error) {
      if (error instanceof AdminArticleValidationError) return response.status(400).json({ error: error.message });
      return response.status(400).json({ error: 'Некорректные данные статьи' });
    }
    try {
      const document = normalizeDocument(dependencies.loadArticles());
      const created: AdminArticleRecord = { id: createId(), ...article };
      document.articles = sortArticles([created, ...document.articles]);
      document.updatedAt = timestamp.toISOString();
      dependencies.saveArticles(document);
      dependencies.invalidateArticles();
      return response.json({ success: true, article: created });
    } catch {
      return response.status(500).json({ error: 'Не удалось сохранить статью' });
    }
  });

  router.patch('/admin-articles', dependencies.adminGuard, (request, response) => {
    if (!authorize(request, response)) return response.status(401).json({ error: 'Требуется вход' });
    const id = normalizeText(request.body?.id ?? request.query?.id, 160);
    if (!id) return response.status(400).json({ error: 'id обязателен' });
    try {
      const document = normalizeDocument(dependencies.loadArticles());
      const index = document.articles.findIndex(item => String(item.id) === id);
      if (index === -1) return response.status(404).json({ error: 'Статья не найдена' });
      const previous = document.articles[index];
      const timestamp = now();
      let article: NormalizedAdminArticle;
      try {
        article = normalizeArticle(
          request.body?.article,
          dependencies.normalizeMode,
          normalizeDate(previous.date) || timestamp.toISOString().slice(0, 10),
        );
      } catch (error) {
        if (error instanceof AdminArticleValidationError) return response.status(400).json({ error: error.message });
        return response.status(400).json({ error: 'Некорректные данные статьи' });
      }
      const updated: AdminArticleRecord = { ...previous, ...article, id };
      document.articles[index] = updated;
      document.articles = sortArticles(document.articles);
      document.updatedAt = timestamp.toISOString();
      dependencies.saveArticles(document);
      dependencies.invalidateArticles();
      return response.json({ success: true, article: updated });
    } catch {
      return response.status(500).json({ error: 'Не удалось обновить статью' });
    }
  });

  router.delete('/admin-articles', dependencies.adminGuard, (request, response) => {
    if (!authorize(request, response)) return response.status(401).json({ error: 'Требуется вход' });
    const id = normalizeText(request.body?.id ?? request.query?.id, 160);
    if (!id) return response.status(400).json({ error: 'id обязателен' });
    try {
      const document = normalizeDocument(dependencies.loadArticles());
      const nextArticles = document.articles.filter(item => String(item.id) !== id);
      if (nextArticles.length === document.articles.length) {
        return response.status(404).json({ error: 'Статья не найдена' });
      }
      document.articles = nextArticles;
      document.updatedAt = now().toISOString();
      dependencies.saveArticles(document);
      dependencies.invalidateArticles();
      try {
        dependencies.deleteArticleVotes(id);
      } catch (error) {
        dependencies.onVoteCleanupError?.(error, id);
      }
      return response.json({ success: true });
    } catch {
      return response.status(500).json({ error: 'Не удалось удалить статью' });
    }
  });

  return router;
}
