import assert from 'node:assert/strict';
import express from 'express';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import { DatabaseSync } from 'node:sqlite';
import { createGuidesArchiveRouter, escapeGuideLike } from '../server/guidesArchiveRoutes.js';

assert.equal(escapeGuideLike('100%_win\\path'), '100\\%\\_win\\\\path');

const database = new DatabaseSync(':memory:');
database.exec(`
  CREATE TABLE guides (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL,
    old_url TEXT,
    published_at INTEGER,
    published_iso TEXT,
    title TEXT,
    description TEXT,
    keywords TEXT,
    image TEXT,
    menu_name TEXT,
    menu_code TEXT,
    kind TEXT,
    kind_slug TEXT,
    short_html TEXT,
    free_html TEXT,
    body_html TEXT,
    body_text TEXT,
    reply_count INTEGER
  );
  INSERT INTO guides VALUES (
    1, 'arena-100-percent', '/guides/arena-100-percent', 100, NULL,
    'Арена 100% побед', 'Подробное описание', 'арена,100%', '/images/arena.png',
    'Арена', 'arena', 'Гайды', 'guides', '', '',
    '<script>bad()</script><p onclick="bad()">Безопасный текст</p><a href="javascript:bad()">опасно</a>',
    'Запасной текст', 7
  );
  INSERT INTO guides VALUES (
    2, 'battlegrounds', '/guides/battlegrounds', 200, '2026-07-10T12:00:00.000Z',
    'Поля Сражений', '', 'поля', '/images/bg.png',
    'Поля Сражений', 'bg', 'Мета', 'meta', '', '', '',
    'Только текст без HTML', 2
  );
`);

const accessGuard: express.RequestHandler = (request, response, next) => {
  if (request.headers['x-test-access'] !== 'yes') return response.status(401).json({ error: 'Требуется подписка' });
  next();
};

const app = express();
app.use('/api', createGuidesArchiveRouter({
  getDatabase: () => database,
  accessGuard,
  publicUrl: 'https://legacy.example.test',
  logError: () => {},
}));
const failingApp = express();
failingApp.use('/api', createGuidesArchiveRouter({
  getDatabase: () => { throw new Error('database unavailable'); },
  accessGuard: (_request, _response, next) => next(),
  publicUrl: 'https://legacy.example.test',
  logError: () => {},
}));

const server = app.listen(0, '127.0.0.1');
const failingServer = failingApp.listen(0, '127.0.0.1');
await Promise.all([server, failingServer].map(instance => new Promise<void>((resolve, reject) => {
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
  return { response, body: await response.json() as any };
}

try {
  const unauthorized = await request('/guides-archive');
  assert.equal(unauthorized.response.status, 401);

  const headers = { 'X-Test-Access': 'yes' };
  const list = await request('/guides-archive?page=-5&limit=999', { headers });
  assert.equal(list.response.status, 200);
  assert.match(list.response.headers.get('cache-control') || '', /max-age=3600/);
  assert.equal(list.body.page, 1);
  assert.equal(list.body.limit, 48);
  assert.equal(list.body.total, 2);
  assert.equal(list.body.items.length, 2);
  assert.equal(list.body.items[0].slug, 'battlegrounds');
  assert.equal(list.body.items[1].image, 'https://legacy.example.test/images/arena.png');
  assert.deepEqual(list.body.filters.kinds, [
    { slug: 'guides', label: 'Гайды', count: 1 },
    { slug: 'meta', label: 'Мета', count: 1 },
  ]);

  const literalWildcard = await request(`/guides-archive?q=${encodeURIComponent('100%')}`, { headers });
  assert.equal(literalWildcard.body.total, 1);
  assert.equal(literalWildcard.body.items[0].slug, 'arena-100-percent');

  const filtered = await request('/guides-archive?kind=meta&menu=bg', { headers });
  assert.equal(filtered.body.total, 1);
  assert.equal(filtered.body.items[0].slug, 'battlegrounds');

  const detail = await request('/guides-archive/arena-100-percent', { headers });
  assert.equal(detail.response.status, 200);
  assert.equal(detail.body.replyCount, 7);
  assert.equal(detail.body.sourceUrl, 'https://legacy.example.test/guides/arena-100-percent');
  assert.match(detail.body.contentHtml, /<p>Безопасный текст<\/p>/);
  assert.doesNotMatch(detail.body.contentHtml, /script|onclick|javascript:/i);

  const textDetail = await request('/guides-archive/2', { headers });
  assert.equal(textDetail.response.status, 200);
  assert.equal(textDetail.body.fallbackText, 'Только текст без HTML');

  const missing = await request('/guides-archive/missing', { headers });
  assert.equal(missing.response.status, 404);
  assert.deepEqual(missing.body, { error: 'Гайд не найден' });

  const failedList = await fetch(`${origin(failingServer)}/guides-archive`);
  assert.equal(failedList.status, 500);
  assert.deepEqual(await failedList.json(), { error: 'Не удалось загрузить архив гайдов' });

  const failedDetail = await fetch(`${origin(failingServer)}/guides-archive/example`);
  assert.equal(failedDetail.status, 500);
  assert.deepEqual(await failedDetail.json(), { error: 'Не удалось загрузить гайд' });
} finally {
  await Promise.all([server, failingServer].map(instance => new Promise<void>((resolve, reject) => (
    instance.close(error => error ? reject(error) : resolve())
  ))));
  database.close();
}

console.log('guides archive router contract tests passed');
