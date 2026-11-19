import assert from 'node:assert/strict';
import {
  createBlizzardCardImageClient,
  downloadBlizzardCardImage,
  isBlizzardImageContentType,
} from '../server/blizzardCards.js';
import {
  buildCardDbfIndex,
  createCardDbfIndexLoader,
  selectCardImageDbf,
} from '../server/cardImageDbf.js';
import {
  CARD_IMAGE_REPAIR_CARD_IDS,
  isCardImageRepairCard,
  withCardImageRepairVersion,
} from '../shared/cardImageRepairs.js';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function assertDisabledWithoutCredentials() {
  let requests = 0;
  const client = createBlizzardCardImageClient({
    fetchImpl: async () => {
      requests += 1;
      return jsonResponse({});
    },
  });

  assert.equal(client.configured, false);
  assert.equal(await client.getImageUrl(123), null);
  assert.equal(requests, 0, 'disabled client must not make network requests');
}

function assertBlizzardCdnImageContentTypes() {
  assert.equal(isBlizzardImageContentType('image/png'), true);
  assert.equal(isBlizzardImageContentType('image/webp; charset=binary'), true);
  assert.equal(isBlizzardImageContentType('application/octet-stream'), true);
  assert.equal(isBlizzardImageContentType('text/html'), false);
  assert.equal(isBlizzardImageContentType(null), false);
}

async function assertCatalogAndTokenCaching() {
  let oauthRequests = 0;
  let catalogRequests = 0;
  let directRequests = 0;

  const client = createBlizzardCardImageClient({
    clientId: 'test-client',
    clientSecret: 'test-secret',
    catalogTtlMs: 60_000,
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      if (url.hostname === 'oauth.battle.net') {
        oauthRequests += 1;
        return jsonResponse({ access_token: 'test-token', expires_in: 3600 });
      }
      if (url.pathname === '/hearthstone/cards' && url.searchParams.get('page') === '1') {
        catalogRequests += 1;
        return jsonResponse({
          pageCount: 2,
          cards: [{ id: 101, image: 'https://images.blz-contentstack.com/card-101.png' }],
        });
      }
      if (url.pathname === '/hearthstone/cards' && url.searchParams.get('page') === '2') {
        catalogRequests += 1;
        return jsonResponse({
          pageCount: 2,
          cards: [{ slug: '202-card-name', image: 'https://images.blz-contentstack.com/card-202.png' }],
        });
      }
      if (url.pathname === '/hearthstone/cards/303') {
        directRequests += 1;
        return jsonResponse({ image: 'https://images.blz-contentstack.com/card-303.png' });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  assert.equal(client.configured, true);
  assert.equal(await client.getImageUrl(101), 'https://images.blz-contentstack.com/card-101.png');
  assert.equal(await client.getImageUrl(202), 'https://images.blz-contentstack.com/card-202.png');
  assert.equal(await client.getImageUrl(303), 'https://images.blz-contentstack.com/card-303.png');
  assert.equal(await client.getImageUrl(303), 'https://images.blz-contentstack.com/card-303.png');
  assert.equal(oauthRequests, 1, 'OAuth token should be reused');
  assert.equal(catalogRequests, 2, 'all catalog pages should load once');
  assert.equal(directRequests, 1, 'direct fallback should be added to the catalog cache');
}

async function assertUnauthorizedRequestRefreshesToken() {
  let oauthRequests = 0;
  let cardsRequests = 0;

  const client = createBlizzardCardImageClient({
    clientId: 'test-client',
    clientSecret: 'test-secret',
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      if (url.hostname === 'oauth.battle.net') {
        oauthRequests += 1;
        return jsonResponse({ access_token: `test-token-${oauthRequests}`, expires_in: 3600 });
      }
      if (url.pathname === '/hearthstone/cards') {
        cardsRequests += 1;
        if (cardsRequests === 1) return jsonResponse({ error: 'expired' }, 401);
        return jsonResponse({
          pageCount: 1,
          cards: [{ id: 404, image: 'https://images.blz-contentstack.com/card-404.png' }],
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  assert.equal(await client.getImageUrl(404), 'https://images.blz-contentstack.com/card-404.png');
  assert.equal(oauthRequests, 2, '401 should invalidate and refresh the OAuth token once');
  assert.equal(cardsRequests, 2);
}

async function assertOfficialImageDownloadPrecedesFallback() {
  const requests: string[] = [];
  const buffer = await downloadBlizzardCardImage({
    dbfId: 115648,
    client: {
      configured: true,
      getImageUrl: async (dbfId) => {
        assert.equal(dbfId, 115648);
        return 'https://d15f34w2p8l1cc.cloudfront.net/hearthstone/official-card.png';
      },
    },
    fetchImpl: async (input) => {
      requests.push(String(input));
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    },
  });

  assert.deepEqual([...buffer ?? []], [1, 2, 3]);
  assert.deepEqual(requests, [
    'https://d15f34w2p8l1cc.cloudfront.net/hearthstone/official-card.png',
  ]);

  const overriddenRequests: string[] = [];
  await downloadBlizzardCardImage({
    dbfId: 115648,
    client: {
      configured: true,
      getImageUrl: async () => 'https://d15f34w2p8l1cc.cloudfront.net/hearthstone/stale-card.png',
    },
    resolveImageUrl: (_dbfId, officialUrl) => officialUrl.replace('stale-card', 'patched-card'),
    fetchImpl: async input => {
      overriddenRequests.push(String(input));
      return new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    },
  });
  assert.deepEqual(overriddenRequests, [
    'https://d15f34w2p8l1cc.cloudfront.net/hearthstone/patched-card.png',
  ]);

  await assert.rejects(
    downloadBlizzardCardImage({
      dbfId: 115648,
      client: {
        configured: true,
        getImageUrl: async () => 'https://d15f34w2p8l1cc.cloudfront.net/hearthstone/not-an-image',
      },
      fetchImpl: async () => new Response('<html>error</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    }),
    /content type/i,
  );

  await assert.rejects(
    downloadBlizzardCardImage({
      dbfId: 115648,
      client: {
        configured: true,
        getImageUrl: async () => 'https://d15f34w2p8l1cc.cloudfront.net/hearthstone/oversized.png',
      },
      fetchImpl: async () => new Response(new Uint8Array([1]), {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': String(9 * 1024 * 1024),
        },
      }),
    }),
    /exceeds/i,
  );
}

// Фикстуры #472. HearthstoneJSON (enUS, 2026-11-19): Sylvanas 119707, Alleria 119705, Vereesa 119706.
const hearthstoneJsonCards = [
  { id: 'TIME_609', dbfId: 119707, name: 'Ranger General Sylvanas' },
  { id: 'TIME_609t1', dbfId: 119705, name: 'Ranger Captain Alleria' },
  { id: 'TIME_609t2', dbfId: 119706, name: 'Ranger Initiate Vereesa' },
  { id: 'CS2_062', dbfId: 950, name: 'Hellfire' },
  { id: 'CORE_CS2_062', dbfId: 69519, name: 'Hellfire' },
];
// Устаревший cards_ru.json (2026-06-08): dbf сдвинуты на одну карту.
const staleCardsRu: Record<string, number> = {
  TIME_609: 119705,
  TIME_609t1: 119706,
  TIME_609t2: 119707,
  CS2_062: 69519,
  TIME_999t1: 119706,
};
// «Blizzard»: по dbf отдаёт картинку именно этой карты.
const blizzardArtByDbf = new Map([
  [119707, 'art:sylvanas'], [119705, 'art:alleria'], [119706, 'art:vereesa'],
]);

async function renderedArtFor(cardId: string, legacy: Record<string, number>) {
  const index = buildCardDbfIndex(hearthstoneJsonCards);
  const { dbfId } = selectCardImageDbf({ cardId, index, legacyDbfId: legacy[cardId] ?? null });
  if (!dbfId) return 'fallback:hearthstonejson';
  const buffer = await downloadBlizzardCardImage({
    dbfId,
    client: { configured: true, getImageUrl: async id => `https://d15f34w2p8l1cc.cloudfront.net/hearthstone/${id}.png` },
    fetchImpl: async input => {
      const id = Number(/\/(\d+)\.png$/.exec(String(input))?.[1]);
      return new Response(Buffer.from(blizzardArtByDbf.get(id) ?? 'art:unknown'), { status: 200, headers: { 'Content-Type': 'image/png' } });
    },
  });
  return buffer?.toString();
}

async function assertTokensGetTheirOwnBlizzardArt() {
  // До фикса dbf брался из cards_ru.json: Вериса получала рендер Сильваны.
  assert.equal(blizzardArtByDbf.get(staleCardsRu.TIME_609t2), 'art:sylvanas', 'fixture reproduces the shifted dbf');
  assert.equal(await renderedArtFor('TIME_609', staleCardsRu), 'art:sylvanas');
  assert.equal(await renderedArtFor('TIME_609t1', staleCardsRu), 'art:alleria');
  assert.equal(await renderedArtFor('TIME_609t2', staleCardsRu), 'art:vereesa');
}

function assertDbfSelectionRules() {
  const index = buildCardDbfIndex(hearthstoneJsonCards);
  const warnings: string[] = [];
  const mismatch = selectCardImageDbf({ cardId: 'TIME_609t2', index, legacyDbfId: 119707, onMismatch: message => warnings.push(message) });
  assert.deepEqual(mismatch, { dbfId: 119706, source: 'hearthstonejson' });
  assert.equal(warnings.length, 1, 'a replaced dbf is logged');
  // Совпадающий dbf — без предупреждения.
  selectCardImageDbf({ cardId: 'TIME_609', index, legacyDbfId: 119707, onMismatch: message => warnings.push(message) });
  assert.equal(warnings.length, 1);
  // Карты нет в HearthstoneJSON, а её dbf там принадлежит другой карте: Blizzard не используем (fallback).
  assert.deepEqual(
    selectCardImageDbf({ cardId: 'TIME_999t1', index, legacyDbfId: 119706, onMismatch: message => warnings.push(message) }),
    { dbfId: null, source: 'none' },
  );
  assert.equal(warnings.length, 2);
  // CORE-двойник — та же картинка, не конфликт.
  const coreOnlyIndex = buildCardDbfIndex([{ id: 'CORE_CS2_062', dbfId: 69519 }]);
  assert.deepEqual(selectCardImageDbf({ cardId: 'CS2_062', index: coreOnlyIndex, legacyDbfId: 69519 }), { dbfId: 69519, source: 'legacy' });
  assert.deepEqual(selectCardImageDbf({ cardId: 'CORE_CS2_062', index, legacyDbfId: 950 }), { dbfId: 69519, source: 'hearthstonejson' });
  // Индекс недоступен: прежнее поведение, без падения.
  assert.deepEqual(selectCardImageDbf({ cardId: 'TIME_609', index: null, legacyDbfId: 119705 }), { dbfId: 119705, source: 'legacy' });
  assert.deepEqual(selectCardImageDbf({ cardId: 'TIME_609', index: null, legacyDbfId: null }), { dbfId: null, source: 'none' });
}

async function assertDbfIndexLoaderCachesAndRecovers() {
  let clock = 1_000;
  let requests = 0;
  let fail = true;
  const errors: unknown[] = [];
  const load = createCardDbfIndexLoader({
    url: 'https://hearthstonejson.test/cards.json',
    now: () => clock,
    ttlMs: 10_000,
    retryMs: 1_000,
    onError: error => errors.push(error),
    fetchImpl: async () => {
      requests += 1;
      return fail ? new Response('down', { status: 503 }) : jsonResponse(hearthstoneJsonCards);
    },
  });
  assert.equal(await load(), null);
  assert.equal(await load(), null, 'a failed load is not retried immediately');
  assert.equal(requests, 1);
  assert.equal(errors.length, 1);
  clock += 1_500;
  fail = false;
  assert.equal((await load())?.byCardId.get('TIME_609t2'), 119706);
  await load();
  assert.equal(requests, 2, 'a loaded index is reused until its ttl');
  fail = true;
  clock += 11_000;
  assert.equal((await load())?.byCardId.get('TIME_609t2'), 119706, 'the previous index survives an upstream failure');
}

function assertRepairListIsTargeted() {
  for (const cardId of ['TIME_609', 'TIME_609t1', 'TIME_609t2']) {
    assert.ok(isCardImageRepairCard(cardId), cardId);
    assert.match(withCardImageRepairVersion('card_img_v6_blizzard', cardId), /^card_img_v6_blizzard-dbf472$/);
  }
  assert.equal(isCardImageRepairCard('EX1_001'), false);
  assert.equal(withCardImageRepairVersion('card_img_v6_blizzard', 'EX1_001'), 'card_img_v6_blizzard');
  assert.equal(new Set(CARD_IMAGE_REPAIR_CARD_IDS).size, CARD_IMAGE_REPAIR_CARD_IDS.length);
}

assertBlizzardCdnImageContentTypes();
await assertTokensGetTheirOwnBlizzardArt();
assertDbfSelectionRules();
await assertDbfIndexLoaderCachesAndRecovers();
assertRepairListIsTargeted();
await assertDisabledWithoutCredentials();
await assertCatalogAndTokenCaching();
await assertUnauthorizedRequestRefreshesToken();
await assertOfficialImageDownloadPrecedesFallback();
console.log('blizzard card image tests passed');
