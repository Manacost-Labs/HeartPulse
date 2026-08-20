import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  activateDeferredCardImage,
  cardGalleryPriorityCount,
  CARD_GALLERY_IMAGE_ROOT_MARGIN,
} from '../src/features/cardGalleryImageLoading.js';

assert.equal(cardGalleryPriorityCount(320), 2);
assert.equal(cardGalleryPriorityCount(640), 2);
assert.equal(cardGalleryPriorityCount(641), 4);
assert.equal(cardGalleryPriorityCount(900), 4);
assert.equal(cardGalleryPriorityCount(901), 5);
assert.equal(cardGalleryPriorityCount(1240), 5);
assert.equal(cardGalleryPriorityCount(1241), 6);
assert.equal(cardGalleryPriorityCount(Number.POSITIVE_INFINITY), 6);
assert.equal(CARD_GALLERY_IMAGE_ROOT_MARGIN, '320px 0px');

const deferredImage = {
  dataset: {
    cardImageSrc: 'https://cdn.hearthpulse.net/api/card-image/JAIL_878/thumb.webp?v=test',
  },
  loading: 'lazy' as 'eager' | 'lazy',
  src: 'data:image/gif;base64,placeholder',
};
assert.equal(activateDeferredCardImage(deferredImage), true);
assert.equal(deferredImage.loading, 'eager');
assert.equal(
  deferredImage.src,
  'https://cdn.hearthpulse.net/api/card-image/JAIL_878/thumb.webp?v=test',
);
assert.equal(deferredImage.dataset.cardImageSrc, undefined);
assert.equal(
  activateDeferredCardImage(deferredImage),
  false,
  'an activated image must not be scheduled twice',
);

const nativeLazyFallbackImage = {
  dataset: { cardImageSrc: '/api/card-image/JAIL_878/thumb.webp?v=test' },
  loading: 'lazy' as 'eager' | 'lazy',
  src: 'data:image/gif;base64,placeholder',
};
assert.equal(activateDeferredCardImage(nativeLazyFallbackImage, 'lazy'), true);
assert.equal(nativeLazyFallbackImage.loading, 'lazy');
assert.equal(
  nativeLazyFallbackImage.src,
  '/api/card-image/JAIL_878/thumb.webp?v=test',
);

const cardsSource = readFileSync(
  new URL('../src/features/StandardCards.tsx', import.meta.url),
  'utf8',
);
const imageSource = readFileSync(
  new URL('../src/features/ConstructedCardGalleryImage.tsx', import.meta.url),
  'utf8',
);
assert.match(cardsSource, /useCardGalleryImageLoading\(cards\)/,
  'gallery priority must follow the responsive column count');
assert.match(imageSource, /CARD_GALLERY_IMAGE_ROOT_MARGIN/,
  'deferred images must use the bounded prefetch distance');
assert.match(imageSource, /activateDeferredCardImage\(image, 'lazy'\)/,
  'the no-observer fallback must preserve native lazy loading');
assert.match(imageSource, /data-card-image-src=/,
  'below-fold cards must defer their real URL instead of relying only on native lazy loading');
assert.match(imageSource, /fetchPriority=\{immediate \? 'high' : 'low'\}/,
  'only the first row may compete at high network priority');
assert.match(imageSource, /width=\{360\}[\s\S]*height=\{497\}/,
  'catalog cards must reserve the real thumbnail aspect ratio');
assert.match(imageSource, /onError=\{fallbackCardImageToOrigin\}/,
  'the CDN failure path must continue to retry from the application origin');

console.log('card catalog image loading tests passed');
