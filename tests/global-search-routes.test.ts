import assert from 'node:assert/strict';
import express from 'express';
import {
  createGlobalSearchRouter,
  searchGlobalContent,
  type GlobalSearchDependencies,
} from '../server/globalSearchRoutes.js';

const articles = [
  {
    id: 'article-standard',
    title: 'Господство нового архетипа',
    excerpt: 'Большой разбор стандартной меты.',
    tag: 'Мета-отчет',
    mode: 'standard',
    date: '2026-07-18',
    url: 'https://vip.example/standard-guide',
    image: 'https://kolodahearthstone.ru/wp-content/uploads/standard.webp',
  },
  {
    id: 'article-arena',
    title: 'Первый обзор Арены',
    excerpt: 'Выбор сильнейшего класса.',
    tag: 'Арена',
    mode: 'arena',
    date: '2026-07-09',
    url: 'https://example.test/arena-guide',
    image: '/arena.webp',
  },
];

const standardCards = [
  {
    card_id: 'JAIL_407',
    name: { ru: 'Главарь Ванесса', en: 'Vanessa the Ringleader' },
    text: { ru: '<b>Подготовка</b>. Получите существо с Боевым кличем.', en: 'Prepare.' },
    class: 'NEUTRAL',
    dbf: 127319,
    card_set: 'ESCAPEFROM_VIOLET_HOLD',
    card_type: { slug: 'MINION', name_ru: 'Существо' },
    mana_cost: 6,
    images: { card: 'https://db.kolodahs.ru/uploads/cards/vanessa-card.png', crop: '/vanessa-crop.png' },
    mechanics: ['PREPARE'],
  },
];

const wildCards = [
  standardCards[0],
  {
    card_id: 'WILD_001',
    name: { ru: 'Дикий хранитель', en: 'Wild Keeper' },
    text: { ru: 'Редкая вольная карта.', en: 'A rare Wild card.' },
    class: 'DRUID',
    card_set: 'TITANS',
    card_type: { slug: 'MINION', name_ru: 'Существо' },
    mana_cost: 4,
    images: { card: '/wild-card.png', crop: '/wild-crop.png' },
  },
];

const deepCardMatch = searchGlobalContent({
  query: 'подготовка',
  articles,
  cardsByFormat: { standard: standardCards, wild: wildCards },
  getArticleMode: article => String(article.mode || 'general'),
  isVipArticleUrl: value => new URL(value).hostname === 'vip.example',
});
assert.equal(deepCardMatch.cards.length, 1, 'card rules text must participate in deep search');
assert.deepEqual(deepCardMatch.cards[0].formats, ['standard', 'wild'], 'the same card must be deduplicated across formats');
assert.equal(deepCardMatch.cards[0].path, '/standard/cards/standard/JAIL_407');
assert.equal(deepCardMatch.cards[0].image, '/api/card-image/127319/thumb.webp');

const articleMatch = searchGlobalContent({
  query: 'архетипа',
  articles,
  cardsByFormat: { standard: standardCards, wild: wildCards },
  getArticleMode: article => String(article.mode || 'general'),
  isVipArticleUrl: value => new URL(value).hostname === 'vip.example',
});
assert.equal(articleMatch.articles.length, 1);
assert.equal(articleMatch.articles[0].mode, 'standard');
assert.equal(articleMatch.articles[0].vip, true);
assert.equal(
  articleMatch.articles[0].image,
  '/api/article-cover?url=https%3A%2F%2Fkolodahearthstone.ru%2Fwp-content%2Fuploads%2Fstandard.webp',
);
assert.doesNotMatch(articleMatch.articles[0].excerpt, /<[^>]+>/, 'search snippets must be plain text');

let cardLoads = 0;
const dependencies: GlobalSearchDependencies = {
  loadArticles: () => ({ data: { articles }, etag: 'articles' }),
  loadCards: async format => {
    cardLoads += 1;
    return {
      cards: format === 'standard' ? standardCards : wildCards,
      updatedAt: '2026-07-19T00:00:00.000Z',
      sourceUrl: 'https://example.test/cards',
      cacheSource: 'fresh',
      dataStatus: 'fresh',
      partial: false,
      datasetVersion: `ccc1-sha256:${'1'.repeat(64)}`,
      catalogVerifiedAt: '2026-07-19T00:00:00.000Z',
      catalogPublishedAt: '2026-07-19T00:00:00.000Z',
    };
  },
  getArticleMode: article => String(article.mode || 'general'),
  isVipArticleUrl: value => new URL(value).hostname === 'vip.example',
  cacheHeader: 'public, max-age=60, stale-while-revalidate=120',
};

const app = express();
app.use('/api', createGlobalSearchRouter(dependencies));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});

try {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}/api`;

  const shortResponse = await fetch(`${origin}/search?q=%D0%B2`);
  const shortBody = await shortResponse.json() as any;
  assert.equal(shortResponse.status, 200);
  assert.deepEqual(shortBody, { query: 'в', articles: [], cards: [], minimumQueryLength: 2 });
  assert.equal(cardLoads, 0, 'short queries must not load the card catalogs');

  const response = await fetch(`${origin}/search?q=${encodeURIComponent('ванесса')}`);
  const body = await response.json() as any;
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') || '', /^public/);
  assert.equal(body.cards.length, 1);
  assert.equal(body.cards[0].name, 'Главарь Ванесса');
  assert.deepEqual(body.cards[0].formats, ['standard', 'wild']);
  assert.equal(body.articles.length, 0);
  assert.equal(cardLoads, 2);

  const boundedResponse = await fetch(`${origin}/search?q=${'x'.repeat(140)}`);
  const boundedBody = await boundedResponse.json() as any;
  assert.equal(boundedBody.query.length, 80, 'public search input must be length-bounded');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('global search router contract tests passed');
