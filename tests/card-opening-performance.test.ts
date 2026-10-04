import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cardsSource = readFileSync(new URL('../src/features/StandardCards.tsx', import.meta.url), 'utf8');
const cardsStyles = readFileSync(new URL('../src/features/StandardCards.css', import.meta.url), 'utf8');
const detailPrefetchSource = readFileSync(new URL('../src/features/constructedCardDetailPrefetch.ts', import.meta.url), 'utf8');
const listPrefetchSource = readFileSync(new URL('../src/features/constructedCardListPrefetch.ts', import.meta.url), 'utf8');
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
// Catalog responses are no-store and the warm cache dies with the document,
// so the catalog warms only the rank or period option a visitor points at
// (tests/next-cards-browser.test.mjs checks the requests).
const catalogWarmSource = readFileSync(new URL('../src/modules/constructedCards/useCatalogIntentWarm.ts', import.meta.url), 'utf8');
assert.match(catalogWarmSource, /prefetch\(constructedCardCatalogUrl\(\{ \.\.\.state, \.\.\.patch, page: 1/,
  'an intent warm must request exactly the slice the filter change will load');
assert.match(catalogWarmSource, /saveData/, 'intent warming must respect Save-Data');
assert.equal((cardsSource.match(/onOptionIntent=\{value => warmCatalog\(\{ (?:rank|period): /g) ?? []).length, 2,
  'only the rank and period menus warm their options');
assert.doesNotMatch(cardsSource, /useCatalogWarm\b/, 'the catalog must not warm neighbouring slices on every visit');
assert.match(cardsSource, /loading && data \?/,
  'filter refreshes must retain the visible catalog instead of replacing it with a blocking loader');
assert.match(listPrefetchSource, /LIST_PREFETCH_LIMIT\s*=\s*16/,
  'the client list cache must remain bounded');
assert.match(listPrefetchSource, /statsAccess \? 'paid' : 'public'/,
  'public and subscriber list payloads must never share a client cache key');
assert.match(cardsStyles, /\.constructed-cards__state\s*\{[^}]*min-height:\s*70vh/,
  'the cold catalog loader must reserve enough viewport space to avoid a late footer shift');

assert.match(lightboxSource, /item\.thumbnailUrl !== item\.url/,
  'constructed-card lightboxes must show an already-loaded preview while full media decodes');
assert.match(lightboxSource, /const next = items\[\(index \+ 1\) % items\.length\]/,
  'gallery navigation must warm the next image');
assert.match(deferredSource, /onPointerEnter=\{\(\) => preloadImage\(fullSrc\)\}/,
  'legendary card thumbnails must warm the full render on hover');
assert.match(deferredSource, /ready \|\| !hasPreview \? fullSrc : previewSrc/,
  'Arena card lightboxes must keep the cached thumbnail visible until the full render is ready');
assert.doesNotMatch(deferredSource, /const (?:ProgressiveDeckCardImage|DeckCardLightbox)/,
  'retired deck lightboxes must not return to the Arena route bundle');

console.log('card opening and lightbox performance contracts passed');
