import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  activateDeferredCardImage,
  cardGalleryPriorityCount,
  cardGalleryEagerMinWidth,
  CARD_GALLERY_EAGER_COUNT, CARD_GALLERY_HIGH_PRIORITY_COUNT,
  CARD_GALLERY_IMAGE_ROOT_MARGIN,
} from '../src/features/cardGalleryImageLoading.js';
import ConstructedCardGalleryImage, { useCardGalleryImageLoading } from '../src/features/ConstructedCardGalleryImage.js';

function HydrationProbe() {
  const { immediateImageCount } = useCardGalleryImageLoading([]);
  return React.createElement(ConstructedCardGalleryImage, {
    src: '/api/card-image/CARD_3/thumb.webp', alt: 'Third card',
    immediate: 2 < immediateImageCount, highPriority: false,
  });
}
const serverMarkup = renderToString(React.createElement(HydrationProbe));
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
try {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { innerWidth: 390 } });
  assert.equal(renderToString(React.createElement(HydrationProbe)), serverMarkup,
    'image attributes must match the server on the first mobile hydration render');
} finally {
  if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
  else Reflect.deleteProperty(globalThis, 'window');
}

assert.equal(cardGalleryPriorityCount(320), 2);
assert.equal(cardGalleryPriorityCount(640), 2);
assert.equal(cardGalleryPriorityCount(641), 4);
assert.equal(cardGalleryPriorityCount(900), 4);
assert.equal(cardGalleryPriorityCount(901), 5);
assert.equal(cardGalleryPriorityCount(1240), 5);
assert.equal(cardGalleryPriorityCount(1241), 6);
assert.equal(cardGalleryPriorityCount(Number.POSITIVE_INFINITY), 6);
assert.equal(CARD_GALLERY_IMAGE_ROOT_MARGIN, '320px 0px');
assert.equal(CARD_GALLERY_EAGER_COUNT, cardGalleryPriorityCount(320), 'the narrowest first row still loads eagerly');
assert.equal(CARD_GALLERY_HIGH_PRIORITY_COUNT, 0, 'the LCP banner is not competing with forced-high thumbnails');
assert.deepEqual(Array.from({ length: 8 }, (_, index) => cardGalleryEagerMinWidth(index)),
  [undefined, undefined, 641, 641, 901, 1241, undefined, undefined]);
for (const width of [320, 640, 641, 900, 901, 1240, 1241, 1440]) {
  const candidates = CARD_GALLERY_EAGER_COUNT + Array.from({ length: 6 }, (_, index) => cardGalleryEagerMinWidth(index))
    .filter(minWidth => minWidth !== undefined && minWidth <= width).length;
  assert.equal(candidates, cardGalleryPriorityCount(width));
}
const responsiveMarkup = renderToString(React.createElement(ConstructedCardGalleryImage, {
  src: '/api/card-image/CARD_3/thumb.webp', alt: 'Third card', immediate: false, highPriority: false, minWidth: 641,
}));
assert.match(responsiveMarkup, /<source media="\(min-width: 641px\)" srcSet="\/api\/card-image\/CARD_3\/thumb.webp"/);
assert.doesNotMatch(responsiveMarkup, /rel="preload"/,
  'a desktop candidate must not generate an unconditional preload on mobile');
assert.match(responsiveMarkup, /data-card-image-src="\/api\/card-image\/CARD_3\/thumb.webp"/);

const render = (immediate: boolean, highPriority: boolean) => renderToString(React.createElement(ConstructedCardGalleryImage,
  { src: '/api/card-image/JAIL_878/thumb.webp?v=test', alt: 'Card', immediate, highPriority }));
assert.match(render(true, true), /fetchPriority="high"/);
const eagerFirstRow = render(true, false);
assert.doesNotMatch(eagerFirstRow, /fetchPriority/i,
  'the rest of the widest first row keeps a real eager src at default priority');
assert.match(eagerFirstRow, /src="\/api\/card-image\/JAIL_878\/thumb\.webp\?v=test"[^>]*loading="eager"/);
assert.match(render(false, false), /fetchPriority="low"/);

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
const observerSource = readFileSync(
  new URL('../src/modules/constructedCards/galleryImageObserver.ts', import.meta.url),
  'utf8',
);
assert.match(cardsSource, /useCardGalleryImageLoading\(cards\)/,
  'gallery priority must follow the responsive column count');
assert.match(observerSource, /CARD_GALLERY_IMAGE_ROOT_MARGIN/,
  'deferred images must use the bounded prefetch distance');
assert.match(observerSource, /activateDeferredCardImage\(image, 'lazy'\)/,
  'the no-observer fallback must preserve native lazy loading');
const imageSource = readFileSync(new URL('../src/features/ConstructedCardGalleryImage.tsx', import.meta.url), 'utf8');
assert.match(imageSource, /data-card-image-src=/,
  'below-fold cards must defer their real URL instead of relying only on native lazy loading');
assert.match(cardsSource, /highPriority=\{index < CARD_GALLERY_HIGH_PRIORITY_COUNT\}/,
  'the gallery must ask for high priority only for the narrowest first row');
assert.match(imageSource, /width=\{360\}[\s\S]*height=\{497\}/,
  'catalog cards must reserve the real thumbnail aspect ratio');
const deliveryAdapter = readFileSync(new URL('../src/features/ConstructedCardGalleryImage.tsx', import.meta.url), 'utf8');
assert.match(deliveryAdapter, /fallbackCardImageElementToOrigin\(image\)/,
  'the CDN failure path must continue to retry from the application origin');
assert.doesNotMatch(imageSource, /window\.innerWidth/,
  'viewport selection belongs to browser media queries, not the hydration render');

console.log('card catalog image loading tests passed');
