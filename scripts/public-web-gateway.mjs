import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { extname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { publicWebOwner } from '../apps/public-web/routeOwnership.mjs';

const STATIC_TYPES = {
  '.avif': 'image/avif', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.otf': 'font/otf',
  '.pdf': 'application/pdf', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml; charset=utf-8',
};

/** Requests of the `next dev` overlay and hot updates; a production server has neither. */
const isNextDevelopmentPath = pathname => pathname.startsWith('/__nextjs');

/** A file of `root` for the request path, or null. Paths cannot leave the directory. */
async function staticFile(root, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  const file = resolve(root, `.${decoded}`);
  if (!file.startsWith(root + sep)) return null;
  const info = await stat(file).catch(() => null);
  return info?.isFile() ? { file, size: info.size } : null;
}

function upstream(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/') {
    throw new Error('Public web upstream must be an HTTP origin without credentials');
  }
  return url;
}

/**
 * Headers of an ordinary proxied request without the hop-by-hop ones. An
 * `Upgrade` offer (curl probes h2c this way) would otherwise reach the
 * upstream, which answers it on a socket this request cannot take over.
 */
function endToEndHeaders(headers) {
  const hopByHop = new Set(['connection', 'upgrade',
    ...String(headers.connection ?? '').toLowerCase().split(',').map(name => name.trim())]);
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !hopByHop.has(name)));
}

/**
 * A loopback stand-in for the production edge, which retains rate limits and
 * TLS. Pages and `/_next/` go to Next.js; everything else goes to the Express
 * origin. With `staticDir` the gateway serves that directory's files itself,
 * as Nginx serves the release static root. Unknown paths get the Express 404,
 * not the Next.js not-found page that Nginx asks for in production.
 * `timeoutMs` bounds an idle upstream; the first `next dev` compile of a page
 * needs more than the default.
 */
export function createPublicWebGateway({
  legacyOrigin, nextOrigin, enabled = false, pagesEnabled = false, galleryEnabled = false, staticDir, timeoutMs = 30_000,
}) {
  const legacy = upstream(legacyOrigin);
  const next = upstream(nextOrigin);
  const staticRoot = staticDir ? resolve(staticDir) : null;
  const upgradesToNext = request => Boolean(request.url?.startsWith('/_next/'));
  // Without the callback Node hands every request with an `Upgrade` header to
  // the upgrade listener, which would drop ordinary requests such as h2c probes.
  const server = http.createServer({ shouldUpgradeCallback: upgradesToNext }, async (request, response) => {
    let pathname;
    try { pathname = new URL(request.url, 'http://gateway.local').pathname; }
    catch { response.writeHead(400).end(); return; }
    const owner = isNextDevelopmentPath(pathname)
      ? 'next' : publicWebOwner(pathname, enabled, request.method, pagesEnabled, galleryEnabled);
    if (staticRoot && owner !== 'next' && ['GET', 'HEAD'].includes(request.method)) {
      const found = await staticFile(staticRoot, pathname);
      if (found) {
        response.writeHead(200, { 'Content-Type': STATIC_TYPES[extname(found.file).toLowerCase()] ?? 'application/octet-stream',
          'Content-Length': found.size, 'Cache-Control': 'no-cache' });
        if (request.method === 'HEAD') response.end();
        // A file removed after `stat` must end the response, not the process.
        else pipeline(createReadStream(found.file), response, () => {});
        return;
      }
    }
    const target = owner === 'next' ? next : legacy;
    const transport = target.protocol === 'https:' ? https : http;
    const proxy = transport.request(target, {
      method: request.method, path: request.url,
      headers: { ...endToEndHeaders(request.headers), 'x-forwarded-host': request.headers.host ?? '', 'x-forwarded-proto': 'http' },
    }, upstreamResponse => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    proxy.setTimeout(timeoutMs, () => proxy.destroy(new Error('Upstream timeout')));
    proxy.on('error', () => {
      if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end('Сервис временно недоступен');
    });
    request.on('aborted', () => proxy.destroy());
    response.on('close', () => { if (!response.writableEnded) proxy.destroy(); });
    request.pipe(proxy);
  });
  // `next dev` pushes hot updates over a WebSocket below `/_next/`. No other
  // upgrade is forwarded.
  server.on('upgrade', (request, socket, head) => {
    if (!upgradesToNext(request)) { socket.destroy(); return; }
    const transport = next.protocol === 'https:' ? https : http;
    const proxy = transport.request(next, { method: request.method, path: request.url, headers: request.headers });
    const statusLine = response => `HTTP/1.1 ${response.statusCode} ${response.statusMessage}`;
    const headerLines = response => Object.entries(response.headers).flatMap(([name, value]) =>
      (Array.isArray(value) ? value : [value]).map(item => `${name}: ${item}`));
    // Node removes its own listeners before it hands the socket over, so a
    // reset of the client must be handled here from the first moment.
    const closeClient = () => { socket.destroy(); proxy.destroy(); };
    for (const event of ['end', 'close', 'error']) socket.on(event, closeClient);
    proxy.on('upgrade', (upstreamResponse, upstreamSocket, upstreamHead) => {
      socket.write([statusLine(upstreamResponse), ...headerLines(upstreamResponse), '', ''].join('\r\n'));
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) upstreamSocket.write(head);
      // HTTP server sockets stay half-open after the peer ends, so end both sides together.
      const closeBoth = () => { socket.destroy(); upstreamSocket.destroy(); };
      for (const peer of [socket, upstreamSocket]) {
        for (const event of ['end', 'close', 'error']) peer.on(event, closeBoth);
      }
      socket.pipe(upstreamSocket);
      upstreamSocket.pipe(socket);
    });
    // Next.js refused the upgrade: pass its answer on instead of a bare close.
    // The body arrives decoded, so the closed connection marks its end.
    proxy.on('response', upstreamResponse => {
      const lines = headerLines(upstreamResponse).filter(line => !/^(?:content-length|transfer-encoding|connection):/i.test(line));
      socket.write([statusLine(upstreamResponse), ...lines, 'connection: close', '', ''].join('\r\n'));
      upstreamResponse.pipe(socket);
    });
    proxy.on('error', () => socket.destroy());
    proxy.end();
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createPublicWebGateway({
    legacyOrigin: process.env.LEGACY_WEB_ORIGIN ?? 'http://127.0.0.1:3001',
    nextOrigin: process.env.NEXT_WEB_ORIGIN ?? 'http://127.0.0.1:4320',
    enabled: process.env.PUBLIC_CARDS_NEXT_ENABLED === '1',
    pagesEnabled: process.env.PUBLIC_PAGES_NEXT_ENABLED === '1',
    galleryEnabled: process.env.PUBLIC_GALLERY_NEXT_ENABLED === '1',
    staticDir: process.env.PUBLIC_WEB_STATIC_DIR || undefined,
    timeoutMs: Number(process.env.PUBLIC_WEB_TIMEOUT_MS) || undefined,
  });
  // Loopback by default; set PUBLIC_WEB_HOST to reach the gateway from another device.
  server.listen(Number(process.env.PUBLIC_WEB_PORT ?? 4317), process.env.PUBLIC_WEB_HOST || '127.0.0.1');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
