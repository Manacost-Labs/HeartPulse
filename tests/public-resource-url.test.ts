import assert from 'node:assert/strict';
import { publicResourceImageUrl, publicResourceUrl } from '../src/publicResourceUrl.js';

assert.equal(
  publicResourceUrl('https://db.kolodahs.ru/uploads/cards/TEST.png?v=2'),
  '/api/public-resource/db/uploads/cards/TEST.png?v=2',
);
assert.equal(
  publicResourceUrl('https://hearthstone.wiki.gg/images/thumb/a/ab/Card.jpg/800px-Card.jpg'),
  '/api/public-resource/wiki/images/thumb/a/ab/Card.jpg/800px-Card.jpg',
);
assert.equal(
  publicResourceUrl('https://hearthstone.wiki.gg/wiki/Card'),
  'https://hearthstone.wiki.gg/wiki/Card',
  'ordinary external navigation links must not be converted into media requests',
);
assert.equal(
  publicResourceUrl('https://evil.example/image.png'),
  'https://evil.example/image.png',
  'unknown origins must not be routed through the proxy',
);
assert.equal(publicResourceUrl('/uploads/local.png'), '/uploads/local.png');
assert.equal(
  publicResourceUrl('/api/public-resource/hsjson/v1/tiles/TEST.webp'),
  '/api/public-resource/hsjson/v1/tiles/TEST.webp',
);
assert.equal(
  publicResourceImageUrl('https://db.kolodahs.ru/uploads/cards/TEST.png?v=2', { width: 384 }),
  '/api/public-resource/db/uploads/cards/TEST.png?v=2&width=384&quality=82&format=webp',
);

console.log('public resource URL tests passed');
