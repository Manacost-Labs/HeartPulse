import assert from 'node:assert/strict';
import express from 'express';
import { createArticleRouter, type ArticleRouterDependencies } from '../server/articleRoutes.js';
import { createAdminCrmRouter } from '../server/adminCrmRoutes.js';
import {
  ARTICLE_OPENS_RETENTION_DAYS,
  ARTICLE_OPENS_SCHEMA_SQL,
  isSameArticlePage,
  readArticleReads,
  readPersonReading,
  recordArticleOpen,
} from '../server/articleOpens.js';
import { createAdminCrmTestDb } from './helpers/adminCrmTestDb.js';

const { db, addUser } = createAdminCrmTestDb();
for (const id of ['admin-1', 'reader-1', 'reader-2', 'guest']) addUser(id, id === 'admin-1' ? { role: 'admin' } : {});

const run = (sql: string, ...params: Array<string | number | null>) => {
  const result = db.prepare(sql).run(...params);
  return { lastInsertRowid: Number(result.lastInsertRowid), changes: Number(result.changes) };
};
const repository = {
  get: (sql: string, ...params: Array<string | number | null>) => (db.prepare(sql).get(...params) as Record<string, unknown> | undefined) ?? null,
  all: (sql: string, ...params: Array<string | number | null>) => db.prepare(sql).all(...params) as Record<string, unknown>[],
  run,
};
const opens = () => (db.prepare('SELECT article_id, user_id, opened_at FROM article_opens ORDER BY id').all() as Array<Record<string, unknown>>).map(row => ({ ...row }));
// Relative to the real clock: the admin routes and the retention sweep read the current time themselves.
const NOW = new Date(Date.now() - 3 * 3_600_000);
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

// The table ships with the CRM schema the ecosystem database executes at start-up.
assert.equal(opens().length, 0);

// One open per person and article within half an hour: a double click or a reopened tab is not a second read.
const recorded = (articleId: string, userId: string, moment: Date) => {
  const before = opens().length;
  recordArticleOpen(run, articleId, userId, moment);
  return opens().length - before;
};
assert.equal(recorded('a1', 'reader-1', NOW), 1);
assert.equal(recorded('a1', 'reader-1', at(10)), 0);
assert.equal(recorded('a1', 'reader-1', at(31)), 1);
assert.equal(recorded('a2', 'reader-1', at(11)), 1);
assert.equal(recorded('a1', 'reader-2', at(12)), 1);
assert.equal(recorded('', 'reader-1', NOW), 0);
assert.equal(recorded('a1', '', NOW), 0);
assert.equal(opens().length, 4);
// The production statement runner returns nothing; recording must not depend on a result.
recordArticleOpen((sql, ...params) => { db.prepare(sql).run(...params); }, 'a2', 'reader-2', at(13));
assert.equal(opens().length, 5);
db.prepare(`DELETE FROM article_opens WHERE article_id = 'a2' AND user_id = 'reader-2'`).run();

// Same page: scheme, query, letter case and a trailing slash do not matter; another path or host does.
assert.equal(isSameArticlePage('https://vip.example/Article/', 'http://VIP.example/article?utm=1'), true);
assert.equal(isSameArticlePage('https://vip.example/article/', 'https://vip.example/other/'), false);
assert.equal(isSameArticlePage('https://vip.example/article/', 'https://evil.example/article/'), false);
assert.equal(isSameArticlePage('', ''), false);
assert.equal(isSameArticlePage(undefined, 'https://vip.example/article/'), false);

// Older history: inside the total but outside the 30-day window.
db.prepare('INSERT INTO article_opens (article_id, user_id, opened_at) VALUES (?, ?, ?), (?, ?, ?)')
  .run('a1', 'guest', daysAgo(45).toISOString(), 'a3', 'guest', daysAgo(200).toISOString());

const reads = readArticleReads(repository, at(60));
assert.equal(reads.days, 30);
assert.equal(reads.since, daysAgo(200).toISOString());
assert.deepEqual(reads.totals, { opens: 4, readers: 2 });
assert.deepEqual(reads.articles, [
  { articleId: 'a1', opens: 3, readers: 2, opensTotal: 4, readersTotal: 3, lastOpenedAt: at(31).toISOString() },
  { articleId: 'a2', opens: 1, readers: 1, opensTotal: 1, readersTotal: 1, lastOpenedAt: at(11).toISOString() },
  { articleId: 'a3', opens: 0, readers: 0, opensTotal: 1, readersTotal: 1, lastOpenedAt: daysAgo(200).toISOString() },
]);

assert.deepEqual(readPersonReading(repository, 'reader-1', at(60)), { opens: 3, articles: 2, lastOpenedAt: at(31).toISOString() });
assert.deepEqual(readPersonReading(repository, 'guest', at(60)), { opens: 0, articles: 0, lastOpenedAt: daysAgo(45).toISOString() });
assert.deepEqual(readPersonReading(repository, 'nobody', at(60)), { opens: 0, articles: 0, lastOpenedAt: null });

// Start-up keeps the table bounded: rows past the retention period go, recent ones stay.
db.prepare('INSERT INTO article_opens (article_id, user_id, opened_at) VALUES (?, ?, ?)')
  .run('a9', 'guest', new Date(Date.now() - (ARTICLE_OPENS_RETENTION_DAYS + 5) * 86_400_000).toISOString());
db.prepare('INSERT INTO article_opens (article_id, user_id, opened_at) VALUES (?, ?, ?)')
  .run('a8', 'guest', new Date(Date.now() - 5 * 86_400_000).toISOString());
db.exec(ARTICLE_OPENS_SCHEMA_SQL);
assert.equal(opens().filter(row => row.article_id === 'a9').length, 0);
assert.equal(opens().filter(row => row.article_id === 'a8').length, 1);
db.prepare(`DELETE FROM article_opens WHERE article_id = 'a8'`).run();

// A deleted account takes its reading history with it.
addUser('leaver');
recordArticleOpen(run, 'a1', 'leaver', at(40));
db.prepare(`DELETE FROM users WHERE id = 'leaver'`).run();
assert.equal(opens().filter(row => row.user_id === 'leaver').length, 0);

const CATALOGUE_URL = 'https://vip.example/article/';
let failWrites = false;
let writeAttempts = 0;
const accessErrors: unknown[] = [];
const articleDependencies: ArticleRouterDependencies = {
  loadArticles: () => null,
  authenticate: request => {
    const id = String(request.headers['x-test-user'] || '');
    return id ? { id } : null;
  },
  shapeArticles: data => data,
  refreshSubscription: async user => ({ hasAccess: user.id !== 'guest' }),
  findArticle: () => null,
  isAdmin: user => user.id === 'admin-1',
  subscriptionAllowsArticle: subscription => Boolean(subscription.hasAccess),
  parseUrl: value => { try { return new URL(String(value)); } catch { return null; } },
  isVipArticleUrl: value => new URL(value).hostname === 'vip.example',
  // As in server/index.ts: a catalogue article is matched by its address or by the supplied title;
  // anything else resolves to nothing and the route falls back to an object without an id.
  findArticleByUrlOrTitle: (url, title) => (
    url === CATALOGUE_URL || title === 'Арена' ? { id: 'route-article', url: CATALOGUE_URL, title: 'Арена', mode: 'arena' } : null
  ),
  findVipLocker: async (url, title) => ({ post_id: 1, title, url }),
  issueVipLink: async locker => {
    if (locker.title === 'upstream-error') throw new Error('upstream');
    return { url: 'https://vip.example/access/token', ttl: 600 };
  },
  dbGet: (sql, ...params) => db.prepare(sql).get(...params),
  dbRun: (sql, ...params) => {
    if (failWrites) { writeAttempts += 1; throw new Error('database is locked'); }
    return db.prepare(sql).run(...params);
  },
  now: () => NOW,
  onAccessLinkError: error => accessErrors.push(error),
};

const app = express();
app.use(express.json());
app.use('/api', createArticleRouter(articleDependencies));
app.use('/api', createAdminCrmRouter({
  adminAuth: request => (request.headers['x-admin'] === 'yes' ? { id: 'admin-1' } : null),
  csrfAllowed: () => true,
  setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
  repository,
  recordAudit: () => undefined,
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api`;
const open = (user: string, title = 'Арена', url = 'https://vip.example/article/') => fetch(`${base}/articles/access-link`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(user ? { 'X-Test-User': user } : {}) },
  body: JSON.stringify({ url, title }),
});
const routeOpens = () => opens().filter(row => row.article_id === 'route-article');
// The read is counted right after the response is written; give that callback its turn.
const settled = () => new Promise<void>(resolve => { setTimeout(resolve, 20); });

try {
  // A subscriber who receives the link is one recorded open; the response itself is unchanged.
  const issued = await open('reader-1');
  assert.equal(issued.status, 200);
  const issuedBody = await issued.json() as Record<string, unknown>;
  assert.equal(issuedBody.url, 'https://vip.example/access/token');
  assert.deepEqual(Object.keys(issuedBody).sort(), ['article', 'expiresAt', 'source', 'target', 'ttl', 'url']);
  await settled();
  assert.deepEqual(routeOpens(), [{ article_id: 'route-article', user_id: 'reader-1', opened_at: NOW.toISOString() }]);

  // Nothing is recorded when no link is issued, for staff, or for an article outside the catalogue.
  assert.equal((await open('')).status, 401);
  assert.equal((await open('guest')).status, 403);
  assert.equal((await open('reader-2', 'upstream-error')).status, 502);
  assert.equal((await open('admin-1')).status, 200);
  assert.equal((await open('reader-2', 'unlisted', 'https://vip.example/unlisted/')).status, 200);
  // A listed title sent with another page's address matches the article but is not a read of it.
  assert.equal((await open('reader-2', 'Арена', 'https://vip.example/another-article/')).status, 200);
  await settled();
  assert.equal(routeOpens().length, 1);

  // Counting is best effort: a failed write must never cost a subscriber the article.
  failWrites = true;
  const despiteFailure = await open('reader-2');
  assert.equal(despiteFailure.status, 200);
  assert.equal((await despiteFailure.json() as Record<string, unknown>).url, 'https://vip.example/access/token');
  await settled();
  assert.equal(writeAttempts, 1, 'the write was attempted and failed');
  failWrites = false;
  assert.equal(routeOpens().length, 1);
  // The same request with a working database is a read: the two checks above did not pass by accident.
  assert.equal((await open('reader-2')).status, 200);
  await settled();
  assert.equal(routeOpens().length, 2);
  assert.equal(accessErrors.length, 1, 'only the upstream failure is reported as an access-link error');

  // The admin endpoint is private and returns the same aggregate the read model computes.
  const forbidden = await fetch(`${base}/admin/crm/articles/reads`);
  assert.equal(forbidden.status, 403);
  const allowed = await fetch(`${base}/admin/crm/articles/reads`, { headers: { 'X-Admin': 'yes' } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('cache-control'), 'private, no-store');
  const payload = await allowed.json() as ReturnType<typeof readArticleReads>;
  assert.equal(payload.days, 30);
  assert.ok(payload.articles.some(item => item.articleId === 'route-article'));
  assert.ok(!JSON.stringify(payload).includes('reader-1'), 'the list never names readers');

  // The client card summarises one person's reading.
  const card = await fetch(`${base}/admin/crm/people/reader-1`, { headers: { 'X-Admin': 'yes' } });
  assert.equal(card.status, 200);
  const cardBody = await card.json() as { reading: { opens: number; articles: number; lastOpenedAt: string | null } };
  assert.equal(cardBody.reading.articles, 3);
  assert.ok(cardBody.reading.lastOpenedAt);
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
}

console.log('article opens: ok');
