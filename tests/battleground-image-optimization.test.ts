import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  battlegroundImageTransformCacheKey,
  battlegroundImageTransformFromQuery,
  optimizeBattlegroundImage,
} from '../server/battlegroundImageOptimization.js';
import { optimizedBattlegroundThumbnailUrl } from '../src/features/battlegroundImageUrls.js';

const transform = battlegroundImageTransformFromQuery({
  width: '220',
  quality: '76',
  format: 'webp',
});
assert.deepEqual(transform, { width: 220, quality: 76, format: 'webp' });
assert.equal(battlegroundImageTransformCacheKey(transform!), 'webp:w220:q76');
assert.equal(battlegroundImageTransformFromQuery({}), null);
assert.deepEqual(
  battlegroundImageTransformFromQuery({ width: '9999', quality: '2' }),
  { width: 512, quality: 55, format: 'webp' },
);

const source = await sharp({
  create: {
    width: 404,
    height: 558,
    channels: 4,
    background: { r: 92, g: 48, b: 120, alpha: 1 },
  },
}).png().toBuffer();
const optimized = await optimizeBattlegroundImage(source, transform!);
const metadata = await sharp(optimized.body).metadata();
assert.equal(optimized.contentType, 'image/webp');
assert.equal(metadata.format, 'webp');
assert.equal(metadata.width, 220);
assert.ok((metadata.height || 0) <= 304);
assert.ok(optimized.body.length < source.length);

const legacyUrl = optimizedBattlegroundThumbnailUrl(
  'https://bg.kolodahearthstone.ru/api/remote-image?src=https%3A%2F%2Fexample.cloudfront.net%2Fcard.png',
  220,
);
assert.equal(
  legacyUrl,
  '/api/remote-image?src=https%3A%2F%2Fexample.cloudfront.net%2Fcard.png&width=220&quality=76&format=webp',
);

assert.equal(
  optimizedBattlegroundThumbnailUrl(
    'https://bg.kolodahearthstone.ru/assset/cards/BG_TEST.webp',
    160,
  ),
  '/api/public-resource/bg/assset/cards/BG_TEST.webp?width=160&quality=76&format=webp',
);

const externalUrl = optimizedBattlegroundThumbnailUrl('https://art.hearthstonejson.com/card.png', 160);
const parsedExternal = new URL(externalUrl, 'https://arena.hs-manacost.ru');
assert.equal(parsedExternal.pathname, '/api/remote-image');
assert.equal(parsedExternal.searchParams.get('src'), 'https://art.hearthstonejson.com/card.png');
assert.equal(parsedExternal.searchParams.get('width'), '160');
assert.equal(optimizedBattlegroundThumbnailUrl('/arena-logo-icon.webp', 220), '/arena-logo-icon.webp');

console.log('battleground image optimization tests passed');
