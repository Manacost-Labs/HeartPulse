import assert from 'node:assert/strict';
import { articleImageSrc, canonicalArticleUrl } from '../shared/articleImageSrc';

assert.equal(
  canonicalArticleUrl('https://kolodahearthstone.ru/guide/?source=legacy#part'),
  'https://kolodahearthstone.com/guide/?source=legacy#part',
  'legacy article links must be exposed through the canonical .com host',
);
assert.equal(
  canonicalArticleUrl('https://www.kolodahearthstone.ru/guide/'),
  'https://kolodahearthstone.com/guide/',
);
assert.equal(
  canonicalArticleUrl('https://external.example/guide/'),
  'https://external.example/guide/',
  'unrelated article hosts must stay unchanged',
);

assert.equal(
  articleImageSrc('https://kolodahearthstone.com/wp-content/uploads/2026/07/cover.jpg'),
  '/api/article-cover?url=https%3A%2F%2Fkolodahearthstone.com%2Fwp-content%2Fuploads%2F2026%2F07%2Fcover.jpg',
);
assert.equal(
  articleImageSrc('https://kolodahearthstone.ru/wp-content/uploads/legacy-cover.jpg'),
  '/api/article-cover?url=https%3A%2F%2Fkolodahearthstone.ru%2Fwp-content%2Fuploads%2Flegacy-cover.jpg',
  'legacy .ru article images must keep working during the migration',
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
  articleImageSrc('https://manacost.ru/uploads/cover.png'),
  'https://manacost.ru/uploads/cover.png',
  'the unrelated bare Manacost host must never be relayed through HearthPulse',
);
assert.equal(
  articleImageSrc('http://kolodahearthstone.ru/cover.png'),
  'http://kolodahearthstone.ru/cover.png',
  'the proxy must only relay HTTPS sources',
);

console.log('article image source tests passed');
