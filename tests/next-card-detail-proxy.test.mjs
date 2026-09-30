import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

const CARD_PATH = '/api/public/constructed-cards/standard/CARD_QA_1';
const publicCard = id => ({
  card: { id, name: 'Проверочная карта', englishName: 'Probe Card', rulesText: 'Боевой клич: возьмите карту.',
    set: 'CORE', type: 'Существо', rarity: 'COMMON', mana: 2, attack: 2, health: 3, image: null },
  classCode: 'MAGE', dbf: 12345,
});

// The only card Express knows is CARD_QA_1; every card read is recorded.
async function startCardApi() {
  const cardReads = [];
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url.startsWith('/api/public/constructed-cards/')) {
      cardReads.push(request.url);
      const known = request.url === CARD_PATH;
      response.writeHead(known ? 200 : 404).end(JSON.stringify(known ? publicCard('CARD_QA_1') : { error: 'Card not found' }));
      return;
    }
    response.writeHead(request.url.startsWith('/api/auth/me') ? 401 : 404).end('{"error":"Unavailable"}');
  });
  return { server, cardReads, origin: await listenLocal(server) };
}

test('a card page is rendered from the single Express read of the proxy', async () => {
  const api = await startCardApi();
  let next;
  try {
    next = await startNextServer({ legacyOrigin: api.origin });
    const known = await fetch(`${next.origin}/standard/cards/standard/CARD_QA_1/`);
    assert.equal(known.status, 200, next.output());
    assert.match(await known.text(), /<h1>Проверочная карта<\/h1>/);
    assert.deepEqual(api.cardReads, [CARD_PATH], 'the proxy, the metadata and the page share one read');

    // A client cannot supply the projection that the proxy hands to the page.
    const forged = `v1:${Buffer.from(JSON.stringify(publicCard('ABSENT_CARD'))).toString('base64url')}`;
    const absent = await fetch(`${next.origin}/standard/cards/standard/ABSENT_CARD/`, {
      headers: { 'x-hearthpulse-card-public-projection': forged },
    });
    assert.equal(absent.status, 404);
    assert.doesNotMatch(await absent.text(), /Проверочная карта/);
    assert.equal(api.cardReads.length, 2, 'an absent card is read once as well');
  } finally {
    if (next) await next.close();
    await closeLocal(api.server);
  }
});

test('a card page answers a retryable 503 when Express cannot be reached', async () => {
  const api = await startCardApi();
  await closeLocal(api.server);
  let next;
  try {
    next = await startNextServer({ legacyOrigin: api.origin });
    const response = await fetch(`${next.origin}/standard/cards/standard/CARD_QA_1/`);
    assert.equal(response.status, 503, next.output());
    assert.equal(response.headers.get('retry-after'), '300');
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.match(await response.text(), /<meta name="robots" content="noindex, nofollow">/);
  } finally {
    if (next) await next.close();
  }
});
