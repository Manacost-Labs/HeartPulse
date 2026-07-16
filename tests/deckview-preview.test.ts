import assert from 'node:assert/strict';
import { renderDeckviewPreview, resolveDeckviewImageUrl } from '../server/deckviewPreview.js';

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
  resolveDeckviewImageUrl({ image_path: '/static/generated/../secret', image_url: 'http://127.0.0.1:5000/private' }, 'https://api.blizzcore.ru'),
  null,
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
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch,
});

assert.equal(requestUrl, 'http://127.0.0.1:5000/deckview-api/v1/render');
assert.deepEqual(requestBody, { deck_code: 'AAECAaoITestDeckCode', deck_name: 'Граб Шаман' });
assert.deepEqual(preview, {
  hash: 'a'.repeat(64),
  state: 'done',
  ready: true,
  imageUrl: 'https://api.blizzcore.ru/static/generated/grab-shaman.jpg',
  error: null,
});

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
