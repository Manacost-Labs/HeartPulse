import assert from 'node:assert/strict';
import {
  cardImageDeliveryUrl,
  cardImageOriginUrl,
  fallbackCardImageElementToOrigin,
} from '../src/config/publicAssetDelivery.js';

const runtimeGlobal = globalThis as typeof globalThis & { window?: any };
const previousWindow = runtimeGlobal.window;

try {
  delete runtimeGlobal.window;
  assert.equal(
    cardImageDeliveryUrl('/api/card-image/ETC_080/thumb.webp?v=1'),
    '/api/card-image/ETC_080/thumb.webp?v=1',
    'server rendering and missing runtime config must stay on the same origin',
  );

  runtimeGlobal.window = {
    __ARENA_RUNTIME_CONFIG__: {
      cardImageCdn: {
        enabled: true,
        origin: 'https://cdn.hearthpulse.net',
      },
    },
  };
  assert.equal(
    cardImageDeliveryUrl('/api/card-image/ETC_080/full.webp?v=2'),
    'https://cdn.hearthpulse.net/api/card-image/ETC_080/full.webp?v=2',
    'the approved runtime CDN must serve constructed card images',
  );
  assert.equal(
    cardImageOriginUrl('https://cdn.hearthpulse.net/api/card-image/ETC_080/full.webp?v=2'),
    '/api/card-image/ETC_080/full.webp?v=2',
  );

  runtimeGlobal.window.__ARENA_RUNTIME_CONFIG__ = {
    cardImageCdn: {
      enabled: true,
      origin: 'https://attacker.example',
    },
  };
  assert.equal(
    cardImageDeliveryUrl('/api/card-image/ETC_080/full.webp?v=3'),
    '/api/card-image/ETC_080/full.webp?v=3',
    'an unapproved runtime origin must fail closed to the application origin',
  );

  const removedAttributes: string[] = [];
  const image = {
    currentSrc: 'https://cdn.hearthpulse.net/api/card-image/ETC_080/thumb.webp?v=4',
    src: 'https://cdn.hearthpulse.net/api/card-image/ETC_080/thumb.webp?v=4',
    removeAttribute(name: string) {
      removedAttributes.push(name);
    },
  };
  assert.equal(fallbackCardImageElementToOrigin(image), true);
  assert.equal(image.src, '/api/card-image/ETC_080/thumb.webp?v=4');
  assert.deepEqual(removedAttributes, ['srcset']);
  assert.equal(
    fallbackCardImageElementToOrigin(image),
    false,
    'the fallback must not loop after returning to the application origin',
  );
} finally {
  if (previousWindow === undefined) delete runtimeGlobal.window;
  else runtimeGlobal.window = previousWindow;
}
