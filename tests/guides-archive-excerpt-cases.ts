import assert from 'node:assert/strict';
import express from 'express';
import { createGuidesArchiveRouter } from '../server/guidesArchiveRoutes.js';
import { publicGuideTeaser } from '../apps/public-web/lib/publicGuideTeaserData.js';
import { buildGuideStructuredData } from '../apps/public-web/lib/publicGuideTeaserStructuredData.js';
import { SENTINEL, countWords, createGuideExcerptDatabase } from './helpers/guideExcerptFixture.js';

// The open part of a guide: what leaves the server for a guest, and what never does.
const database = createGuideExcerptDatabase();
const app = express();
app.use('/api', createGuidesArchiveRouter({
  getDatabase: () => database,
  accessGuard: (request, response, next) => (request.headers['x-test-access'] === 'yes'
    ? next() : void response.status(401).json({ error: 'Требуется подписка' })),
  publicUrl: 'https://legacy.example.test', logError: () => {},
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api/guides-archive`;
const teaserOf = async (slug: string) => {
  const response = await fetch(`${base}/teaser/${slug}`);
  assert.equal(response.status, 200);
  return { text: await response.text() };
};

try {
  const { text } = await teaserOf('sentinel-guide');
  const projection = JSON.parse(text);

  // Sentinel: a unique word past the 250th never reaches a guest, in the projection or in what is built from it.
  assert.equal(text.includes(SENTINEL), false, 'projection');
  assert.equal(text.includes('платно0'), false, 'paid text');
  assert.equal(text.includes('AAEBAZICAA8PAAAA'), false, 'deck code');
  assert.equal(text.includes('deck.png'), false, 'deck picture');
  const teaser = publicGuideTeaser(projection, 'sentinel-guide');
  const structured = JSON.stringify(buildGuideStructuredData(teaser, '/share/articles.png'));
  assert.equal(structured.includes(SENTINEL), false, 'JSON-LD');
  assert.equal(structured.includes('articleBody') || structured.includes('wordCount'), false);

  // Only whitelisted fields; nothing that measures the closed part.
  assert.deepEqual(Object.keys(projection).sort(), ['description', 'excerptHtml', 'hasPaid', 'image', 'indexable',
    'kind', 'kindSlug', 'menuName', 'publishedAt', 'slug', 'title', 'toc', 'updatedAt']);
  const openWords = countWords(projection.excerptHtml);
  assert.ok(openWords >= 150 && openWords <= 200, `open part has ${openWords} words`);
  assert.match(projection.excerptHtml, /^<p>[^<]+<\/p><h2 id="guide-heading-1">Вступление<\/h2><p>[^<]+\.<\/p>$/,
    'ends on a sentence, closed, no picture or code of a deck');
  assert.equal(projection.hasPaid, true);
  assert.equal(projection.indexable, true);
  // The outline is open on purpose, paid headings included.
  assert.deepEqual(projection.toc, [
    { id: 'guide-heading-1', text: 'Вступление', level: 2 },
    { id: 'guide-heading-2', text: 'Платная глава', level: 2 },
    { id: 'guide-heading-3', text: 'Колоды', level: 3 },
  ]);

  // A subscriber gets the whole text through the full route, and its anchors are the outline's.
  const full = await (await fetch(`${base}/sentinel-guide`, { headers: { 'X-Test-Access': 'yes' } })).json() as { contentHtml: string };
  assert.ok(full.contentHtml.includes(SENTINEL));
  for (const entry of projection.toc) assert.ok(full.contentHtml.includes(`id="${entry.id}"`), entry.id);
  assert.ok(full.contentHtml.startsWith(projection.excerptHtml.replace(/<\/p>$/, '').slice(0, 200)),
    'the full text begins with the open part');

  // A guide that fits the open part: nothing is paid, so the markup points at no closed block.
  const fits = JSON.parse((await teaserOf('fits-guide')).text);
  assert.equal(countWords(fits.excerptHtml), 170);
  assert.equal(fits.hasPaid, false);
  assert.deepEqual(fits.toc, []);
  const fitsLd = buildGuideStructuredData(publicGuideTeaser(fits, 'fits-guide'), '/share/articles.png')['@graph'][0] as Record<string, unknown>;
  assert.equal(fitsLd.isAccessibleForFree, true);
  assert.equal('hasPart' in fitsLd, false);
  // Deck pictures are paid: a guide that fits but has one still has a closed block.
  assert.equal(JSON.parse((await teaserOf('fits-with-deck')).text).hasPaid, true);

  // A first paragraph longer than the range is cut at a sentence.
  const long = JSON.parse((await teaserOf('long-first-paragraph')).text);
  assert.equal(countWords(long.excerptHtml), 200);
  assert.match(long.excerptHtml, /длинный199\.<\/p>$/);

  // Below 150 own words: not indexable, and it is the same fact the sitemap uses.
  const short = JSON.parse((await teaserOf('short-guide')).text);
  assert.equal(short.indexable, false);
  assert.equal(countWords(short.excerptHtml), 95);

  const ld = buildGuideStructuredData(teaser, '/share/articles.png')['@graph'];
  assert.deepEqual(ld[0], {
    '@type': 'Article', '@id': 'https://hearthpulse.net/guides-archive/sentinel-guide/#article',
    mainEntityOfPage: 'https://hearthpulse.net/guides-archive/sentinel-guide/',
    headline: 'Гайд с платной частью', description: 'Описание sentinel-guide',
    image: ['https://legacy.example.test/images/a.png'],
    datePublished: '2017-10-10T20:40:00Z', dateModified: '2017-10-10T20:40:00Z', inLanguage: 'ru',
    author: { '@id': 'https://hearthpulse.net/#org' }, publisher: { '@id': 'https://hearthpulse.net/#org' },
    isAccessibleForFree: false,
    hasPart: [{ '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.guide-archive-paid' }],
  });
  assert.deepEqual((ld[1] as { itemListElement: Array<{ name: string }> }).itemListElement.map(item => item.name),
    ['Главная', 'Архив гайдов', 'Гайд с платной частью']);

  // No deck code in any open field, whichever way it reaches a heading; headings keep only their words.
  const toc = JSON.parse((await teaserOf('toc-code-guide')).text);
  assert.deepEqual(toc.toc.map((entry: { text: string }) => entry.text), ['Раздел', 'Колода дня']);
  for (const slug of ['sentinel-guide', 'fits-guide', 'long-first-paragraph', 'short-guide', 'fits-with-deck', 'toc-code-guide']) {
    const open = JSON.parse((await teaserOf(slug)).text);
    assert.equal(/AAE[A-Za-z0-9+/=]{20,}/.test(JSON.stringify([open.toc, open.excerptHtml, open.description])), false, slug);
  }

  // The Next side refuses an open part that carries anything the sanitizer cannot emit.
  for (const excerptHtml of ['<script>x</script>', '<p onclick="x">a</p>', '<a href="javascript:x">a</a>', '<p>a < b</p>']) {
    assert.throws(() => publicGuideTeaser({ ...projection, excerptHtml }, 'sentinel-guide'), /Invalid public guide teaser/, excerptHtml);
  }
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  database.close();
}
