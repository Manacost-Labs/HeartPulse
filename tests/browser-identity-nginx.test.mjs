import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, request } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const origin = readFileSync('deploy/nginx/arena-html-routing.conf', 'utf8');
const edge = readFileSync('deploy/nginx/hearthpulse-shadow-app.conf', 'utf8');
const certificatePath = 'deploy/nginx/hearthpulse-identity-origin-ca.crt';
const certificate = readFileSync(certificatePath);
const release = readFileSync('scripts/create-release.mjs', 'utf8');

function locationBlock(source, modifier, path) {
  const start = source.indexOf(`location ${modifier} ${path} {`);
  assert.notEqual(start, -1, `missing location ${modifier} ${path}`);
  let depth = 1;
  for (let cursor = source.indexOf('{', start) + 1; cursor < source.length; cursor += 1) {
    if (source[cursor] === '{') depth += 1;
    if (source[cursor] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, cursor + 1);
  }
  throw new Error(`unclosed location ${modifier} ${path}`);
}

function httpsServer(source) {
  const start = source.lastIndexOf('server {', source.indexOf('listen 443 ssl http2'));
  assert.notEqual(start, -1, 'missing HTTPS server');
  let depth = 1;
  for (let cursor = source.indexOf('{', start) + 1; cursor < source.length; cursor += 1) {
    if (source[cursor] === '{') depth += 1;
    if (source[cursor] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, cursor + 1);
  }
  throw new Error('unclosed HTTPS server');
}

const originIdentity = locationBlock(origin, '^~', '/identity/');
const edgeIdentity = locationBlock(httpsServer(edge), '^~', '/identity/');
const edgeExact = locationBlock(httpsServer(edge), '=', '/identity');

assert.equal(createHash('sha256').update(certificate).digest('hex'),
  '9ecb06f7ac9eb198b379487e89200b898ffcc2f92d9a3bd8813509732f692ea8');
assert.match(certificate.toString('ascii'), /BEGIN CERTIFICATE[\s\S]*END CERTIFICATE/);
assert.match(release, /hearthpulse-identity-origin-ca\.crt/);
assert.match(release, /\/etc\/nginx\/ssl\/hearthpulse-identity-origin-ca\.crt/);
assert.doesNotMatch(edge.slice(0, edge.indexOf('listen 443 ssl http2')), /location\s+\^~\s+\/identity\//,
  'identity proxying must not be installed in the HTTP redirect server');

for (const directive of [
  'proxy_pass http://127.0.0.1:3101;', 'proxy_set_header Host hearthpulse.net;',
  'proxy_set_header X-Forwarded-Host hearthpulse.net;', 'proxy_set_header X-Forwarded-Proto https;',
  'proxy_connect_timeout 5s;', 'proxy_read_timeout 10s;', 'proxy_cache off;',
  'proxy_buffering off;', 'proxy_next_upstream off;', 'error_log /dev/null crit;',
]) assert.ok(originIdentity.includes(directive), `origin identity must contain ${directive}`);

for (const directive of [
  'proxy_pass https://hearthpulse_identity_origin;', 'proxy_set_header Connection close;', 'proxy_ssl_verify on;',
  'proxy_ssl_trusted_certificate /etc/nginx/ssl/hearthpulse-identity-origin-ca.crt;',
  'proxy_ssl_name arena.hs-manacost.ru;', 'proxy_set_header Host arena.hs-manacost.ru;',
  'proxy_set_header X-Forwarded-Host hearthpulse.net;', 'proxy_pass_header Referrer-Policy;',
  'proxy_set_header CF-Connecting-IP $remote_addr;', 'proxy_set_header Forwarded "";',
  'proxy_redirect off;', 'proxy_cache off;', 'proxy_buffering off;',
  'proxy_next_upstream off;', 'error_log /dev/null crit;',
]) assert.ok(edgeIdentity.includes(directive), `edge identity must contain ${directive}`);
const identityUpstream = edge.match(/upstream hearthpulse_identity_origin \{([\s\S]*?)\n\}/)?.[1];
assert.ok(identityUpstream, 'identity must use its own upstream connection pool');
assert.match(identityUpstream, /zone hearthpulse_identity_origin 64k;/);
assert.doesNotMatch(identityUpstream, /keepalive\s+\d+;/, 'identity upstream must not retain TLS sockets');
assert.doesNotMatch(edgeIdentity, /sub_filter\s+/,
  'identity must not inherit or set HTML response rewriting directives');
assert.doesNotMatch(edgeIdentity, /add_header\s+Referrer-Policy/i,
  'the edge must preserve the provider-selected referrer policy');
assert.match(edgeExact, /access_log off;[\s\S]*?error_log \/dev\/null crit;[\s\S]*?return 400;/,
  'bare /identity must not enter inherited 404 handlers');
assert.match(locationBlock(origin, '=', '/identity'), /return 400;/);

async function freePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

function fetch(port, path) {
  return new Promise((resolve, reject) => {
    const pending = request({ host: '127.0.0.1', port, path, headers: { Host: 'hearthpulse.net',
      'CF-Connecting-IP': '203.0.113.17', Forwarded: 'for=203.0.113.17' } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    pending.once('error', reject); pending.end();
  });
}

function nginxBinary() {
  for (const binary of [process.env.NGINX_BIN, 'nginx', '/usr/sbin/nginx', '/usr/local/sbin/nginx'].filter(Boolean)) {
    const result = spawnSync(binary, ['-v'], { encoding: 'utf8' });
    if (!result.error || result.error.code !== 'ENOENT') return binary;
  }
  return null;
}

async function verifyNginxRuntime() {
  const binary = nginxBinary();
  if (!binary) return console.log('nginx binary unavailable; source contract passed');
  let calls = 0;
  const upstream = createHttpServer((incoming, response) => {
    calls += 1;
    assert.equal(incoming.headers.host, 'arena.hs-manacost.ru');
    assert.equal(incoming.headers['x-forwarded-host'], 'hearthpulse.net');
    assert.equal(incoming.headers['cf-connecting-ip'], '127.0.0.1');
    assert.equal(incoming.headers.forwarded, undefined);
    response.writeHead(302, {
      Location: 'https://arena.hs-manacost.ru/identity/interaction?opaque=provider-value',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; form-action 'self'",
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    response.end('identity interaction');
  });
  await new Promise((resolve, reject) => { upstream.once('error', reject); upstream.listen(0, '127.0.0.1', resolve); });
  const upstreamPort = upstream.address().port;
  const root = mkdtempSync(join(tmpdir(), 'identity-nginx-contract-'));
  const port = await freePort();
  const accessLog = join(root, 'access.log');
  const errorLog = join(root, 'error.log');
  const fixture = edgeIdentity
    .replace('proxy_pass https://hearthpulse_identity_origin;', `proxy_pass http://127.0.0.1:${upstreamPort};`)
    .replace(/\s*proxy_ssl_(?:server_name|name|verify|trusted_certificate)\s+[^;]+;/g, '');
  const config = join(root, 'nginx.conf');
  writeFileSync(config, `
worker_processes 1;
pid ${join(root, 'nginx.pid')};
events { worker_connections 32; }
http {
  access_log ${accessLog} combined;
  error_log ${errorLog} warn;
  server {
    listen 127.0.0.1:${port};
    server_name hearthpulse.net;
    proxy_hide_header Referrer-Policy;
    error_page 404 /fallback;
    ${fixture}
    ${edgeExact}
    location = /fallback { return 404; }
    location / { access_log off; return 418; }
  }
}
`);
  const syntax = spawnSync(binary, ['-t', '-p', root, '-c', config], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout || 'nginx -t failed');
  const processState = spawn(binary, ['-p', root, '-c', config, '-g', 'daemon off; master_process off;']);
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try { if ((await fetch(port, '/')).status === 418) break; } catch { /* wait */ }
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    const first = await fetch(port, '/identity/interaction?private=never-log-this');
    const second = await fetch(port, '/identity/interaction?private=never-log-this');
    assert.equal(first.status, 302);
    assert.equal(first.headers.location, 'https://arena.hs-manacost.ru/identity/interaction?opaque=provider-value');
    assert.equal(first.headers['referrer-policy'], 'no-referrer');
    assert.match(first.headers['content-security-policy'] || '', /form-action/);
    assert.equal(first.headers['cache-control'], 'private, no-store');
    assert.equal(first.headers['x-robots-tag'], 'noindex, nofollow');
    assert.equal(calls, 2, 'identity responses must not be served from an edge cache');
    assert.equal((await fetch(port, '/identity?sentinel=never-log-bare-identity')).status, 400);
    assert.equal(existsSync(accessLog) ? readFileSync(accessLog, 'utf8') : '', '', 'identity requests must not enter access logs');
    assert.equal(existsSync(errorLog) ? readFileSync(errorLog, 'utf8') : '', '', 'identity requests must not enter error logs');
  } finally {
    processState.kill('SIGTERM');
    await new Promise(resolve => processState.once('exit', resolve));
    await new Promise(resolve => upstream.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
}

await verifyNginxRuntime();
console.log('browser identity nginx contract passed');
