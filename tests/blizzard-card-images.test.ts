import assert from 'node:assert/strict';
import { createBlizzardCardImageClient, isBlizzardImageContentType } from '../server/blizzardCards.js';

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

assertBlizzardCdnImageContentTypes();
await assertDisabledWithoutCredentials();
await assertCatalogAndTokenCaching();
await assertUnauthorizedRequestRefreshesToken();
console.log('blizzard card image tests passed');
