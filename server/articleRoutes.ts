import { Router, type Request, type Response } from 'express';

type ArticleUser = { id: string };
type ArticlesCacheEntry = { data: any; etag: string };
type ArticleLocker = { post_id: number; title: string; url: string; [key: string]: any };

export type ArticleRouterDependencies = {
  loadArticles: () => ArticlesCacheEntry | null;
  authenticate: (request: Request) => ArticleUser | null;
  shapeArticles: (data: any, userId: string) => any;
  refreshSubscription: (user: ArticleUser) => Promise<any>;
  findArticle: (articleId: string) => Record<string, any> | null;
  isAdmin: (user: ArticleUser) => boolean;
  subscriptionAllowsArticle: (subscription: any, article: Record<string, any>) => boolean;
  parseUrl: (value: unknown) => URL | null;
  isVipArticleUrl: (url: string) => boolean;
  findArticleByUrlOrTitle: (url: string, title: string) => Record<string, any> | null;
  findVipLocker: (url: string, title: string) => Promise<ArticleLocker | null>;
  issueVipLink: (locker: ArticleLocker, user: ArticleUser) => Promise<Record<string, any>>;
  dbGet: (sql: string, ...params: any[]) => any;
  dbRun: (sql: string, ...params: any[]) => unknown;
  onAccessLinkError?: (error: unknown) => void;
  publicCacheHeader?: string;
  now?: () => Date;
};

function setPrivateNoStore(response: Response) {
  response.set('Cache-Control', 'no-store');
  response.vary('Cookie');
  response.vary('Authorization');
}

export function createArticleRouter(dependencies: ArticleRouterDependencies): Router {
  const router = Router();
  const cacheHeader = dependencies.publicCacheHeader ?? 'public, max-age=300, stale-while-revalidate=300';
  const now = dependencies.now ?? (() => new Date());

  router.post('/articles/access-link', async (request, response) => {
    setPrivateNoStore(response);
    const user = dependencies.authenticate(request);
    if (!user) return response.status(401).json({ error: 'Требуется вход в профиль Манакоста' });

    const rawUrl = String(request.body?.url ?? '').trim();
    const title = String(request.body?.title ?? '').trim();
    const target = dependencies.parseUrl(rawUrl);
    if (!target) return response.status(400).json({ error: 'Некорректная ссылка на статью' });
    if (!dependencies.isVipArticleUrl(target.href)) {
      return response.json({ url: target.href, passthrough: true });
    }

    try {
      const subscription = await dependencies.refreshSubscription(user);
      const article = dependencies.findArticleByUrlOrTitle(target.href, title) ?? { title, url: target.href };
      if (!dependencies.isAdmin(user) && !dependencies.subscriptionAllowsArticle(subscription, article)) {
        return response.status(403).json({
          error: 'Для доступа к VIP-статье нужна подписка подходящего режима',
          subscription,
        });
      }
      const locker = await dependencies.findVipLocker(target.href, title);
      if (!locker) return response.status(404).json({ error: 'VIP-материал не найден в каталоге Koloda' });
      const issued = await dependencies.issueVipLink(locker, user);
      return response.json({
        url: String(issued.url),
        target: String(issued.target || locker.url),
        expiresAt: issued.expires_at ?? null,
        ttl: Number(issued.ttl || 900),
        source: 'koloda-vip',
        article: { postId: locker.post_id, title: locker.title, url: locker.url },
      });
    } catch (error) {
      dependencies.onAccessLinkError?.(error);
      return response.status(502).json({ error: 'Не удалось выдать доступ к статье' });
    }
  });

  router.get('/articles', (request, response) => {
    const entry = dependencies.loadArticles();
    if (!entry) return response.status(404).json({ error: 'No data' });
    const user = dependencies.authenticate(request);
    const data = dependencies.shapeArticles(entry.data, user?.id ?? '');
    if (user) {
      setPrivateNoStore(response);
      return response.json(data);
    }
    const etag = `"${entry.etag.replace(/^"|"$/g, '')}-articles-votes"`;
    response.set('Cache-Control', cacheHeader);
    response.set('ETag', etag);
    if (request.headers['if-none-match'] === etag) return response.status(304).end();
    return response.json(data);
  });

  router.post('/articles/:articleId/vote', async (request, response) => {
    setPrivateNoStore(response);
    const user = dependencies.authenticate(request);
    if (!user) return response.status(401).json({ error: 'Требуется вход в профиль Манакоста' });
    const subscription = await dependencies.refreshSubscription(user);
    const articleId = String(request.params.articleId ?? '').trim().slice(0, 160);
    const article = articleId ? dependencies.findArticle(articleId) : null;
    if (!articleId || !article) return response.status(404).json({ error: 'Статья не найдена' });
    if (!dependencies.isAdmin(user) && !dependencies.subscriptionAllowsArticle(subscription, article)) {
      return response.status(403).json({
        error: 'Голосовать за эту статью могут только подписчики подходящего режима',
        subscription,
      });
    }
    const voteValue = String(request.body?.vote ?? '').toLowerCase();
    if (voteValue !== 'like' && voteValue !== 'dislike') {
      return response.status(400).json({ error: 'Некорректный голос' });
    }

    const numericVote = voteValue === 'like' ? 1 : -1;
    const existing = dependencies.dbGet(
      'SELECT vote FROM article_votes WHERE article_id = ? AND user_id = ?',
      articleId,
      user.id,
    );
    const timestamp = now().toISOString();
    if (existing && Number(existing.vote) === numericVote) {
      dependencies.dbRun('DELETE FROM article_votes WHERE article_id = ? AND user_id = ?', articleId, user.id);
    } else {
      dependencies.dbRun(`
        INSERT INTO article_votes (article_id, user_id, vote, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(article_id, user_id) DO UPDATE SET vote = excluded.vote, updated_at = excluded.updated_at
      `, articleId, user.id, numericVote, timestamp, timestamp);
    }
    const counts = dependencies.dbGet(`
      SELECT
        SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS likes,
        SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS dislikes
      FROM article_votes
      WHERE article_id = ?
    `, articleId);
    const next = dependencies.dbGet(
      'SELECT vote FROM article_votes WHERE article_id = ? AND user_id = ?',
      articleId,
      user.id,
    );
    return response.json({
      success: true,
      articleId,
      likes: Number(counts?.likes || 0),
      dislikes: Number(counts?.dislikes || 0),
      userVote: next ? (Number(next.vote) === 1 ? 'like' : 'dislike') : null,
    });
  });

  return router;
}
