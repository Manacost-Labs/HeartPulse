import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import sharp from 'sharp';
import { ARTICLE_COVER_WIDTHS, createArticleCoverRouter } from '../server/articleCoverRoutes.js';
import { encodeArticleCoverVariant } from '../server/articleCoverVariant.js';

const coverPng = await sharp({
  create: { width: 1176, height: 597, channels: 4, background: { r: 120, g: 40, b: 160, alpha: 1 } },
}).composite([{
  input: await sharp({ create: { width: 400, height: 200, channels: 3, background: '#f5c542' } }).png().toBuffer(),
  left: 100,
  top: 100,
}]).png().toBuffer();
const smallPng = await sharp({ create: { width: 300, height: 150, channels: 3, background: '#2050a0' } }).png().toBuffer();
const animatedWebp = await sharp([
  await sharp({ create: { width: 40, height: 20, channels: 3, background: '#ff0000' } }).webp().toBuffer(),
  await sharp({ create: { width: 40, height: 20, channels: 3, background: '#0000ff' } }).webp().toBuffer(),
], { join: { animated: true } }).webp().toBuffer();
const gifBytes = Buffer.from('GIF89a-not-really');

const upstreamHits = new Map<string, number>();
const hits = (path: string) => upstreamHits.get(path) ?? 0;
const uploadHits = (name: string) => hits(`/wp-content/uploads${name}`);

// Files are served by their last path segment, so one fixture answers every
// spelling of its URL; hits are counted per requested path.
const upstream = createServer((request, response) => {
  upstreamHits.set(request.url ?? '', hits(request.url ?? '') + 1);
  const path = (request.url ?? '').slice((request.url ?? '').lastIndexOf('/'));
  if (path === '/image') {
    response.writeHead(200, { 'Content-Type': 'image/png' });
    return response.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  }
  if (path === '/same-host-redirect') {
    response.writeHead(302, { Location: '/image' });
    return response.end();
  }
  if (path === '/foreign-redirect' || path === '/cover-foreign-redirect.png') {
    const address = upstream.address();
    assert.ok(address && typeof address === 'object');
    response.writeHead(302, { Location: `http://localhost:${address.port}/cover.png` });
    return response.end();
  }
  if (path === '/text') {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    return response.end('text');
  }
  if (path === '/declared-large') {
    response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': '5' });
    return response.end('12345');
  }
  if (path === '/streamed-large') {
    response.writeHead(200, { 'Content-Type': 'image/png', 'Transfer-Encoding': 'chunked' });
    response.write('123');
    return response.end('456');
  }
  if (path === '/cover.png' || path === '/cover-2.png' || path === '/cover.png?v=2' || /^\/c\d\.png$/.test(path)) {
    response.writeHead(200, { 'Content-Type': 'image/png' });
    return response.end(coverPng);
  }
  if (path === '/slow-cover.png') {
    setTimeout(() => {
      response.writeHead(200, { 'Content-Type': 'image/png' });
      response.end(coverPng);
    }, 150);
    return undefined;
  }
  if (path === '/small.png') {
    response.writeHead(200, { 'Content-Type': 'image/png' });
    return response.end(smallPng);
  }
  if (path === '/animated.webp') {
    response.writeHead(200, { 'Content-Type': 'image/webp' });
    return response.end(animatedWebp);
  }
  if (path === '/cover.gif') {
    response.writeHead(200, { 'Content-Type': 'image/gif' });
    return response.end(gifBytes);
  }
  if (path === '/corrupt.png') {
    response.writeHead(200, { 'Content-Type': 'image/png' });
    return response.end(Buffer.from('definitely not a png'));
  }
  if (path === '/cover.svg') {
    response.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    return response.end('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
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

// Covers are requested from https://covers.test; this fetch serves them from
// the local upstream while keeping the redirect handling of the real fetch.
const fetchedUrls: string[] = [];
const localFetch: typeof fetch = (input, init) => {
  const url = new URL(input instanceof URL ? input.href : String(input));
  fetchedUrls.push(url.href);
  return fetch(url.hostname.endsWith('covers.test') ? `${upstreamOrigin}${url.pathname}${url.search}` : url, init);
};
const coverHosts = new Set(['covers.test', 'www.covers.test', '127.0.0.1']);

let clock = 1_000_000;
let activeEncodes = 0;
let peakEncodes = 0;
const app = express();
app.use('/limited/api', createArticleCoverRouter({
  allowedHosts: new Set(['127.0.0.1']),
  maxBytes: 4,
  timeoutMs: 2_000,
  maxRedirects: 2,
}));
app.use('/api', createArticleCoverRouter({
  allowedHosts: coverHosts,
  maxBytes: 1024 * 1024,
  fetchImpl: localFetch,
  timeoutMs: 2_000,
  maxRedirects: 2,
  cacheTtlMs: 60_000,
  now: () => clock,
}));
app.use('/two-entries/api', createArticleCoverRouter({
  allowedHosts: coverHosts,
  maxBytes: 1024 * 1024,
  fetchImpl: localFetch,
  cacheMaxEntries: 2,
}));
app.use('/tiny-bytes/api', createArticleCoverRouter({
  allowedHosts: coverHosts,
  maxBytes: 1024 * 1024,
  fetchImpl: localFetch,
  cacheMaxBytes: 800,
}));
app.use('/counted-encodes/api', createArticleCoverRouter({
  allowedHosts: coverHosts,
  maxBytes: 1024 * 1024,
  fetchImpl: localFetch,
  encodeVariant: async (source, width) => {
    activeEncodes += 1;
    peakEncodes = Math.max(peakEncodes, activeEncodes);
    try {
      await new Promise(resolve => setTimeout(resolve, 60));
      return await encodeArticleCoverVariant(source, width);
    } finally {
      activeEncodes -= 1;
    }
  },
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const serverOrigin = `http://127.0.0.1:${address.port}`;

const proxyUrl = (source: string, query = '', mount = '') =>
  `${serverOrigin}${mount}/api/article-cover?url=${encodeURIComponent(source)}${query}`;
const coverUrl = (name: string, query = '', mount = '') =>
  proxyUrl(`https://covers.test/wp-content/uploads${name}`, query, mount);
const limitedCoverUrl = (path: string) => proxyUrl(`${upstreamOrigin}${path}`, '', '/limited');

try {
  // Existing proxy contract: allowlist, redirects, type and size checks.
  const invalid = await fetch(`${serverOrigin}/limited/api/article-cover?url=not-a-url`);
  assert.equal(invalid.status, 400);

  const forbidden = await fetch(`${serverOrigin}/limited/api/article-cover?url=${encodeURIComponent('http://localhost/image')}`);
  assert.equal(forbidden.status, 400);

  const image = await fetch(limitedCoverUrl('/image'));
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.match(image.headers.get('cache-control') || '', /stale-while-revalidate=604800/);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const etag = image.headers.get('etag');
  assert.ok(etag);

  const notModified = await fetch(limitedCoverUrl('/image'), { headers: { 'If-None-Match': etag } });
  assert.equal(notModified.status, 304);

  const redirected = await fetch(limitedCoverUrl('/same-host-redirect'));
  assert.equal(redirected.status, 200);
  assert.deepEqual(Buffer.from(await redirected.arrayBuffer()), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const foreignRedirect = await fetch(limitedCoverUrl('/foreign-redirect'));
  assert.equal(foreignRedirect.status, 502);
  assert.deepEqual(await foreignRedirect.json(), { error: 'Перенаправление на запрещённый домен' });

  const wrongType = await fetch(limitedCoverUrl('/text'));
  assert.equal(wrongType.status, 415);

  const declaredLarge = await fetch(limitedCoverUrl('/declared-large'));
  assert.equal(declaredLarge.status, 413);

  const streamedLarge = await fetch(limitedCoverUrl('/streamed-large'));
  assert.equal(streamedLarge.status, 413);

  const missing = await fetch(limitedCoverUrl('/missing'));
  assert.equal(missing.status, 404);

  // Responsive variants: only allowlisted widths, WebP, never enlarged.
  assert.deepEqual([...ARTICLE_COVER_WIDTHS], [480, 720, 960]);
  for (const badWidth of ['999', 'abc', '', '480.0', '0x1e0']) {
    const rejected = await fetch(coverUrl('/cover.png', `&w=${badWidth}`));
    assert.equal(rejected.status, 400, `w=${badWidth} must be rejected`);
  }
  const multipleWidths = await fetch(coverUrl('/cover.png', '&w=480&w=960'));
  assert.equal(multipleWidths.status, 400, 'a repeated w parameter must be rejected');
  assert.equal(uploadHits('/cover.png'), 0, 'invalid widths must be rejected before any upstream fetch');

  const forbiddenVariant = await fetch(proxyUrl('https://localhost/wp-content/uploads/cover.png', '&w=480'));
  assert.equal(forbiddenVariant.status, 400, 'the host allowlist applies to variants as well');

  const variant = await fetch(coverUrl('/cover.png', '&w=480'));
  assert.equal(variant.status, 200);
  assert.equal(variant.headers.get('content-type'), 'image/webp');
  assert.equal(variant.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(variant.headers.get('cache-control'), 'public, max-age=86400, stale-while-revalidate=604800');
  assert.equal(variant.headers.get('vary'), null, 'the variant never depends on request headers');
  assert.equal(variant.headers.get('x-article-cover-cache'), 'MISS');
  const variantBody = Buffer.from(await variant.arrayBuffer());
  const variantMeta = await sharp(variantBody).metadata();
  assert.equal(variantMeta.format, 'webp');
  assert.equal(variantMeta.width, 480);
  assert.ok(variantBody.length < coverPng.length, 'the variant is smaller than the source');
  const variantEtag = variant.headers.get('etag');
  assert.ok(variantEtag);
  assert.equal(uploadHits('/cover.png'), 1);

  const cachedVariant = await fetch(coverUrl('/cover.png', '&w=480'));
  assert.equal(cachedVariant.headers.get('x-article-cover-cache'), 'HIT');
  assert.equal(cachedVariant.headers.get('etag'), variantEtag);
  assert.deepEqual(Buffer.from(await cachedVariant.arrayBuffer()), variantBody);
  assert.equal(uploadHits('/cover.png'), 1, 'a cached variant is served without an upstream fetch');

  const cachedNotModified = await fetch(coverUrl('/cover.png', '&w=480'), { headers: { 'If-None-Match': variantEtag } });
  assert.equal(cachedNotModified.status, 304);
  assert.equal(uploadHits('/cover.png'), 1, 'a revalidation is answered from the cache');

  const widerVariant = await fetch(coverUrl('/cover.png', '&w=960'));
  assert.equal((await sharp(Buffer.from(await widerVariant.arrayBuffer())).metadata()).width, 960);
  assert.notEqual(widerVariant.headers.get('etag'), variantEtag, 'each width has its own validator');
  assert.equal(uploadHits('/cover.png'), 2);

  const original = await fetch(coverUrl('/cover.png'));
  assert.equal(original.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), coverPng, 'without w the original bytes are relayed');
  assert.notEqual(original.headers.get('etag'), variantEtag);
  const cachedOriginal = await fetch(coverUrl('/cover.png'));
  assert.equal(cachedOriginal.headers.get('x-article-cover-cache'), 'HIT');
  assert.equal(uploadHits('/cover.png'), 3, 'the original is cached too');

  const small = await fetch(coverUrl('/small.png', '&w=960'));
  assert.equal((await sharp(Buffer.from(await small.arrayBuffer())).metadata()).width, 300, 'a variant is never enlarged');

  // Concurrent misses for one variant share one upstream fetch.
  const concurrent = await Promise.all(Array.from({ length: 5 }, () => fetch(coverUrl('/slow-cover.png', '&w=720'))));
  assert.deepEqual(concurrent.map(response => response.status), [200, 200, 200, 200, 200]);
  assert.equal(new Set(concurrent.map(response => response.headers.get('etag'))).size, 1);
  assert.equal(uploadHits('/slow-cover.png'), 1, 'concurrent misses are coalesced');

  // The cache expires with its TTL.
  clock += 61_000;
  const expired = await fetch(coverUrl('/cover.png', '&w=480'));
  assert.equal(expired.headers.get('x-article-cover-cache'), 'MISS');
  assert.equal(uploadHits('/cover.png'), 4, 'an expired entry is fetched again');

  // Spellings of one file share one entry; a miss fetches the canonical URL.
  for (const spelling of [
    'https://www.covers.test/wp-content/uploads/cover.png',
    'https://COVERS.test/wp-content//uploads/%63over.png',
    'https://covers.test/wp-content/uploads/./cover.png',
  ]) {
    const respelled = await fetch(proxyUrl(spelling, '&w=480'));
    assert.equal(respelled.headers.get('x-article-cover-cache'), 'HIT', `${spelling} must reuse the cached entry`);
  }
  assert.equal(uploadHits('/cover.png'), 4);
  const wwwMiss = await fetch(proxyUrl('https://www.covers.test/wp-content//uploads/cover-2.png', '&w=480'));
  assert.equal(wwwMiss.headers.get('content-type'), 'image/webp');
  assert.equal(fetchedUrls.at(-1), 'https://covers.test/wp-content/uploads/cover-2.png');

  // Any `?` or `#`, plain HTTP, a port or a path outside an uploads directory
  // is relayed as before: original bytes, re-fetched every time.
  for (const source of [
    'https://covers.test/wp-content/uploads/cover.png?',
    'https://covers.test/wp-content/uploads/cover.png#',
    'http://covers.test/wp-content/uploads/cover.png',
    'https://covers.test:8443/wp-content/uploads/cover.png',
  ]) {
    const relayedBefore = uploadHits('/cover.png');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const relayed = await fetch(proxyUrl(source, '&w=480'));
      assert.equal(relayed.headers.get('content-type'), 'image/png', `${source} must not be re-encoded`);
      assert.equal(relayed.headers.get('x-article-cover-cache'), 'MISS', `${source} must not be cached`);
    }
    assert.equal(uploadHits('/cover.png'), relayedBefore + 2);
  }
  const outsideUploads = await fetch(proxyUrl('https://covers.test/media/cover.png', '&w=480'));
  assert.equal(outsideUploads.headers.get('content-type'), 'image/png');
  assert.equal(outsideUploads.headers.get('x-article-cover-cache'), 'MISS');

  // Re-encodes run two at a time; the others queue instead of failing.
  const burst = await Promise.all([1, 2, 3, 4, 5].map(index => fetch(coverUrl(`/c${index}.png`, '&w=480', '/counted-encodes'))));
  assert.deepEqual(burst.map(response => response.headers.get('content-type')), Array(5).fill('image/webp'));
  assert.equal(peakEncodes, 2, 'no more than two re-encodes run at once');

  // Formats that must not be re-encoded keep their bytes.
  const gif = await fetch(coverUrl('/cover.gif', '&w=480'));
  assert.equal(gif.headers.get('content-type'), 'image/gif');
  assert.deepEqual(Buffer.from(await gif.arrayBuffer()), gifBytes);

  const animated = await fetch(coverUrl('/animated.webp', '&w=480'));
  assert.deepEqual(Buffer.from(await animated.arrayBuffer()), animatedWebp, 'an animated image is relayed unchanged');

  const corrupt = await fetch(coverUrl('/corrupt.png', '&w=480'));
  assert.equal(corrupt.status, 200);
  assert.equal(corrupt.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await corrupt.arrayBuffer()).toString(), 'definitely not a png', 'a failed re-encode falls back to the original');
  await fetch(coverUrl('/corrupt.png', '&w=480'));
  assert.equal(uploadHits('/corrupt.png'), 2, 'a failed re-encode is not cached');

  const svg = await fetch(coverUrl('/cover.svg', '&w=480'));
  assert.equal(svg.status, 415, 'scriptable SVG is never served from this origin');
  const svgOriginal = await fetch(coverUrl('/cover.svg'));
  assert.equal(svgOriginal.status, 415);

  // Upstream failures and checks are not cached.
  await fetch(coverUrl('/missing.png', '&w=480'));
  const missingAgain = await fetch(coverUrl('/missing.png', '&w=480'));
  assert.equal(missingAgain.status, 404);
  assert.equal(uploadHits('/missing.png'), 2);

  const foreignVariant = await fetch(coverUrl('/cover-foreign-redirect.png', '&w=480'));
  assert.equal(foreignVariant.status, 502, 'a variant cannot be fetched through a redirect to a foreign host');

  // A source with a query string is relayed as is and never cached, so
  // cache-busting parameters cannot force re-encodes or evict real covers.
  const queried = await fetch(coverUrl('/cover.png?v=2', '&w=480'));
  assert.equal(queried.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await queried.arrayBuffer()), coverPng);
  await fetch(coverUrl('/cover.png?v=2', '&w=480'));
  assert.equal(uploadHits('/cover.png?v=2'), 2);

  // The entry cap evicts the least recently used variant.
  const before = uploadHits('/cover.png');
  await fetch(coverUrl('/cover.png', '&w=960', '/two-entries'));
  await fetch(coverUrl('/cover-2.png', '&w=960', '/two-entries'));
  const touched = await fetch(coverUrl('/cover.png', '&w=960', '/two-entries'));
  assert.equal(touched.headers.get('x-article-cover-cache'), 'HIT');
  await fetch(coverUrl('/cover-2.png', '&w=720', '/two-entries'));
  const kept = await fetch(coverUrl('/cover.png', '&w=960', '/two-entries'));
  assert.equal(kept.headers.get('x-article-cover-cache'), 'HIT', 'a recently used entry survives eviction');
  const evicted = await fetch(coverUrl('/cover-2.png', '&w=960', '/two-entries'));
  assert.equal(evicted.headers.get('x-article-cover-cache'), 'MISS', 'the least recently used entry was evicted');
  assert.equal(uploadHits('/cover.png'), before + 1);

  // An entry too large for the byte budget is served but not kept.
  await fetch(coverUrl('/cover.png', '&w=480', '/tiny-bytes'));
  const notKept = await fetch(coverUrl('/cover.png', '&w=480', '/tiny-bytes'));
  assert.equal(notKept.status, 200);
  assert.equal(notKept.headers.get('x-article-cover-cache'), 'MISS', 'the byte budget bounds the cache');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await new Promise<void>((resolve, reject) => upstream.close(error => error ? reject(error) : resolve()));
}

console.log('article cover router contract tests passed');
