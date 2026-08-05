import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import express from 'express';
import { createPublicResourceRouter } from '../server/publicResourceRoutes.js';

const compressedPayload = JSON.stringify({
  cards: Array.from({ length: 500 }, (_, index) => ({
    id: `TEST_${index}`,
    name: `Проверка полного декодированного ответа ${index}`,
  })),
});
const compressedUpstream = express();
compressedUpstream.get('/gzip.json', (_request, response) => {
  const body = gzipSync(compressedPayload);
  response.status(200);
  response.set('Content-Type', 'application/json');
  response.set('Content-Encoding', 'gzip');
  response.set('Content-Length', String(body.byteLength));
  response.end(body);
});
const compressedServer = compressedUpstream.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  compressedServer.once('listening', resolve);
  compressedServer.once('error', reject);
});
const compressedAddress = compressedServer.address();
assert.ok(compressedAddress && typeof compressedAddress === 'object');
const compressedOrigin = `http://127.0.0.1:${compressedAddress.port}`;

let forbiddenRedirectHits = 0;
const forbiddenTarget = express();
forbiddenTarget.get('/private.png', (_request, response) => {
  forbiddenRedirectHits += 1;
  response.type('png').send(new Uint8Array([7]));
});
const forbiddenServer = forbiddenTarget.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  forbiddenServer.once('listening', resolve);
  forbiddenServer.once('error', reject);
});
const forbiddenAddress = forbiddenServer.address();
assert.ok(forbiddenAddress && typeof forbiddenAddress === 'object');
const forbiddenOrigin = `http://127.0.0.1:${forbiddenAddress.port}`;

const redirectSource = express();
redirectSource.get('/redirect.png', (_request, response) => {
  response.redirect(302, `${forbiddenOrigin}/private.png`);
});
const redirectServer = redirectSource.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  redirectServer.once('listening', resolve);
  redirectServer.once('error', reject);
});
const redirectAddress = redirectServer.address();
assert.ok(redirectAddress && typeof redirectAddress === 'object');
const redirectOrigin = `http://127.0.0.1:${redirectAddress.port}`;

const upstreamCalls: Array<{ url: string; headers: HeadersInit | undefined; redirect: RequestRedirect | undefined }> = [];
const app = express();
app.use('/api', createPublicResourceRouter({
  fetchResource: async (url, init) => {
    upstreamCalls.push({ url, headers: init?.headers, redirect: init?.redirect });
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/redirect-live.png')) {
      const response = await fetch(`${redirectOrigin}/redirect.png`, init);
      Object.defineProperty(response, 'url', { value: url });
      return response;
    }
    if (pathname.endsWith('/gzip.json')) {
      const response = await fetch(`${compressedOrigin}/gzip.json`, init);
      Object.defineProperty(response, 'url', { value: url });
      return response;
    }
    if (pathname.endsWith('/redirect-off-origin.png')) {
      const response = new Response(new Uint8Array([9]), {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': '1' },
      });
      Object.defineProperty(response, 'url', { value: 'https://evil.example/stolen.png' });
      return response;
    }
    if (pathname.endsWith('/too-large.png')) {
      return new Response(new Uint8Array([9]), {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': String(33 * 1024 * 1024) },
      });
    }
    if (pathname.endsWith('/wrong-type.svg')) {
      return new Response('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
      });
    }
    if (pathname.endsWith('/cards.json')) {
      return new Response('{"cards":[]}', {
        status: 200,
        headers: { 'content-type': 'application/json', etag: '"json-v1"' },
      });
    }
    if (pathname.endsWith('/transform.png')) {
      return new Response(Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    }
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 206,
      headers: {
        'content-type': 'image/webp',
        'content-length': '3',
        'content-range': 'bytes 0-2/3',
        'accept-ranges': 'bytes',
        etag: '"image-v1"',
      },
    });
  },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}/api/public-resource`;

try {
  const image = await fetch(`${baseUrl}/db/uploads/cards/TEST.webp`, {
    headers: { Range: 'bytes=0-2', Cookie: 'private=1', Authorization: 'Bearer secret' },
  });
  assert.equal(image.status, 206);
  assert.equal(image.headers.get('content-type'), 'image/webp');
  assert.equal(image.headers.get('content-range'), 'bytes 0-2/3');
  assert.equal(image.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.match(image.headers.get('cache-control') ?? '', /stale-while-revalidate/);
  assert.deepEqual([...new Uint8Array(await image.arrayBuffer())], [1, 2, 3]);
  assert.equal(upstreamCalls[0]?.url, 'https://db.kolodahs.ru/uploads/cards/TEST.webp');
  assert.deepEqual(upstreamCalls[0]?.headers, {
    'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)',
    Range: 'bytes=0-2',
  }, 'credentials and unrelated browser headers must never be forwarded');
  assert.equal(upstreamCalls[0]?.redirect, 'manual');

  const json = await fetch(`${baseUrl}/hsjson-api/v1/latest/ruRU/cards.json`);
  assert.equal(json.status, 200);
  assert.match(json.headers.get('content-type') ?? '', /^application\/json/);
  assert.deepEqual(await json.json(), { cards: [] });
  assert.equal(upstreamCalls[1]?.url, 'https://api.hearthstonejson.com/v1/latest/ruRU/cards.json');

  const transformed = await fetch(`${baseUrl}/db/uploads/transform.png?width=384&quality=82&format=webp`);
  assert.equal(transformed.status, 200);
  assert.equal(transformed.headers.get('content-type'), 'image/webp');
  assert.ok((await transformed.arrayBuffer()).byteLength > 0);
  assert.equal(
    upstreamCalls[2]?.url,
    'https://db.kolodahs.ru/uploads/transform.png',
    'image transformation parameters must not be forwarded to the upstream source',
  );

  const missingSource = await fetch(`${baseUrl}/evil/uploads/cards/TEST.webp`);
  assert.equal(missingSource.status, 400);

  const rejectedPath = await fetch(`${baseUrl}/db/api/v1/private.json`);
  assert.equal(rejectedPath.status, 400);

  const rejectedType = await fetch(`${baseUrl}/wiki/images/wrong-type.svg`);
  assert.equal(rejectedType.status, 502);

  const rejectedRedirect = await fetch(`${baseUrl}/db/uploads/redirect-off-origin.png`);
  assert.equal(rejectedRedirect.status, 502);

  const rejectedLiveRedirect = await fetch(`${baseUrl}/db/uploads/redirect-live.png`);
  assert.equal(rejectedLiveRedirect.status, 502);
  assert.equal(forbiddenRedirectHits, 0, 'an off-allowlist redirect target must never be contacted');

  const decompressed = await fetch(`${baseUrl}/hsjson-api/v1/gzip.json`);
  assert.equal(decompressed.status, 200);
  assert.equal(await decompressed.text(), compressedPayload);
  assert.notEqual(
    decompressed.headers.get('content-length'),
    String(gzipSync(compressedPayload).byteLength),
    'a compressed upstream length must not be reused for the decoded body',
  );
  assert.match(decompressed.headers.get('cache-control') ?? '', /stale-while-revalidate/);

  const deckviewPreview = await fetch(
    `${baseUrl}/deckview/static/generated/render-cache/aa/deck.preview-v1.webp`,
  );
  assert.equal(deckviewPreview.status, 206);
  assert.equal(
    upstreamCalls.at(-1)?.url,
    'https://api.blizzcore.ru/static/generated/render-cache/aa/deck.preview-v1.webp',
  );

  const battlegroundCard = await fetch(
    `${baseUrl}/bg/api/card-art?id=BG32_MagicItem_205&locale=ruRU&size=512x`,
  );
  assert.equal(battlegroundCard.status, 206);
  assert.equal(
    upstreamCalls.at(-1)?.url,
    'https://bg.kolodahearthstone.ru/api/card-art?id=BG32_MagicItem_205&locale=ruRU&size=512x',
    'the proxy must preserve the localized card-art query while retaining the fixed origin',
  );

  const rejectedLargeResource = await fetch(`${baseUrl}/db/uploads/too-large.png`);
  assert.equal(rejectedLargeResource.status, 502);

  assert.equal(upstreamCalls.length, 10, 'rejected source and path must not reach the network');
} finally {
  await Promise.all([
    new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
    new Promise<void>((resolve, reject) => compressedServer.close(error => error ? reject(error) : resolve())),
    new Promise<void>((resolve, reject) => forbiddenServer.close(error => error ? reject(error) : resolve())),
    new Promise<void>((resolve, reject) => redirectServer.close(error => error ? reject(error) : resolve())),
  ]);
}

console.log('public resource route tests passed');
