import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cardsSource = readFileSync(new URL('../src/features/StandardCards.tsx', import.meta.url), 'utf8');
const detailPrefetchSource = readFileSync(new URL('../src/features/constructedCardDetailPrefetch.ts', import.meta.url), 'utf8');
const lightboxSource = readFileSync(new URL('../src/features/ConstructedCardLightbox.tsx', import.meta.url), 'utf8');
const deferredSource = readFileSync(new URL('../src/features/DeferredRoutes.tsx', import.meta.url), 'utf8');

assert.match(cardsSource, /prefetchConstructedCardDetail\(/,
  'card catalog links must warm their detail response before navigation');
assert.match(cardsSource, /loadConstructedCardDetail\(/,
  'card detail navigation must consume the same in-flight prefetched response');
assert.match(cardsSource, /onPointerDown=\{\(\) => warmCard/,
  'touch and fast clicks must start warming before navigation');
assert.match(detailPrefetchSource, /DETAIL_PREFETCH_LIMIT\s*=\s*24/,
  'the client detail cache must remain bounded');
assert.match(detailPrefetchSource, /statsAccess \? 'paid' : 'public'/,
  'public and subscriber payloads must never share a client cache key');

assert.match(lightboxSource, /item\.thumbnailUrl !== item\.url/,
  'constructed-card lightboxes must show an already-loaded preview while full media decodes');
assert.match(lightboxSource, /const next = items\[\(index \+ 1\) % items\.length\]/,
  'gallery navigation must warm the next image');
assert.match(deferredSource, /onPointerEnter=\{\(\) => preloadImage\(fullSrc\)\}/,
  'legendary card thumbnails must warm the full render on hover');
assert.match(deferredSource, /ready \|\| !hasPreview \? fullSrc : previewSrc/,
  'Arena card lightboxes must keep the cached thumbnail visible until the full render is ready');
assert.match(deferredSource, /const ProgressiveDeckCardImage/,
  'deck lightboxes must keep the cached card tile visible until the full render is ready');

console.log('card opening and lightbox performance contracts passed');
