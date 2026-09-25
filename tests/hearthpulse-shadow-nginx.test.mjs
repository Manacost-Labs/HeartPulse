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
const monitor = readFileSync('deploy/monitor-hearthpulse-shadow.sh', 'utf8');
const monitorService = readFileSync('deploy/systemd/hearthpulse-shadow-monitor.service', 'utf8');

assert.match(application, /server_name\s+hearthpulse\.net;/);
assert.match(application, /server_name\s+www\.hearthpulse\.net;/);
assert.match(application, /listen\s+443\s+ssl\s+http2;/,
  'the application must remain compatible with the Nginx 1.24 regional edge');
assert.doesNotMatch(application, /http2\s+on;/);
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
assert.match(canonicalApplicationLocation, /proxy_no_cache\s+1;/,
  'the canonical edge must not store application responses in its proxy cache');
assert.match(canonicalApplicationLocation, /proxy_cache_bypass\s+1;/,
  'the canonical edge must always bypass its proxy cache');
assert.doesNotMatch(canonicalApplicationLocation, /add_header\s+Cache-Control/,
  'the canonical edge must preserve the application Cache-Control policy');
assert.match(application,
  /location = \/_proxy_health \{[\s\S]*?add_header Cache-Control "no-store" always;/,
  'the synthetic health endpoint must remain uncacheable');

assert.match(cdn, /server_name\s+cdn\.hearthpulse\.net;/);
assert.match(cdn, /ssl_certificate\s+\/etc\/nginx\/ssl\/hearthpulse\.net\/fullchain\.pem;/);
assert.match(cdn, /location\s+~\s+\^\/\(\?:api\/card-image\//,
  'the CDN must explicitly allow only public paths');
assert.match(cdn, /add_header\s+Access-Control-Allow-Origin\s+"\*"\s+always;/);
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

await verifyBrowserAssetCompression();
console.log('HearthPulse canonical nginx contract passed');
