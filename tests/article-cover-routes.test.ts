import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { createArticleCoverRouter } from '../server/articleCoverRoutes.js';

const upstream = createServer((request, response) => {
  if (request.url === '/image') {
    response.writeHead(200, { 'Content-Type': 'image/png' });
    return response.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  }
  if (request.url === '/same-host-redirect') {
    response.writeHead(302, { Location: '/image' });
    return response.end();
  }
  if (request.url === '/foreign-redirect') {
    const address = upstream.address();
    assert.ok(address && typeof address === 'object');
    response.writeHead(302, { Location: `http://localhost:${address.port}/image` });
    return response.end();
  }
  if (request.url === '/text') {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    return response.end('text');
  }
  if (request.url === '/declared-large') {
    response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': '5' });
    return response.end('12345');
  }
  if (request.url === '/streamed-large') {
    response.writeHead(200, { 'Content-Type': 'image/png', 'Transfer-Encoding': 'chunked' });
    response.write('123');
    return response.end('456');
  }
  response.writeHead(404, { 'Content-Type': 'text/plain' });
  return response.end('missing');
});

await new Promise<void>((resolve, reject) => {
  upstream.listen(0, '127.0.0.1', resolve);
  upstream.once('error', reject);
});
const upstreamAddress = upstream.address();
assert.ok(upstreamAddress && typeof upstreamAddress === 'object');
const upstreamOrigin = `http://127.0.0.1:${upstreamAddress.port}`;

const app = express();
app.use('/api', createArticleCoverRouter({
  allowedHosts: new Set(['127.0.0.1']),
  maxBytes: 4,
  timeoutMs: 2_000,
  maxRedirects: 2,
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}/api/article-cover`;

const coverUrl = (path: string) => `${baseUrl}?url=${encodeURIComponent(`${upstreamOrigin}${path}`)}`;

try {
  const invalid = await fetch(`${baseUrl}?url=not-a-url`);
  assert.equal(invalid.status, 400);

  const forbidden = await fetch(`${baseUrl}?url=${encodeURIComponent('http://localhost/image')}`);
  assert.equal(forbidden.status, 400);

  const image = await fetch(coverUrl('/image'));
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.match(image.headers.get('cache-control') || '', /stale-while-revalidate=604800/);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const etag = image.headers.get('etag');
  assert.ok(etag);

  const notModified = await fetch(coverUrl('/image'), { headers: { 'If-None-Match': etag } });
  assert.equal(notModified.status, 304);

  const redirected = await fetch(coverUrl('/same-host-redirect'));
  assert.equal(redirected.status, 200);
  assert.deepEqual(Buffer.from(await redirected.arrayBuffer()), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const foreignRedirect = await fetch(coverUrl('/foreign-redirect'));
  assert.equal(foreignRedirect.status, 502);
  assert.deepEqual(await foreignRedirect.json(), { error: 'Перенаправление на запрещённый домен' });

  const wrongType = await fetch(coverUrl('/text'));
  assert.equal(wrongType.status, 415);

  const declaredLarge = await fetch(coverUrl('/declared-large'));
  assert.equal(declaredLarge.status, 413);

  const streamedLarge = await fetch(coverUrl('/streamed-large'));
  assert.equal(streamedLarge.status, 413);

  const missing = await fetch(coverUrl('/missing'));
  assert.equal(missing.status, 404);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await new Promise<void>((resolve, reject) => upstream.close(error => error ? reject(error) : resolve()));
}

console.log('article cover router contract tests passed');
