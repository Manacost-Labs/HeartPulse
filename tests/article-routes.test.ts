import assert from 'node:assert/strict';
import express from 'express';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import { DatabaseSync } from 'node:sqlite';
import { createArticleRouter, type ArticleRouterDependencies } from '../server/articleRoutes.js';

const database = new DatabaseSync(':memory:');
database.exec(`
  CREATE TABLE article_votes (
    article_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    vote INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (article_id, user_id)
  );
`);

const dbGet = (sql: string, ...params: any[]) => database.prepare(sql).get(...params);
const dbRun = (sql: string, ...params: any[]) => database.prepare(sql).run(...params);
const articlesEntry = {
  data: { articles: [{ id: 'a1', title: 'Арена' }] },
  etag: '"articles-base"',
};
const accessErrors: unknown[] = [];

function dependencies(overrides: Partial<ArticleRouterDependencies> = {}): ArticleRouterDependencies {
  return {
    loadArticles: () => articlesEntry,
    authenticate: (request: express.Request) => {
      const id = String(request.headers['x-test-user'] || '');
      return id ? { id } : null;
    },
    shapeArticles: (data: any, userId: string) => ({ ...data, viewer: userId }),
    refreshSubscription: async (user: { id: string }) => ({ hasAccess: user.id === 'member', userId: user.id }),
    findArticle: (articleId: string) => articleId === 'a1' ? { id: 'a1', mode: 'arena' } : null,
    isAdmin: (user: { id: string }) => user.id === 'admin',
    subscriptionAllowsArticle: (subscription: any) => Boolean(subscription.hasAccess),
    parseUrl: value => {
      try {
        const url = new URL(String(value));
        return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
      } catch {
        return null;
      }
    },
    isVipArticleUrl: value => new URL(value).hostname === 'vip.example',
    findArticleByUrlOrTitle: (url, title) => ({ url, title, mode: 'arena' }),
    findVipLocker: async (url, title) => title === 'missing'
      ? null
      : { post_id: 42, title, url, code: 'vip-code' },
    issueVipLink: async locker => {
      if (locker.title === 'error') throw new Error('private upstream detail');
      return { url: 'https://vip.example/access/token', expires_at: '2026-07-12T14:15:00.000Z', ttl: 600 };
    },
    dbGet,
    dbRun,
    publicCacheHeader: 'public, max-age=300, stale-while-revalidate=300',
    now: () => new Date('2026-07-12T14:00:00.000Z'),
    onAccessLinkError: error => accessErrors.push(error),
    ...overrides,
  };
}

function startApp(overrides: Partial<ArticleRouterDependencies> = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api', createArticleRouter(dependencies(overrides)));
  return app.listen(0, '127.0.0.1');
}

const server = startApp();
const noDataServer = startApp({ loadArticles: () => null });
await Promise.all([server, noDataServer].map(instance => new Promise<void>((resolve, reject) => {
  instance.once('listening', resolve);
  instance.once('error', reject);
})));

function origin(instance: typeof server): string {
  const address = instance.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}/api`;
}

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${origin(server)}${path}`, options);
  const body = response.status === 304 ? null : await response.json() as any;
  return { response, body };
}

const voteRequest = (user: string, vote: string) => request('/articles/a1/vote', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Test-User': user },
  body: JSON.stringify({ vote }),
});

try {
  const anonymousAccess = await request('/articles/access-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://vip.example/article' }),
  });
  assert.equal(anonymousAccess.response.status, 401);
  assert.equal(anonymousAccess.response.headers.get('cache-control'), 'no-store');
  assert.match(anonymousAccess.response.headers.get('vary') || '', /Cookie/);

  const invalidAccess = await request('/articles/access-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-User': 'member' },
    body: JSON.stringify({ url: 'javascript:alert(1)' }),
  });
  assert.equal(invalidAccess.response.status, 400);

  const passthrough = await request('/articles/access-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-User': 'member' },
    body: JSON.stringify({ url: 'https://example.com/guide?ref=arena' }),
  });
  assert.deepEqual(passthrough.body, { url: 'https://example.com/guide?ref=arena', passthrough: true });

  const forbiddenAccess = await request('/articles/access-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-User': 'blocked' },
    body: JSON.stringify({ url: 'https://vip.example/article', title: 'VIP' }),
  });
  assert.equal(forbiddenAccess.response.status, 403);
  assert.equal(forbiddenAccess.body.subscription.userId, 'blocked');

  const missingAccess = await request('/articles/access-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-User': 'member' },
    body: JSON.stringify({ url: 'https://vip.example/article', title: 'missing' }),
  });
  assert.equal(missingAccess.response.status, 404);

  const vipAccess = await request('/articles/access-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-User': 'member' },
    body: JSON.stringify({ url: 'https://vip.example/article', title: 'VIP guide' }),
  });
  assert.deepEqual(vipAccess.body, {
    url: 'https://vip.example/access/token',
    target: 'https://vip.example/article',
    expiresAt: '2026-07-12T14:15:00.000Z',
    ttl: 600,
    source: 'koloda-vip',
    article: { postId: 42, title: 'VIP guide', url: 'https://vip.example/article' },
  });

  const failedAccess = await request('/articles/access-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-User': 'member' },
    body: JSON.stringify({ url: 'https://vip.example/article', title: 'error' }),
  });
  assert.equal(failedAccess.response.status, 502);
  assert.deepEqual(failedAccess.body, { error: 'Не удалось выдать доступ к статье' });
  assert.equal(accessErrors.length, 1);

  const publicList = await request('/articles');
  assert.equal(publicList.response.status, 200);
  assert.equal(publicList.body.viewer, '');
  assert.match(publicList.response.headers.get('cache-control') || '', /^public/);
  assert.equal(publicList.response.headers.get('etag'), '"articles-base-articles-votes"');

  const notModified = await request('/articles', {
    headers: { 'If-None-Match': '"articles-base-articles-votes"' },
  });
  assert.equal(notModified.response.status, 304);

  const privateList = await request('/articles', { headers: { 'X-Test-User': 'member' } });
  assert.equal(privateList.response.status, 200);
  assert.equal(privateList.body.viewer, 'member');
  assert.equal(privateList.response.headers.get('cache-control'), 'no-store');
  assert.match(privateList.response.headers.get('vary') || '', /Cookie/);
  assert.match(privateList.response.headers.get('vary') || '', /Authorization/);

  const noData = await fetch(`${origin(noDataServer)}/articles`);
  assert.equal(noData.status, 404);
  assert.deepEqual(await noData.json(), { error: 'No data' });

  const anonymousVote = await request('/articles/a1/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vote: 'like' }),
  });
  assert.equal(anonymousVote.response.status, 401);
  assert.equal(anonymousVote.response.headers.get('cache-control'), 'no-store');

  const missingArticle = await request('/articles/missing/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-User': 'member' },
    body: JSON.stringify({ vote: 'like' }),
  });
  assert.equal(missingArticle.response.status, 404);

  const forbidden = await voteRequest('blocked', 'like');
  assert.equal(forbidden.response.status, 403);
  assert.equal(forbidden.body.subscription.userId, 'blocked');

  const invalidVote = await voteRequest('member', 'up');
  assert.equal(invalidVote.response.status, 400);
  assert.deepEqual(invalidVote.body, { error: 'Некорректный голос' });

  const liked = await voteRequest('member', 'like');
  assert.deepEqual(liked.body, { success: true, articleId: 'a1', likes: 1, dislikes: 0, userVote: 'like' });
  const stored = database.prepare('SELECT * FROM article_votes WHERE article_id = ? AND user_id = ?').get('a1', 'member') as any;
  assert.equal(stored.created_at, '2026-07-12T14:00:00.000Z');
  assert.equal(stored.updated_at, '2026-07-12T14:00:00.000Z');

  const toggledOff = await voteRequest('member', 'like');
  assert.deepEqual(toggledOff.body, { success: true, articleId: 'a1', likes: 0, dislikes: 0, userVote: null });

  const disliked = await voteRequest('member', 'dislike');
  assert.deepEqual(disliked.body, { success: true, articleId: 'a1', likes: 0, dislikes: 1, userVote: 'dislike' });

  const adminLike = await voteRequest('admin', 'like');
  assert.deepEqual(adminLike.body, { success: true, articleId: 'a1', likes: 1, dislikes: 1, userVote: 'like' });
} finally {
  await Promise.all([server, noDataServer].map(instance => new Promise<void>((resolve, reject) => (
    instance.close(error => error ? reject(error) : resolve())
  ))));
  database.close();
}

console.log('article router contract tests passed');
