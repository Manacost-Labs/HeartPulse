import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { ARTICLE_COVER_WIDTHS as SERVER_WIDTHS } from '../server/articleCoverRoutes.js';
import type { Article } from '../src/modules/articles/public';
import { ARTICLE_COVER_WIDTHS, responsiveArticleCover } from '../src/modules/articles/model/articleCover';
import { HOME_ARTICLE_COVER_WIDTHS, responsiveHomeCover } from '../src/modules/home/model/articleCover';

// Node checks markup; CSS geometry is verified by the paired browser test.
const styles = registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier.endsWith('.css')
    ? { url: 'data:text/javascript,export{}', shortCircuit: true }
    : nextResolve(specifier, context);
} });
const { ArticlesTab } = await import('../src/modules/articles/public');
styles.deregister();

// The article UI and the home teasers keep their own copy of the width list
// (module boundaries prefer that to a cross-module import); the server
// rejects any other width, so the three lists must stay equal.
assert.deepEqual([...ARTICLE_COVER_WIDTHS], [...SERVER_WIDTHS]);
assert.deepEqual([...HOME_ARTICLE_COVER_WIDTHS], [...SERVER_WIDTHS]);

const proxied = '/api/article-cover?url=https%3A%2F%2Fkolodahearthstone.com%2Fwp-content%2Fuploads%2F2026%2F09%2Fcover.png';
const variantsOf = (base: string) => ({
  src: `${base}&w=960`,
  srcSet: `${base}&w=480 480w, ${base}&w=720 720w, ${base}&w=960 960w`,
  avifSrcSet: `${base}&w=480&format=avif 480w, ${base}&w=720&format=avif 720w, ${base}&w=960&format=avif 960w`,
});
const variants = variantsOf(proxied);

for (const responsive of [responsiveArticleCover, responsiveHomeCover]) {
  assert.deepEqual(responsive(proxied), variants, 'a proxied cover offers every allowlisted width');
  // Admin uploads are stored up to 1800 px wide; production covers were 1176 px for a 560 px card.
  assert.deepEqual(responsive('/uploads/admin/mvau7mzp-b38fa86861.webp'),
    variantsOf('/api/article-cover?upload=mvau7mzp-b38fa86861.webp'), 'an admin upload offers every allowlisted width');
  for (const other of ['/uploads/admin/Cover.webp', '/uploads/admin/cover.png', '/uploads/admin/a/b.webp', '/uploads/other/cover.webp']) {
    assert.deepEqual(responsive(other), { src: other }, `${other} is not a generated upload name`);
  }
  assert.deepEqual(responsive('https://evil.example/cover.png'), { src: 'https://evil.example/cover.png' });
  assert.deepEqual(responsive(''), { src: '' });
  assert.deepEqual(responsive('/api/article-cover?url=a,b'), { src: '/api/article-cover?url=a,b' },
    'a URL that would split a srcset candidate gets no srcset');
}
assert.deepEqual(
  responsiveArticleCover('https://kolodahearthstone.com/wp-content/uploads/2026/09/cover.png'),
  variants,
  'an absolute editorial URL is proxied before the variants are built',
);

const article = (id: string): Article => ({
  id,
  title: `Статья ${id}`,
  date: '2026-09-30',
  image: proxied,
  excerpt: '',
  tag: 'Арена',
  url: 'https://example.test/article/',
});
const html = renderToStaticMarkup(
  <ArticlesTab data={{ articles: [article('1'), article('2'), article('3')], updatedAt: null }}
    loading={false} onNavigate={() => undefined} />,
);
const images = [...html.matchAll(/<img [^>]*>/g)].map(match => match[0]);
const pictures = [...html.matchAll(/<picture class="contents"><source type="image\/avif" srcSet="([^"]+)" sizes="([^"]+)"\/><img /g)];
assert.equal(pictures.length, 3, 'every cover offers AVIF first, inside a box-less <picture>');
for (const [, srcSet, sizes] of pictures) {
  assert.equal(srcSet.replace(/&amp;/g, '&'), variants.avifSrcSet);
  assert.ok(sizes.length > 0);
}
assert.equal(images.length, 3);
const [lead, ...rest] = images;
assert.match(lead, /loading="eager"/, 'the first cover is the LCP candidate and loads eagerly');
assert.match(lead, /fetchPriority="high"/i);
for (const image of images) {
  assert.match(image, /srcSet="[^"]*480w, [^"]*720w, [^"]*960w"/i);
  assert.match(image, /sizes="[^"]+"/);
  assert.match(image, /width="1176"/);
  assert.match(image, /height="597"/);
}
const cards = [...html.matchAll(/<article [^>]*class="([^"]*)"/g)].map(match => match[1].split(' '));
assert.equal(cards[0].includes('anim-scale-in'), false, 'the card holding the LCP cover does not enter');
assert.ok(cards.slice(1).every(classes => classes.includes('anim-scale-in')), 'the other cards keep their entrance');
for (const image of rest) {
  assert.match(image, /loading="lazy"/, 'covers after the first stay lazy');
  assert.match(image, /decoding="async"/);
  assert.doesNotMatch(image, /fetchPriority/i);
}

console.log('article cover markup tests passed');
