import assert from 'node:assert/strict';
import {
  EMPTY_ARTICLE_DRAFT,
  activeChip,
  articleDraftError,
  articleIssueLabels,
  articleIssueOptions,
  articleLinkLabel,
  articleMode,
  articleModeOptions,
  articlePublishingSummary,
  articleTagSuggestions,
  articleVotesLabel,
  draftFromArticle,
  filterArticles,
  filterGalleryItems,
  formatContentDate,
  galleryFileLabel,
  isArticleDraftChanged,
  type Article,
  type GalleryItem,
} from '../src/features/adminContentListModel.js';

const article = (id: string, values: Partial<Article> = {}): Article => ({
  id, title: `Статья ${id}`, date: '2026-09-20', tag: 'Мета-отчет', mode: 'standard',
  excerpt: 'Описание', image: '/uploads/cover.webp', url: 'https://kolodahearthstone.com/vip/', ...values,
});

const articles = [
  article('a', { date: '2026-09-29', likes: 2 }),
  article('b', { mode: 'arena', tag: 'Арена', excerpt: '', date: '2026-09-11' }),
  article('c', { mode: 'arena', tag: 'Арена', url: '#', image: '', date: '2026-08-01' }),
  article('d', { mode: undefined, tag: '', excerpt: '  ', date: '2026-05-02' }),
];

// Mode chips list only the modes in use; an article without a mode is a general one.
assert.deepEqual(articleModeOptions(articles), [
  { id: 'all', label: 'Все', count: 4 },
  { id: 'arena', label: 'Арена', count: 2 },
  { id: 'standard', label: 'Стандарт', count: 1 },
  { id: 'general', label: 'Общий', count: 1 },
]);
assert.equal(articleMode(articles[3]).access, 'любая подписка');
assert.equal(articleMode(articles[0]).access, 'план «Алмаз» и выше');

// Card-quality chips appear only while something is missing.
assert.deepEqual(articleIssueOptions(articles), [
  { id: 'all', label: 'Любая карточка', count: 4 },
  { id: 'ready', label: 'Заполнены', count: 1 },
  { id: 'no-excerpt', label: 'Без описания', count: 2 },
  { id: 'no-link', label: 'Без ссылки', count: 1 },
  { id: 'no-image', label: 'Без обложки', count: 1 },
]);
assert.deepEqual(articleIssueOptions([articles[0]]), []);
// A chip that disappears (its last article was fixed or deleted) must not keep filtering an empty list.
assert.equal(activeChip(articleIssueOptions(articles), 'no-image', 'all'), 'no-image');
assert.equal(activeChip(articleIssueOptions([articles[0]]), 'no-image', 'all'), 'all');
assert.equal(activeChip(articleModeOptions([articles[0]]), 'arena', 'all'), 'all');
assert.deepEqual(articleIssueLabels(articles[2]), ['нет ссылки', 'нет обложки']);
assert.deepEqual(articleIssueLabels(articles[0]), []);

const ids = (list: Article[]) => list.map(item => item.id).join('');
assert.equal(ids(filterArticles(articles, { search: '', mode: 'all', issue: 'all' })), 'abcd');
assert.equal(ids(filterArticles(articles, { search: '', mode: 'arena', issue: 'all' })), 'bc');
assert.equal(ids(filterArticles(articles, { search: '', mode: 'general', issue: 'no-excerpt' })), 'd');
assert.equal(ids(filterArticles(articles, { search: '', mode: 'all', issue: 'ready' })), 'a');
assert.equal(ids(filterArticles(articles, { search: '  АРЕНА ', mode: 'all', issue: 'no-image' })), 'c');
assert.equal(ids(filterArticles(articles, { search: 'kolodahearthstone', mode: 'standard', issue: 'all' })), 'a');
assert.equal(ids(filterArticles(articles, { search: 'нет такой', mode: 'all', issue: 'all' })), '');

assert.equal(formatContentDate('2026-09-29'), '29.09.2026');
// A timestamp is shown as the local day; one without an offset is local in every time zone.
assert.equal(formatContentDate('2026-07-11T12:00:00'), '11.07.2026');
assert.equal(formatContentDate('не дата'), 'не дата');
assert.equal(formatContentDate(''), '—');
assert.equal(articleLinkLabel('https://www.kolodahearthstone.com/vip/?a=1'), 'kolodahearthstone.com');
assert.equal(articleLinkLabel('/articles/qa-1'), '/articles/qa-1');
assert.equal(articleLinkLabel('#'), 'ссылка не указана');
assert.equal(articleLinkLabel(undefined), 'ссылка не указана');
assert.equal(articleVotesLabel(articles[0]), '2 за · 0 против');
assert.equal(articleVotesLabel(articles[1]), 'оценок нет');

// The summary counts publications of the last 30 days relative to the given moment.
assert.equal(articlePublishingSummary(articles, new Date('2026-09-30T10:00:00.000Z')), 'последняя публикация 29.09.2026 · статей за 30 дней: 2');
assert.equal(articlePublishingSummary(articles, new Date('2026-12-01T00:00:00.000Z')), 'последняя публикация 29.09.2026 · статей за 30 дней: 0');
assert.equal(articlePublishingSummary([], new Date('2026-09-30T10:00:00.000Z')), '');

// Editing starts from the stored article; an unknown mode falls back to the general one.
const draft = draftFromArticle(articles[3]);
assert.deepEqual(draft, { title: 'Статья d', tag: '', date: '2026-05-02', excerpt: '  ', mode: 'general', image: '/uploads/cover.webp', url: 'https://kolodahearthstone.com/vip/' });
assert.equal(isArticleDraftChanged(draft, draftFromArticle(articles[3])), false);
assert.equal(isArticleDraftChanged({ ...draft, excerpt: 'Новое описание' }, draft), true);

assert.equal(articleDraftError(EMPTY_ARTICLE_DRAFT), 'Укажите название статьи.');
assert.equal(articleDraftError({ ...EMPTY_ARTICLE_DRAFT, title: 'Т' }), '');
assert.equal(articleDraftError({ ...EMPTY_ARTICLE_DRAFT, title: 'Т', url: '/articles/one' }), '');
assert.equal(articleDraftError({ ...EMPTY_ARTICLE_DRAFT, title: 'Т', url: 'https://example.test/a' }), '');
for (const url of ['javascript:alert(1)', '//evil.example/a', 'example.test/a']) {
  assert.match(articleDraftError({ ...EMPTY_ARTICLE_DRAFT, title: 'Т', url }), /Ссылка должна начинаться/);
}

assert.deepEqual(articleTagSuggestions(articles), ['Арена', 'Мета-отчет']);

const art = (id: string, values: Partial<GalleryItem> = {}): GalleryItem => ({
  id, title: `Арт ${id}`, previewUrl: '', thumbUrl: '', imageUrl: '', downloadUrl: '', createdAt: '2026-07-11T00:00:00.000Z', ...values,
});
assert.equal(galleryFileLabel({ width: 1920, height: 1080, bytes: 125_000, format: 'webp' }), '1920 × 1080 · 122 КБ · WEBP');
assert.equal(galleryFileLabel({ bytes: 12 * 1024 * 1024 }), '12 МБ');
assert.equal(galleryFileLabel({}), 'размер не указан');
const gallery = [art('1', { tag: 'Обложка', source: 'Blizzard' }), art('2', { description: 'Фан-арт паладина' })];
assert.equal(filterGalleryItems(gallery, '').length, 2);
assert.deepEqual(filterGalleryItems(gallery, 'blizzard').map(item => item.id), ['1']);
assert.deepEqual(filterGalleryItems(gallery, 'ПАЛАДИН').map(item => item.id), ['2']);
assert.equal(filterGalleryItems(gallery, 'нет').length, 0);

console.log('admin content lists model: ok');
