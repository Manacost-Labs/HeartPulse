import assert from 'node:assert/strict';
import {
  articleOrderOptions,
  articleReadsCell,
  articleReadsSummary,
  indexArticleReads,
  orderArticles,
  type ArticleReads,
} from '../src/features/adminArticleReadsModel.js';
import type { Article } from '../src/features/adminContentListModel.js';
import { pluralRu } from '../src/shared/text/pluralRu.js';

const forms = (count: number) => pluralRu(count, 'открытие', 'открытия', 'открытий');
assert.deepEqual([0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111, 112].map(forms), [
  'открытий', 'открытие', 'открытия', 'открытия', 'открытий', 'открытий', 'открытий', 'открытий',
  'открытие', 'открытия', 'открытий', 'открытие', 'открытий', 'открытий',
]);

const NOW = new Date('2026-09-30T12:00:00');
const reads: ArticleReads = {
  days: 30,
  since: '2026-05-01T10:00:00',
  totals: { opens: 26, readers: 14 },
  articles: [
    { articleId: 'a', opens: 21, readers: 12, opensTotal: 40, readersTotal: 20, lastOpenedAt: '2026-09-30T09:00:00' },
    { articleId: 'b', opens: 5, readers: 2, opensTotal: 5, readersTotal: 2, lastOpenedAt: '2026-09-29T09:00:00' },
    { articleId: 'c', opens: 0, readers: 0, opensTotal: 3, readersTotal: 1, lastOpenedAt: '2026-06-02T09:00:00' },
  ],
};
const index = indexArticleReads(reads);

assert.deepEqual(articleReadsCell(index.get('a'), reads), { label: '21 открытие · 12 человек', detail: 'всего 40 открытий' });
assert.deepEqual(articleReadsCell(index.get('b'), reads), { label: '5 открытий · 2 человека', detail: '' });
assert.deepEqual(articleReadsCell(index.get('c'), reads), { label: 'за 30 дней не открывали', detail: 'всего 3 открытия · последнее 02.06.2026' });
assert.deepEqual(articleReadsCell(index.get('missing'), reads), { label: 'не открывали', detail: '' });
// A failed request must not read as «nobody opened it».
assert.deepEqual(articleReadsCell(undefined, null), { label: '—', detail: 'нет данных о чтении' });
assert.equal(indexArticleReads(null).size, 0);

assert.equal(articleReadsSummary(reads, NOW), 'открытий за 30 дней: 26 (14 человек)');
assert.equal(articleReadsSummary({ ...reads, since: '2026-09-28T10:00:00', totals: { opens: 1, readers: 1 } }, NOW), 'открытий за 30 дней: 1 (1 человек), считаем с 28.09.2026');
assert.equal(articleReadsSummary({ ...reads, since: null, totals: { opens: 0, readers: 0 }, articles: [] }, NOW), 'открытия статей подписчиками начнут считаться с первого чтения');
assert.equal(articleReadsSummary(null, NOW), '');

const article = (id: string): Article => ({ id, title: id, date: '2026-09-01' });
const list = ['new', 'c', 'b', 'a'].map(article);
const ids = (items: Article[]) => items.map(item => item.id).join(',');
assert.equal(ids(orderArticles(list, 'date', index)), 'new,c,b,a');
// Most opened in the window first, then by retained total; unread articles keep their date order.
assert.equal(ids(orderArticles(list, 'reads', index)), 'a,b,c,new');
assert.equal(ids(list), 'new,c,b,a', 'the source list is not mutated');

assert.deepEqual(articleOrderOptions(reads).map(option => option.id), ['date', 'reads']);
assert.deepEqual(articleOrderOptions({ ...reads, articles: [] }), []);
assert.deepEqual(articleOrderOptions(null), []);

console.log('admin article reads model: ok');
