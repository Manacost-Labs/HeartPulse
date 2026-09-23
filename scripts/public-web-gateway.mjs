import http from 'node:http';
import https from 'node:https';
import { pathToFileURL } from 'node:url';
import { publicWebOwner } from '../apps/public-web/routeOwnership.mjs';

function upstream(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/') {
    throw new Error('Public web upstream must be an HTTP origin without credentials');
  }
  return url;
}

/** A loopback staging gateway. The production edge retains rate limits and TLS. */
export function createPublicWebGateway({ legacyOrigin, nextOrigin, enabled = false, pagesEnabled = false }) {
  const legacy = upstream(legacyOrigin);
  const next = upstream(nextOrigin);
  return http.createServer((request, response) => {
    let pathname;
    try { pathname = new URL(request.url, 'http://gateway.local').pathname; }
    catch { response.writeHead(400).end(); return; }
    const target = publicWebOwner(pathname, enabled, request.method, pagesEnabled) === 'next' ? next : legacy;
    const transport = target.protocol === 'https:' ? https : http;
    const proxy = transport.request(target, {
      method: request.method, path: request.url,
      headers: { ...request.headers, 'x-forwarded-host': request.headers.host ?? '', 'x-forwarded-proto': 'http' },
    }, upstreamResponse => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    proxy.setTimeout(30_000, () => proxy.destroy(new Error('Upstream timeout')));
    proxy.on('error', () => {
      if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end('Сервис временно недоступен');
    });
    request.on('aborted', () => proxy.destroy());
    response.on('close', () => { if (!response.writableEnded) proxy.destroy(); });
    request.pipe(proxy);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createPublicWebGateway({
    legacyOrigin: process.env.LEGACY_WEB_ORIGIN ?? 'http://127.0.0.1:3001',
    nextOrigin: process.env.NEXT_WEB_ORIGIN ?? 'http://127.0.0.1:4320',
    enabled: process.env.PUBLIC_CARDS_NEXT_ENABLED === '1',
    pagesEnabled: process.env.PUBLIC_PAGES_NEXT_ENABLED === '1',
  });
  server.listen(Number(process.env.PUBLIC_WEB_PORT ?? 4317), '127.0.0.1');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
