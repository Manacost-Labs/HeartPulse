import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, request } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';

const application = readFileSync('deploy/nginx/hearthpulse-shadow-app.conf', 'utf8');
const cdn = readFileSync('deploy/nginx/hearthpulse-shadow-cdn.conf', 'utf8');
const edgeCacheDeclarations = readFileSync('deploy/nginx/arena-edge-cache-path.conf', 'utf8');
const monitor = readFileSync('deploy/monitor-hearthpulse-shadow.sh', 'utf8');
const monitorService = readFileSync('deploy/systemd/hearthpulse-shadow-monitor.service', 'utf8');

assert.match(application, /server_name\s+hearthpulse\.net;/);
assert.match(application, /server_name\s+www\.hearthpulse\.net;/);
assert.match(application, /listen\s+443\s+ssl\s+http2;/,
  'the application must remain compatible with the Nginx 1.24 regional edge');
assert.doesNotMatch(application, /http2\s+on;/);
assert.match(application, /server_name\s+hearthpulse\.net;\n\n\s+# Owned by the manacost MCP project[^\n]*\n\s+include \/etc\/nginx\/snippets\/manacost-mcp-edge\.conf;/,
  'the installed MCP snippet must survive an install of this vhost');
assert.match(application, /ssl_certificate\s+\/etc\/nginx\/ssl\/hearthpulse\.net\/fullchain\.pem;/);
assert.match(application, /ssl_certificate_key\s+\/etc\/nginx\/ssl\/hearthpulse\.net\/privkey\.pem;/);
assert.match(application, /proxy_set_header\s+Host\s+arena\.hs-manacost\.ru;/,
  'origin transport must keep the established routing host');
assert.match(application, /proxy_set_header\s+X-Forwarded-Host\s+\$host;/,
  'the application must receive the canonical public host');
assert.match(application, /proxy_set_header\s+Accept-Encoding\s+"";/,
  'the edge must continue to decode origin responses before host rewriting');
const nextAssetLocation = application.match(/location \^~ \/_next\/ \{([\s\S]*?)\n    \}/)?.[1];
assert.ok(nextAssetLocation, 'the edge must isolate build-asset delivery');
assert.match(nextAssetLocation, /gzip\s+on;/,
  'the public edge must recompress responses for browsers');
assert.match(nextAssetLocation, /gzip_types[^;]*application\/javascript[^;]*text\/css/,
  'the public edge must compress Next JavaScript and CSS');
assert.match(nextAssetLocation, /proxy_pass\s+https:\/\/hs_arena_origin;/,
  'build assets must still reach the established origin');
assert.match(nextAssetLocation, /proxy_no_cache\s+1;/,
  'build assets must preserve the existing cache bypass');
assert.match(nextAssetLocation, /proxy_cache_bypass\s+1;/);
assert.match(nextAssetLocation, /add_header\s+X-Content-Type-Options\s+nosniff\s+always;/,
  'the dedicated asset location must retain security headers');
const staticAssetLocation = application.match(/location \^~ \/_next\/static\/ \{([\s\S]*?)\n    \}/)?.[1];
assert.ok(staticAssetLocation, 'content-hashed build assets must have their own edge-cached location');
const publicFileLocation = application.match(/location ~ \^\/\(\?:assets\/\|fonts\/[^\n]*\{([\s\S]*?)\n    \}/)?.[1];
assert.ok(publicFileLocation, 'public static files must have their own edge-cached location');
for (const [name, location] of [['build assets', staticAssetLocation], ['public files', publicFileLocation]]) {
  assert.match(location, /proxy_cache\s+hs_arena_cache;/, `${name} must be kept on the edge`);
  assert.match(location, /proxy_cache_key\s+"hearthpulse:\$request_uri";/, `${name} must use this host's cache key`);
  assert.doesNotMatch(location, /proxy_cache_valid/, `${name} must be stored only as long as the origin allows`);
  assert.doesNotMatch(location, /proxy_set_header/, `${name} must keep the server-level upstream headers`);
  assert.match(location, /proxy_ignore_headers\s+Set-Cookie\s+Vary;/);
  assert.match(location, /proxy_hide_header\s+Set-Cookie;/, `${name} must never pass a cookie from a shared copy`);
  for (const header of ['Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy']) {
    assert.match(location, new RegExp(`proxy_hide_header\\s+${header};`),
      `${name} must repeat the server-level hidden headers, or the origin copy doubles the edge one`);
  }
  assert.match(location, /add_header\s+X-Content-Type-Options\s+nosniff\s+always;/, `${name} must keep security headers`);
  assert.match(location, /add_header\s+Strict-Transport-Security\s+"max-age=31536000"\s+always;/);
  assert.match(location, /add_header\s+X-Proxy-Cache\s+\$upstream_cache_status\s+always;/);
}
assert.doesNotMatch(publicFileLocation, /runtime-config/, 'runtime switches must never be cached on the edge');
const canonicalServerStart = application.indexOf('listen 443 ssl http2;');
assert.doesNotMatch(application.slice(canonicalServerStart,
  application.indexOf('location = /_proxy_health', canonicalServerStart)), /gzip\s+on;/,
  'authenticated HTML must not inherit compression');
assert.match(application, /proxy_ssl_name\s+arena\.hs-manacost\.ru;/);
assert.match(application, /proxy_hide_header\s+Strict-Transport-Security;/);
assert.match(application, /Strict-Transport-Security\s+"max-age=31536000"/);
assert.doesNotMatch(application,
  /location\s+\/\s*\{[^}]*X-Robots-Tag\s+"noindex, nofollow"/s,
  'the canonical application location must be indexable');
assert.match(application,
  /server_name\s+www\.hearthpulse\.net;[\s\S]*return\s+301\s+https:\/\/hearthpulse\.net\$request_uri;/,
  'www must normalize to the apex in one hop');

const canonicalApplicationLocation = application.match(
  /location \/ \{\n\s+proxy_pass https:\/\/hs_arena_origin;[\s\S]*?\n\s+\}/,
)?.[0];
assert.ok(canonicalApplicationLocation, 'the canonical proxy location must exist');
assert.match(canonicalApplicationLocation, /proxy_cache\s+hearthpulse_documents;/,
  'anonymous documents use their own short-lived zone, never the image and asset cache');
assert.match(canonicalApplicationLocation,
  /proxy_cache_key\s+"hearthpulse-document:\$http_rsc\|\$http_next_router_prefetch\|\$http_next_router_segment_prefetch\|\$http_next_router_state_tree\|\$http_next_url\|\$request_uri";/,
  'every request header the documents vary on must be part of the key, the free-form URI last');
assert.match(canonicalApplicationLocation,
  /proxy_cache_bypass\s+\$hearthpulse_document_private_request\s+\$hearthpulse_document_unkeyable_request;/,
  'a request with a cookie, a credential or an ambiguous key part must never read the shared copy');
assert.match(canonicalApplicationLocation,
  /proxy_no_cache\s+\$hearthpulse_document_private_request\s+\$hearthpulse_document_unkeyable_request\s+\$hearthpulse_document_not_shared;/,
  'only an anonymous, marked response may fill the shared copy');
assert.match(canonicalApplicationLocation, /proxy_cache_use_stale\s+off;/,
  'an expired document is never served, not even while the origin fails');
assert.doesNotMatch(canonicalApplicationLocation.replace(/#.*$/gm, ''),
  /proxy_cache_use_stale\s+(?!off;)|updating|proxy_cache_background_update|proxy_cache_lock/,
  'a document copy must not be served past its minute');
assert.match(canonicalApplicationLocation, /proxy_cache_valid\s+200\s+60s;/);
assert.doesNotMatch(canonicalApplicationLocation, /proxy_ignore_headers[^;]*Set-Cookie/,
  'a response that sets a cookie must never be stored');
assert.match(canonicalApplicationLocation, /proxy_hide_header\s+X-HearthPulse-Edge-Cache;/,
  'the edge marker is not part of the browser contract');
assert.doesNotMatch(canonicalApplicationLocation, /add_header\s+Cache-Control/,
  'the canonical edge must preserve the application Cache-Control policy');
assert.match(edgeCacheDeclarations,
  /keys_zone=hearthpulse_documents:20m max_size=1g inactive=1h use_temp_path=off;/);
assert.match(edgeCacheDeclarations, /map "\$http_cookie\$http_authorization" \$hearthpulse_document_private_request \{\s+"" 0;\s+default 1;/);
const apiLocation = application.match(/location \/api\/ \{([\s\S]*?)\n    \}/)?.[1];
assert.ok(apiLocation, 'Express responses must stay outside the document cache');
assert.match(apiLocation, /proxy_no_cache\s+1;/);
assert.match(apiLocation, /proxy_cache_bypass\s+1;/);
const publicMediaLocation = application.match(/location ~ \^\/api\/\(\?:article-cover\$\|public-resource\/\) \{([\s\S]*?)\n    \}/)?.[1];
assert.ok(publicMediaLocation, 'public article covers and wiki art must be kept on the edge');
assert.match(publicMediaLocation, /proxy_cache\s+hs_arena_cache;/);
assert.doesNotMatch(publicMediaLocation, /proxy_cache_valid/, 'public media is stored only as long as the origin allows');
assert.match(publicMediaLocation, /proxy_hide_header\s+Set-Cookie;/);
assert.match(application, /location ~ \^\/\(\?:assets\/\|fonts\/\|\(\?:[^)]*\buploads\b[^)]*\)\//,
  'immutable uploaded covers must be kept on the edge');
assert.match(application,
  /location = \/_proxy_health \{[\s\S]*?add_header Cache-Control "no-store" always;/,
  'the synthetic health endpoint must remain uncacheable');

assert.match(cdn, /server_name\s+cdn\.hearthpulse\.net;/);
assert.match(cdn, /ssl_certificate\s+\/etc\/nginx\/ssl\/hearthpulse\.net\/fullchain\.pem;/);
assert.match(cdn, /location\s+~\s+\^\/\(\?:api\/card-image\//,
  'the CDN must explicitly allow only public paths');
assert.match(cdn, /add_header\s+Access-Control-Allow-Origin\s+"\*"\s+always;/);
const cdnPublicLocation = cdn.match(/location ~ \^\/\(\?:api\/card-image\/[^\n]*\{([\s\S]*?)\n    \}/)?.[1];
assert.ok(cdnPublicLocation);
assert.match(cdnPublicLocation, /proxy_cache\s+hs_arena_cache;/, 'card images and public files must be kept on the edge');
assert.match(cdnPublicLocation, /proxy_cache_key\s+"hearthpulse-cdn:\$request_uri";/);
assert.doesNotMatch(cdnPublicLocation, /add_header\s+Cache-Control/,
  'the CDN must pass the single origin Cache-Control instead of adding a second one');
assert.doesNotMatch(cdnPublicLocation, /runtime-config/);
const cdnRuntimeLocation = cdn.match(/location = \/runtime-config\.js \{([\s\S]*?)\n    \}/)?.[1];
assert.ok(cdnRuntimeLocation, 'runtime switches keep their own short browser policy');
assert.doesNotMatch(cdnRuntimeLocation, /proxy_cache\s+hs_arena_cache;/);
assert.match(cdnRuntimeLocation, /proxy_hide_header\s+Cache-Control;/);
assert.match(cdnRuntimeLocation, /add_header\s+Cache-Control\s+"public, max-age=300, stale-while-revalidate=3600"\s+always;/);
assert.match(cdn, /location\s+\/\s*\{[^}]*return\s+404;/s,
  'the CDN must keep private and unknown paths closed');
assert.match(cdn, /Strict-Transport-Security\s+"max-age=31536000"/);

for (const address of ['162.19.220.14', '194.67.92.242', '186.246.28.244']) {
  assert.ok(monitor.includes(address), `the monitor must probe ${address} directly`);
}
for (const host of ['www.hearthpulse.net', 'arena.hs-manacost.ru', 'cdn.arena.hs-manacost.ru']) {
  assert.ok(monitor.includes(host), `the monitor must verify ${host}`);
}
assert.match(monitor, /moscow:194\.67\.92\.242/,
  'Moscow availability must remain a named first-class check');
assert.match(monitor, /ipv6_answers/);
assert.match(monitor, /app_robots[\s\S]*!= \*noindex\*/,
  'the monitor must reject an accidentally noindexed canonical site');
assert.match(monitor, /app_hsts[\s\S]*max-age=31536000/);
assert.match(monitor, /asset_cache[\s\S]*\/favicon\.ico[\s\S]*HIT\|MISS/,
  'the monitor must catch an edge that serves public files past its cache');
assert.match(monitor, /api\/subscription\/status/,
  'the monitor must prove that the CDN does not expose private APIs');
assert.match(monitorService,
  /ExecStart=\/bin\/bash \/var\/www\/koloda\/data\/www\/hs-arena\.ru\/current\/deploy\/monitor-hearthpulse-shadow\.sh/,
  'the service must run the immutable release script');

async function freePort() {
  const server = createNetServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function verifyBrowserAssetCompression() {
  const binary = ['nginx', '/usr/sbin/nginx'].find(candidate =>
    spawnSync(candidate, ['-v'], { encoding: 'utf8' }).status === 0);
  if (!binary) return;
  const directives = nextAssetLocation.match(/        gzip on;\n(?:        gzip_[^\n]+\n)+/)?.[0];
  assert.ok(directives, 'edge gzip directives must remain available for runtime verification');
  const upstream = createHttpServer((incoming, response) => {
    assert.equal(incoming.headers['accept-encoding'], undefined);
    response.writeHead(200, { 'Content-Type': 'application/javascript' });
    response.end('window.nextRuntime = true;'.repeat(100));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const root = mkdtempSync(join(tmpdir(), 'hearthpulse-edge-gzip-'));
  const port = await freePort();
  const config = join(root, 'nginx.conf');
  writeFileSync(config, `worker_processes 1;
pid ${join(root, 'nginx.pid')};
events { worker_connections 32; }
http {
  access_log ${join(root, 'access.log')} combined;
  error_log ${join(root, 'error.log')} warn;
  server {
    listen 127.0.0.1:${port};
${directives}
    proxy_set_header Accept-Encoding "";
    location / { proxy_pass http://127.0.0.1:${upstream.address().port}; }
  }
}
`);
  const syntax = spawnSync(binary, ['-t', '-p', root, '-c', config], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
  const processState = spawn(binary, ['-p', root, '-c', config, '-g', 'daemon off; master_process off;']);
  try {
    let received;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        received = await new Promise((resolve, reject) => {
          const pending = request({ host: '127.0.0.1', port, path: '/_next/static/test.js',
            headers: { 'Accept-Encoding': 'gzip' } }, response => {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve({ status: response.statusCode,
              headers: response.headers, body: Buffer.concat(chunks) }));
          });
          pending.once('error', reject);
          pending.end();
        });
        break;
      } catch { await new Promise(resolve => setTimeout(resolve, 40)); }
    }
    assert.ok(received, 'temporary edge must start');
    assert.equal(received.status, 200);
    assert.equal(received.headers['content-encoding'], 'gzip');
    assert.match(received.headers.vary || '', /Accept-Encoding/i);
    assert.match(gunzipSync(received.body).toString('utf8'), /nextRuntime/);
  } finally {
    processState.kill('SIGTERM');
    await new Promise(resolve => processState.once('exit', resolve));
    await new Promise(resolve => upstream.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
}

// A temporary nginx runs the real build-asset location against a stub origin:
// the second request comes from the edge copy, an error is never stored, and
// an origin answer that forbids caching is fetched again every time.
async function verifyEdgeAssetCache() {
  const binary = ['nginx', '/usr/sbin/nginx'].find(candidate =>
    spawnSync(candidate, ['-v'], { encoding: 'utf8' }).status === 0);
  if (!binary) return;
  const hits = new Map();
  const upstream = createHttpServer((incoming, response) => {
    hits.set(incoming.url, (hits.get(incoming.url) ?? 0) + 1);
    if (incoming.url.endsWith('/missing.js')) {
      response.writeHead(404, { 'Content-Type': 'text/plain' }).end('missing');
      return;
    }
    const immutable = !incoming.url.endsWith('/private.js');
    response.writeHead(200, { 'Content-Type': 'application/javascript', 'Set-Cookie': 'session=secret',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-store' });
    response.end('window.nextRuntime = true;'.repeat(100));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const root = mkdtempSync(join(tmpdir(), 'hearthpulse-edge-cache-'));
  const port = await freePort();
  const config = join(root, 'nginx.conf');
  const location = staticAssetLocation.replace('https://hs_arena_origin', `http://127.0.0.1:${upstream.address().port}`);
  writeFileSync(config, `worker_processes 1;
pid ${join(root, 'nginx.pid')};
events { worker_connections 32; }
http {
  access_log ${join(root, 'access.log')} combined;
  error_log ${join(root, 'error.log')} warn;
  proxy_cache_path ${join(root, 'cache')} levels=1:2 keys_zone=hs_arena_cache:1m max_size=10m inactive=1h use_temp_path=off;
  server {
    listen 127.0.0.1:${port};
    proxy_set_header Accept-Encoding "";
    location ^~ /_next/static/ {${location}
    }
  }
}
`);
  const syntax = spawnSync(binary, ['-t', '-p', root, '-c', config], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
  const processState = spawn(binary, ['-p', root, '-c', config, '-g', 'daemon off; master_process off;']);
  const fetchAsset = path => new Promise((resolve, reject) => {
    const pending = request({ host: '127.0.0.1', port, path, headers: { 'Accept-Encoding': 'gzip' } }, response => {
      response.resume();
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers }));
    });
    pending.once('error', reject);
    pending.end();
  });
  try {
    let first;
    for (let attempt = 0; attempt < 50 && !first; attempt += 1) {
      first = await fetchAsset('/_next/static/chunks/app.js').catch(() => null);
      if (!first) await new Promise(resolve => setTimeout(resolve, 40));
    }
    assert.ok(first, 'temporary edge must start');
    assert.equal(first.headers['x-proxy-cache'], 'MISS');
    assert.equal(first.headers['set-cookie'], undefined, 'a cookie must never leave the edge copy');
    const second = await fetchAsset('/_next/static/chunks/app.js');
    assert.equal(second.headers['x-proxy-cache'], 'HIT');
    assert.equal(second.headers['content-encoding'], 'gzip');
    assert.equal(second.headers['x-content-type-options'], 'nosniff');
    assert.equal(hits.get('/_next/static/chunks/app.js'), 1, 'the origin is asked once');
    await fetchAsset('/_next/static/chunks/missing.js');
    assert.equal((await fetchAsset('/_next/static/chunks/missing.js')).status, 404);
    assert.equal(hits.get('/_next/static/chunks/missing.js'), 2, 'an error answer is never stored');
    await fetchAsset('/_next/static/chunks/private.js');
    await fetchAsset('/_next/static/chunks/private.js');
    assert.equal(hits.get('/_next/static/chunks/private.js'), 2, 'an uncacheable answer is never stored');
  } finally {
    processState.kill('SIGTERM');
    await new Promise(resolve => processState.once('exit', resolve));
    await new Promise(resolve => upstream.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
}

// A temporary nginx runs the real document location and its maps against a
// stub origin. Each path answers with a counter, so a repeated body proves a
// stored copy and a new body proves a trip to the origin.
async function verifyEdgeDocumentCache() {
  const binary = ['nginx', '/usr/sbin/nginx'].find(candidate =>
    spawnSync(candidate, ['-v'], { encoding: 'utf8' }).status === 0);
  if (!binary) return;
  const VARY = 'rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding';
  const hits = new Map();
  // What the origin answers for a path from now on: `gone` (404), `unmarked` or `failing` (502).
  const later = new Map();
  const upstream = createHttpServer((incoming, response) => {
    const url = new URL(incoming.url, 'http://origin');
    const count = (hits.get(url.pathname) ?? 0) + 1;
    hits.set(url.pathname, count);
    if (later.get(url.pathname) === 'failing') {
      response.writeHead(502, { 'Content-Type': 'text/plain' }).end('down');
      return;
    }
    const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-cache', Vary: VARY,
      'X-HearthPulse-Edge-Cache': 'anonymous' };
    if (url.pathname === '/unmarked/' || later.get(url.pathname) === 'unmarked') delete headers['X-HearthPulse-Edge-Cache'];
    if (url.pathname === '/cookie/') headers['Set-Cookie'] = 'session=secret';
    if (url.pathname === '/vary-cookie/') headers.Vary = `${VARY}, Cookie`;
    // Next's answer to an internal prefetch header: a bare `{}` that still
    // carries the marker, with no type and without Accept-Encoding in Vary.
    if (url.pathname === '/bare/' || incoming.headers['x-middleware-prefetch']) {
      response.writeHead(200, { 'X-HearthPulse-Edge-Cache': 'anonymous', Vary: VARY.replace(', Accept-Encoding', '') });
      response.end('{}');
      return;
    }
    if (url.pathname === '/json/') headers['Content-Type'] = 'application/json';
    const status = url.pathname === '/missing/' || later.get(url.pathname) === 'gone' ? 404 : 200;
    response.writeHead(status, headers);
    response.end(`${url.pathname} ${incoming.headers.rsc ?? 'html'} ${incoming.headers.cookie ?? 'guest'} #${count}`);
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const root = mkdtempSync(join(tmpdir(), 'hearthpulse-edge-documents-'));
  const port = await freePort();
  const config = join(root, 'nginx.conf');
  const location = canonicalApplicationLocation
    .replace('https://hs_arena_origin', `http://127.0.0.1:${upstream.address().port}`)
    .replace('proxy_cache_valid 200 60s;', 'proxy_cache_valid 200 1s;');
  const declarations = edgeCacheDeclarations.replaceAll('/var/cache/nginx/', `${root}/`);
  // The canonical server's own upstream headers, including the Next-internal ones it blanks.
  const serverHeaders = application.slice(canonicalServerStart, application.indexOf('location = /_proxy_health', canonicalServerStart))
    .split('\n').filter(line => /^\s+proxy_set_header\s/.test(line) && !/\sHost\s/.test(line)).join('\n');
  assert.match(serverHeaders, /proxy_set_header X-Middleware-Prefetch "";/,
    'Next-internal request headers outside the cache key must not reach the origin');
  writeFileSync(config, `worker_processes 1;
pid ${join(root, 'nginx.pid')};
events { worker_connections 32; }
http {
  access_log ${join(root, 'access.log')} combined;
  error_log ${join(root, 'error.log')} warn;
${declarations}
  server {
    listen 127.0.0.1:${port};
    proxy_http_version 1.1;
${serverHeaders}
    ${location}
  }
}
`);
  const syntax = spawnSync(binary, ['-t', '-p', root, '-c', config], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
  const processState = spawn(binary, ['-p', root, '-c', config, '-g', 'daemon off; master_process off;']);
  const get = (path, headers = {}) => new Promise((resolve, reject) => {
    const pending = request({ host: '127.0.0.1', port, path, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8') }));
    });
    pending.once('error', reject);
    pending.end();
  });
  try {
    let first;
    for (let attempt = 0; attempt < 50 && !first; attempt += 1) {
      first = await get('/tierlist/').catch(() => null);
      if (!first) await new Promise(resolve => setTimeout(resolve, 40));
    }
    assert.ok(first, 'temporary edge must start');
    assert.equal(first.headers['x-proxy-cache'], 'MISS');
    const second = await get('/tierlist/');
    assert.equal(second.headers['x-proxy-cache'], 'HIT');
    assert.equal(second.body, first.body, 'a guest receives the stored anonymous document');
    assert.equal(second.headers['cache-control'], 'private, no-cache', 'browsers keep the application policy');
    assert.equal(second.headers['x-hearthpulse-edge-cache'], undefined, 'the marker never reaches the browser');
    assert.match(second.headers.vary || '', /next-router-state-tree/, 'browsers keep the RSC Vary');

    const signedIn = await get('/tierlist/', { Cookie: '__Host-manacost_auth_token=reader' });
    assert.equal(signedIn.headers['x-proxy-cache'], 'BYPASS', 'a signed-in visitor never reads the shared copy');
    assert.match(signedIn.body, /reader #2$/);
    assert.equal((await get('/tierlist/')).body, first.body, 'a signed-in rendering never replaces the shared copy');
    await get('/account-first/', { Cookie: 'a=1' });
    assert.equal((await get('/account-first/')).headers['x-proxy-cache'], 'MISS',
      'a request with a cookie never fills the shared copy');
    assert.equal((await get('/bearer/', { Authorization: 'Bearer x' })).headers['x-proxy-cache'], 'BYPASS');

    const rsc = await get('/tierlist/', { RSC: '1', 'Next-Router-State-Tree': '%5B%22%22%5D' });
    assert.match(rsc.body, /\/tierlist\/ 1 guest/, 'an RSC payload is a separate entry');
    assert.equal((await get('/tierlist/', { RSC: '1', 'Next-Router-State-Tree': '%5B%22%22%5D' })).body, rsc.body);
    assert.notEqual((await get('/tierlist/', { RSC: '1', 'Next-Router-State-Tree': '%5B%22other%22%5D' })).body, rsc.body,
      'a different router state is a different payload');

    const prefetched = await get('/prefetched/', { 'X-Middleware-Prefetch': '1', 'X-Nextjs-Data': '1' });
    assert.match(prefetched.body, /^\/prefetched\/ html guest #1$/, 'an internal Next header never reaches the origin');
    assert.equal((await get('/prefetched/')).body, prefetched.body, 'the stored copy is the document itself');
    for (const path of ['/unmarked/', '/cookie/', '/vary-cookie/', '/missing/', '/bare/', '/json/']) {
      await get(path);
      await get(path);
      assert.equal(hits.get(path), 2, `${path} must never be stored`);
    }
    assert.deepEqual((await get('/cookie/')).headers['set-cookie'], ['session=secret'],
      'an uncached answer passes its cookie unchanged');

    // The key parts are joined with `|`; a request whose parts could shift that
    // boundary must not share an entry with a plain document request.
    const html = await get('/collision/?_rsc=&x=|1');
    assert.match(html.body, /html guest #1$/);
    const ambiguous = await get('/collision/?_rsc=&x=', { RSC: '1', 'Next-Url': '|' });
    assert.equal(ambiguous.headers['x-proxy-cache'], 'BYPASS', 'an ambiguous key part bypasses the copy');
    assert.match(ambiguous.body, / 1 guest #2$/);
    assert.equal((await get('/collision/?_rsc=&x=|1')).body, html.body, 'the HTML entry is untouched');
    assert.equal((await get('/collision/', { RSC: 'yes' })).headers['x-proxy-cache'], 'BYPASS');

    // nginx compares whole seconds: a 1 s entry is expired only after the next one.
    const expire = async () => new Promise(resolve => setTimeout(resolve, 2100));
    for (const path of ['/refresh/', '/unpublished/', '/unmarked-later/', '/failing/']) await get(path);
    later.set('/unpublished/', 'gone');
    later.set('/unmarked-later/', 'unmarked');
    later.set('/failing/', 'failing');
    await expire();
    const refreshed = await get('/refresh/');
    assert.equal(refreshed.headers['x-proxy-cache'], 'EXPIRED');
    assert.match(refreshed.body, /#2$/, 'an expired copy is replaced before it is served');
    const unpublished = await get('/unpublished/');
    assert.equal(unpublished.status, 404, 'a removed page is never served from an expired copy');
    assert.match((await get('/unmarked-later/')).body, /#2$/, 'a page that lost its marker is fetched again');
    assert.match((await get('/unmarked-later/')).body, /#3$/, 'and is not stored any more');
    const failing = await get('/failing/');
    assert.equal(failing.status, 502, 'an origin failure is never answered with an expired document');
    assert.equal(failing.headers['x-proxy-cache'], 'EXPIRED');
  } finally {
    processState.kill('SIGTERM');
    await new Promise(resolve => processState.once('exit', resolve));
    await new Promise(resolve => upstream.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
}

await verifyBrowserAssetCompression();
await verifyEdgeAssetCache();
await verifyEdgeDocumentCache();
console.log('HearthPulse canonical nginx contract passed');
