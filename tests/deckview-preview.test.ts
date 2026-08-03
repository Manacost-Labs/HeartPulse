import assert from 'node:assert/strict';
import {
  cachedDeckviewPreview,
  deckviewPreviewCacheKey,
  isTrustedDeckviewPreview,
  renderDeckviewPreview,
  resolveDeckviewImageUrl,
  resolveDeckviewPreviewImageUrl,
} from '../server/deckviewPreview.js';

const manifestKey = deckviewPreviewCacheKey('renderer-v1', {
  deckCode: 'AAEC-manifest',
  archetypeLabel: 'Manifest deck',
});
const manifestPreview = {
  hash: manifestKey,
  state: 'done',
  ready: true,
  imageUrl: 'https://api.blizzcore.ru/static/generated/render-cache/aa/deck.jpg',
  previewImageUrl: 'https://api.blizzcore.ru/static/generated/render-cache/aa/deck.preview-v1.webp',
  error: null,
};
assert.equal(isTrustedDeckviewPreview(manifestPreview, 'https://api.blizzcore.ru/'), true);
assert.equal(isTrustedDeckviewPreview({
  ...manifestPreview,
  previewImageUrl: 'https://untrusted.example/deck.webp',
}, 'https://api.blizzcore.ru'), false);
assert.deepEqual(cachedDeckviewPreview(
  new Map([[manifestKey, { preview: manifestPreview, expiresAt: Date.now() + 60_000 }]]),
  'renderer-v1',
  'https://api.blizzcore.ru',
  { deckCode: 'AAEC-manifest', title: 'Manifest deck' },
), {
  imageUrl: manifestPreview.imageUrl,
  previewImageUrl: manifestPreview.previewImageUrl,
});

assert.equal(
  resolveDeckviewImageUrl(
    { image_path: '/static/generated/mug_shaman-123.jpg', image_url: 'http://127.0.0.1:5000/static/generated/mug_shaman-123.jpg' },
    'https://api.blizzcore.ru/',
  ),
  'https://api.blizzcore.ru/static/generated/mug_shaman-123.jpg',
);
assert.equal(
  resolveDeckviewImageUrl({ filename: 'safe_deck.jpg' }, 'https://api.blizzcore.ru'),
  'https://api.blizzcore.ru/static/generated/safe_deck.jpg',
);
assert.equal(
  resolveDeckviewImageUrl({ filename: 'render-cache/ab/safe_deck.jpg' }, 'https://api.blizzcore.ru'),
  'https://api.blizzcore.ru/static/generated/render-cache/ab/safe_deck.jpg',
);
assert.equal(
  resolveDeckviewImageUrl({ image_path: '/static/generated/../secret', image_url: 'http://127.0.0.1:5000/private' }, 'https://api.blizzcore.ru'),
  null,
);
assert.equal(
  resolveDeckviewPreviewImageUrl(
    { preview_filename: 'render-cache/ab/safe.preview-v1.webp' },
    'https://api.blizzcore.ru',
  ),
  'https://api.blizzcore.ru/static/generated/render-cache/ab/safe.preview-v1.webp',
);

let requestUrl = '';
let requestBody: any = null;
const preview = await renderDeckviewPreview({
  deckCode: 'AAECAaoITestDeckCode',
  deckName: 'Граб Шаман',
  hash: 'a'.repeat(64),
}, {
  apiBaseUrl: 'http://127.0.0.1:5000/deckview-api/v1/',
  publicBaseUrl: 'https://api.blizzcore.ru/',
  timeoutMs: 5_000,
  fetchImpl: (async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      success: true,
      image_path: '/static/generated/grab-shaman.jpg',
      image_url: 'http://127.0.0.1:5000/static/generated/grab-shaman.jpg',
      preview_image_path: '/static/generated/render-cache/aa/grab-shaman.preview-v1.webp',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch,
});

assert.equal(requestUrl, 'http://127.0.0.1:5000/deckview-api/v1/render/parchment');
assert.deepEqual(requestBody, { deck_code: 'AAECAaoITestDeckCode', deck_name: 'Граб Шаман' });
assert.deepEqual(preview, {
  hash: 'a'.repeat(64),
  state: 'done',
  ready: true,
  imageUrl: 'https://api.blizzcore.ru/static/generated/grab-shaman.jpg',
  previewImageUrl: 'https://api.blizzcore.ru/static/generated/render-cache/aa/grab-shaman.preview-v1.webp',
  error: null,
});

const asyncRequests: string[] = [];
const asyncPreview = await renderDeckviewPreview({
  deckCode: 'AAECAaoIAsyncDeckCode',
  deckName: 'Асинхронная колода',
  hash: 'c'.repeat(64),
}, {
  apiBaseUrl: 'http://127.0.0.1:5000/deckview-api/v1',
  publicBaseUrl: 'https://api.blizzcore.ru',
  timeoutMs: 5_000,
  pollIntervalMs: 25,
  apiKey: 'secret',
  fetchImpl: (async (input, init) => {
    asyncRequests.push(String(input));
    assert.equal((init?.headers as Record<string, string>)['X-API-Key'], 'secret');
    if (asyncRequests.length === 1) {
      return new Response(JSON.stringify({
        success: true,
        ready: false,
        job_id: `api-render-${'d'.repeat(64)}`,
      }), { status: 202, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      success: true,
      ready: true,
      filename: 'render-cache/dd/async.jpg',
      preview_filename: 'render-cache/dd/async.preview-v1.webp',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch,
});

assert.deepEqual(asyncRequests, [
  'http://127.0.0.1:5000/deckview-api/v1/render/parchment',
  `http://127.0.0.1:5000/deckview-api/v1/render/jobs/api-render-${'d'.repeat(64)}`,
]);
assert.equal(asyncPreview.imageUrl, 'https://api.blizzcore.ru/static/generated/render-cache/dd/async.jpg');
assert.equal(
  asyncPreview.previewImageUrl,
  'https://api.blizzcore.ru/static/generated/render-cache/dd/async.preview-v1.webp',
);

await assert.rejects(
  renderDeckviewPreview({ deckCode: 'bad', deckName: 'Bad', hash: 'b'.repeat(64) }, {
    apiBaseUrl: 'http://127.0.0.1:5000/deckview-api/v1',
    publicBaseUrl: 'https://api.blizzcore.ru',
    timeoutMs: 5_000,
    fetchImpl: (async () => new Response(JSON.stringify({ success: false }), { status: 422 })) as typeof fetch,
  }),
  /DECKVIEW_RENDER_FAILED/,
);

console.log('DeckView preview adapter tests passed');
