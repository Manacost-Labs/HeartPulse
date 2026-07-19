import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type RequestHandler } from 'express';
import {
  createAdminArticleRouter,
  writeArticlesFile,
  type AdminArticleMode,
  type AdminArticleRecord,
  type AdminArticlesDocument,
} from '../server/adminArticleRoutes.js';
import { writeJsonAtomically } from '../server/durableJson.js';

const initialArticle: AdminArticleRecord = {
  id: 'existing',
  title: 'Старая статья',
  date: '2026-07-10',
  image: '/old.webp',
  excerpt: 'Старое описание',
  tag: 'Арена',
  mode: 'arena',
  url: '/articles/old',
  preserved: 'metadata',
};

let document: AdminArticlesDocument = { articles: [initialArticle], updatedAt: '2026-07-10T12:00:00.000Z' };
let loadFailure = false;
let saveFailure = false;
let invalidations = 0;
let voteCleanupFailure = false;
const deletedVoteIds: string[] = [];
const voteCleanupErrors: Array<{ articleId: string; error: unknown }> = [];

const guard: RequestHandler = (request, response, next) => {
  if (request.headers['x-admin-guard'] !== 'allowed') return response.status(403).json({ error: 'forbidden' });
  return next();
};

const normalizeMode = (value: unknown): AdminArticleMode => (
  value === 'arena' || value === 'battlegrounds' || value === 'standard' || value === 'wild' ? value : 'general'
);

const app = express();
app.use(express.json());
app.use('/api', createAdminArticleRouter({
  adminGuard: guard,
  adminAuth: request => request.headers['x-admin-auth'] === 'yes' ? { id: 'admin' } : null,
  loadArticles: () => {
    if (loadFailure) throw new Error('/private/storage/articles.json');
    return structuredClone(document);
  },
  saveArticles: nextDocument => {
    if (saveFailure) throw new Error('/private/storage/articles.json');
    document = structuredClone(nextDocument);
  },
  invalidateArticles: () => { invalidations += 1; },
  deleteArticleVotes: articleId => {
    deletedVoteIds.push(articleId);
    if (voteCleanupFailure) throw new Error('private sqlite failure');
  },
  normalizeMode,
  setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
  now: () => new Date('2026-07-12T18:30:00.000Z'),
  createId: () => 'created-id',
  onVoteCleanupError: (error, articleId) => { voteCleanupErrors.push({ articleId, error }); },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const endpoint = `http://127.0.0.1:${address.port}/api/admin-articles`;
const authorizedHeaders = {
  'Content-Type': 'application/json',
  'X-Admin-Guard': 'allowed',
  'X-Admin-Auth': 'yes',
};

async function mutate(method: 'POST' | 'PATCH' | 'DELETE', body: unknown) {
  return fetch(endpoint, { method, headers: authorizedHeaders, body: JSON.stringify(body) });
}

try {
  const denied = await fetch(endpoint, { method: 'POST' });
  assert.equal(denied.status, 403);

  const unauthenticated = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Guard': 'allowed' },
    body: JSON.stringify({ article: { title: 'Нельзя сохранить' } }),
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get('cache-control'), 'private, no-store');

  for (const article of [null, [], {}, { title: '   ' }]) {
    const invalid = await mutate('POST', { article });
    assert.equal(invalid.status, 400, `expected invalid article to fail: ${JSON.stringify(article)}`);
  }

  for (const article of [
    { title: 'Bad URL', url: 'javascript:alert(1)' },
    { title: 'Bad image', image: '//evil.example/image.webp' },
    { title: 'Bad protocol', url: 'file:///etc/passwd' },
  ]) {
    const invalid = await mutate('POST', { article });
    assert.equal(invalid.status, 400);
  }

  const createdResponse = await mutate('POST', {
    article: {
      title: `  ${'Н'.repeat(200)}  `,
      date: '2026-07-11',
      image: '/media/article.webp',
      excerpt: '  Новый разбор  ',
      tag: '  Мета  ',
      mode: 'standard',
      url: 'https://example.com/article',
    },
  });
  assert.equal(createdResponse.status, 200);
  assert.equal(createdResponse.headers.get('cache-control'), 'private, no-store');
  const createdPayload = await createdResponse.json() as { success: boolean; article: AdminArticleRecord };
  assert.equal(createdPayload.success, true);
  assert.equal(createdPayload.article.id, 'created-id');
  assert.equal(createdPayload.article.title.length, 180);
  assert.equal(createdPayload.article.excerpt, 'Новый разбор');
  assert.equal(createdPayload.article.tag, 'Мета');
  assert.equal(createdPayload.article.mode, 'standard');
  assert.equal(createdPayload.article.url, 'https://example.com/article');
  assert.deepEqual(document.articles.map(article => article.id), ['created-id', 'existing']);
  assert.equal(document.updatedAt, '2026-07-12T18:30:00.000Z');
  assert.equal(invalidations, 1);

  const missingPatchId = await mutate('PATCH', { article: { title: 'Без id' } });
  assert.equal(missingPatchId.status, 400);
  const missingPatchArticle = await mutate('PATCH', { id: 'missing', article: { title: 'Нет статьи' } });
  assert.equal(missingPatchArticle.status, 404);

  const updatedResponse = await mutate('PATCH', {
    id: 'existing',
    article: {
      title: '  Обновлённая статья  ',
      date: 'not-a-date',
      image: 'https://example.com/image.webp',
      excerpt: '  Новый текст  ',
      tag: '  Гайд  ',
      mode: 'wild',
      url: '/articles/updated',
    },
  });
  assert.equal(updatedResponse.status, 200);
  const updatedPayload = await updatedResponse.json() as { article: AdminArticleRecord };
  assert.equal(updatedPayload.article.title, 'Обновлённая статья');
  assert.equal(updatedPayload.article.date, '2026-07-10');
  assert.equal(updatedPayload.article.mode, 'wild');
  assert.equal(updatedPayload.article.preserved, 'metadata');
  assert.equal(document.articles.find(article => article.id === 'existing')?.preserved, 'metadata');
  assert.equal(invalidations, 2);

  const missingDeleteId = await mutate('DELETE', {});
  assert.equal(missingDeleteId.status, 400);
  const missingDeleteArticle = await mutate('DELETE', { id: 'missing' });
  assert.equal(missingDeleteArticle.status, 404);

  voteCleanupFailure = true;
  const deletedResponse = await mutate('DELETE', { id: 'created-id' });
  assert.equal(deletedResponse.status, 200);
  assert.deepEqual(await deletedResponse.json(), { success: true });
  assert.deepEqual(document.articles.map(article => article.id), ['existing']);
  assert.deepEqual(deletedVoteIds, ['created-id']);
  assert.equal(voteCleanupErrors.length, 1);
  assert.equal(voteCleanupErrors[0].articleId, 'created-id');
  assert.equal(invalidations, 3);
  voteCleanupFailure = false;

  loadFailure = true;
  const failedLoad = await mutate('POST', { article: { title: 'Ошибка загрузки' } });
  assert.equal(failedLoad.status, 500);
  assert.deepEqual(await failedLoad.json(), { error: 'Не удалось сохранить статью' });
  loadFailure = false;

  saveFailure = true;
  const failedSave = await mutate('PATCH', { id: 'existing', article: { title: 'Ошибка записи' } });
  assert.equal(failedSave.status, 500);
  assert.deepEqual(await failedSave.json(), { error: 'Не удалось обновить статью' });
  const failedDelete = await mutate('DELETE', { id: 'existing' });
  assert.equal(failedDelete.status, 500);
  assert.deepEqual(await failedDelete.json(), { error: 'Не удалось удалить статью' });
  assert.deepEqual(deletedVoteIds, ['created-id']);
  saveFailure = false;

  const directory = mkdtempSync(join(tmpdir(), 'hs-arena-articles-'));
  try {
    const destination = writeArticlesFile(directory, document);
    assert.equal(destination, join(directory, 'articles.json'));
    assert.deepEqual(JSON.parse(readFileSync(destination, 'utf8')), document);
    assert.equal(statSync(destination).mode & 0o777, 0o640);
    assert.throws(() => writeJsonAtomically(directory, '../unsafe.json', {}), /unsafe JSON filename/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('admin article router contract tests passed');
