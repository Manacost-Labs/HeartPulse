import assert from 'node:assert/strict';
import {
  PUBLIC_CARD_IMAGE_CDN_ORIGIN,
  resolveCardImageDeliveryUrl,
  resolveCardImageOriginUrl,
} from '../shared/publicAssetDelivery.js';

const fullCardPath = '/api/card-image/126055/full.webp?v=blizzard-example';

assert.equal(
  resolveCardImageDeliveryUrl(fullCardPath, {
    enabled: false,
    origin: PUBLIC_CARD_IMAGE_CDN_ORIGIN,
  }),
  fullCardPath,
  'disabled delivery must keep the same-origin URL',
);

assert.equal(
  resolveCardImageDeliveryUrl(fullCardPath, {
    enabled: true,
    origin: PUBLIC_CARD_IMAGE_CDN_ORIGIN,
  }),
  `${PUBLIC_CARD_IMAGE_CDN_ORIGIN}${fullCardPath}`,
  'enabled delivery must preserve the path and cache-busting query',
);

assert.equal(
  resolveCardImageDeliveryUrl('/api/cards/126055', {
    enabled: true,
    origin: PUBLIC_CARD_IMAGE_CDN_ORIGIN,
  }),
  '/api/cards/126055',
  'JSON API routes must never be moved to the image CDN',
);

assert.equal(
  resolveCardImageDeliveryUrl(fullCardPath, {
    enabled: true,
    origin: 'http://cdn.arena.hs-manacost.ru',
  }),
  fullCardPath,
  'non-HTTPS CDN origins must fail closed',
);

assert.equal(
  resolveCardImageDeliveryUrl(fullCardPath, {
    enabled: true,
    origin: 'https://images.example.test',
  }),
  fullCardPath,
  'unexpected CDN hosts must fail closed',
);

assert.equal(
  resolveCardImageOriginUrl(`${PUBLIC_CARD_IMAGE_CDN_ORIGIN}${fullCardPath}`),
  fullCardPath,
  'a failed CDN image must be reversible to its same-origin URL',
);

assert.equal(
  resolveCardImageOriginUrl('https://images.example.test/card.webp'),
  'https://images.example.test/card.webp',
  'unrelated remote images must not be rewritten',
);

console.log('public asset delivery tests passed');
