import assert from 'node:assert/strict';
import { articleImageSrc } from '../shared/articleImageSrc';

assert.equal(
  articleImageSrc('https://kolodahearthstone.ru/wp-content/uploads/2026/07/cover.jpg'),
  '/api/article-cover?url=https%3A%2F%2Fkolodahearthstone.ru%2Fwp-content%2Fuploads%2F2026%2F07%2Fcover.jpg',
);
assert.equal(
  articleImageSrc('https://www.hs-manacost.ru/uploads/cover.png?version=2'),
  '/api/article-cover?url=https%3A%2F%2Fwww.hs-manacost.ru%2Fuploads%2Fcover.png%3Fversion%3D2',
);
assert.equal(articleImageSrc('/uploads/admin/cover.webp'), '/uploads/admin/cover.webp');
assert.equal(
  articleImageSrc('https://evil.example/cover.png'),
  'https://evil.example/cover.png',
  'unknown hosts must not be relayed through the article cover proxy',
);
assert.equal(
  articleImageSrc('http://kolodahearthstone.ru/cover.png'),
  'http://kolodahearthstone.ru/cover.png',
  'the proxy must only relay HTTPS sources',
);

console.log('article image source tests passed');
