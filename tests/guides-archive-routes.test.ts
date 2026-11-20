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
    'Арена', 'arena', 'Гайды', 'guides', 'Краткий анонс', '<p>Начало статьи</p>',
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

let databaseDown = false;
const flakyApp = express();
flakyApp.use('/api', createGuidesArchiveRouter({
  getDatabase: () => { if (databaseDown) throw new Error('database unavailable'); return database; },
  accessGuard,
  publicUrl: 'https://legacy.example.test',
  logError: () => {},
}));
const server = app.listen(0, '127.0.0.1');
const failingServer = failingApp.listen(0, '127.0.0.1');
const flakyServer = flakyApp.listen(0, '127.0.0.1');
await Promise.all([server, failingServer, flakyServer].map(instance => new Promise<void>((resolve, reject) => {
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

  const publicTeaser = await request('/guides-archive/teaser/arena-100-percent');
  assert.equal(publicTeaser.response.status, 200);
  assert.match(publicTeaser.response.headers.get('cache-control') || '', /^public,/);
  assert.equal(publicTeaser.body.title, 'Арена 100% побед');
  assert.equal(publicTeaser.body.description, 'Подробное описание');
  for (const field of ['bodyHtml', 'bodyText', 'contentHtml', 'keywords', 'oldUrl', 'sourceUrl']) {
    assert.equal(Object.hasOwn(publicTeaser.body, field), false, `${field} must stay private`);
  }
  assert.equal((await request('/guides-archive/teaser/missing')).response.status, 404);

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
  assert.ok(detail.body.contentHtml.indexOf('Начало статьи') >= 0);
  assert.ok(detail.body.contentHtml.indexOf('Начало статьи') < detail.body.contentHtml.indexOf('Безопасный текст'));
  assert.doesNotMatch(detail.body.contentHtml, /Краткий анонс/);
  assert.doesNotMatch(detail.body.contentHtml, /script|onclick|javascript:/i);
  assert.equal((await request('/guides-archive/arena-100-percent')).response.status, 401);

  database.prepare('UPDATE guides SET body_html = ? WHERE id = 1').run('');
  const introOnly = await request('/guides-archive/1', { headers });
  assert.match(introOnly.body.contentHtml, /Начало статьи/);
  database.prepare('UPDATE guides SET free_html = ? WHERE id = 1').run('');
  const summaryOnly = await request('/guides-archive/1', { headers });
  assert.match(summaryOnly.body.contentHtml, /Краткий анонс/);

  const textDetail = await request('/guides-archive/2', { headers });
  assert.equal(textDetail.response.status, 200);
  assert.equal(textDetail.body.fallbackText, 'Только текст без HTML');

  const missing = await request('/guides-archive/missing', { headers });
  assert.equal(missing.response.status, 404);
  assert.deepEqual(missing.body, { error: 'Гайд не найден' });

  // The open list: card fields only, no paid text, no guard, and a search that never reads the paid text.
  database.prepare(`INSERT INTO guides VALUES (3, 'sentinel', '/guides/sentinel', 300, NULL, 'Открытый гайд', 'Открытое описание',
    'ключ', '/images/s.png', 'Арена', 'arena', 'Гайды', 'guides', '', '<p>FREE_PART</p>',
    '<p>PAID_SENTINEL_BODY_HTML</p>', 'PAID_SENTINEL_BODY_TEXT', 0)`).run();
  const open = await request('/guides-archive/public/list');
  assert.equal(open.response.status, 200);
  assert.equal(open.body.total, 3);
  assert.equal(open.body.items[0].slug, 'sentinel');
  assert.deepEqual(Object.keys(open.body.items[0]).sort(), ['description', 'id', 'image', 'kind', 'kindSlug', 'menuCode',
    'menuName', 'oldUrl', 'publishedAt', 'slug', 'title']);
  assert.equal(open.body.items[0].oldUrl, null, 'the address of the legacy site stays out of the open list');
  assert.equal(JSON.stringify(open.body).includes('PAID_SENTINEL'), false, 'the paid text must not reach the open list');
  assert.equal(JSON.stringify(open.body).includes('FREE_PART'), false);
  assert.equal((await request('/guides-archive/public/list?q=PAID_SENTINEL_BODY_TEXT')).body.total, 0,
    'a guest search must not tell whether a word stands in the paid text');
  assert.equal((await request('/guides-archive/public/list?q=%D0%9E%D1%82%D0%BA%D1%80%D1%8B%D1%82%D0%BE%D0%B5')).body.total, 1);
  assert.equal((await request('/guides-archive/public/list?kind=meta')).body.total, 1);
  assert.equal((await request('/guides-archive?q=PAID_SENTINEL_BODY_TEXT', { headers })).body.total, 1,
    'a subscriber keeps the full-text search');

  // A guide without a description is described by its open part: never by the start of the body text, which may be the paid part.
  database.prepare(`INSERT INTO guides VALUES (4, 'no-description', '/guides/no-description', 400, NULL, 'Без описания', '',
    '', NULL, 'Арена', 'arena', 'Гайды', 'guides', '', ?, ?, ?, 0)`).run(
    `<p>FREE_START ${'слово '.repeat(10)}</p>`, `<p>${'слово '.repeat(300)}PAID_DEEP_SENTINEL</p>`,
    `PAID_BODY_TEXT_FIRST ${'слово '.repeat(300)}`);
  const described = await request('/guides-archive/public/list');
  const noDescription = described.body.items.find((item: any) => item.slug === 'no-description');
  assert.match(noDescription.description, /^FREE_START слово/, 'described by the open part');
  assert.equal(JSON.stringify(described.body).includes('PAID_'), false, 'no paid text in the list, whatever the description is');
  const describedTeaser = await request('/guides-archive/teaser/no-description');
  assert.match(describedTeaser.body.description, /^FREE_START слово/);
  assert.equal(JSON.stringify(describedTeaser.body).includes('PAID_'), false);

  // Stale copy of the same request, else 503 with Retry-After; never a 500 and never an empty list.
  const flaky = async (path: string) => fetch(`${origin(flakyServer)}${path}`);
  assert.equal((await flaky('/guides-archive/public/list?page=1')).status, 200);
  databaseDown = true;
  const stale = await flaky('/guides-archive/public/list?page=1');
  assert.equal(stale.status, 200);
  assert.equal((await stale.json() as any).warning, 'stale');
  const none = await flaky('/guides-archive/public/list?page=2');
  assert.equal(none.status, 503);
  assert.equal(none.headers.get('retry-after'), '60');
  databaseDown = false;

  const failedList = await fetch(`${origin(failingServer)}/guides-archive`);
  assert.equal(failedList.status, 500);
  assert.deepEqual(await failedList.json(), { error: 'Не удалось загрузить архив гайдов' });

  const failedDetail = await fetch(`${origin(failingServer)}/guides-archive/example`);
  assert.equal(failedDetail.status, 500);
  assert.deepEqual(await failedDetail.json(), { error: 'Не удалось загрузить гайд' });

  const failedTeaser = await fetch(`${origin(failingServer)}/guides-archive/teaser/example`);
  assert.equal(failedTeaser.status, 500);
} finally {
  await Promise.all([server, failingServer, flakyServer].map(instance => new Promise<void>((resolve, reject) => (
    instance.close(error => error ? reject(error) : resolve())
  ))));
  database.close();
}

await import('./guides-archive-excerpt-cases.js');

console.log('guides archive router contract tests passed');
