import assert from 'node:assert/strict';
import { constants } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer as createHttpsServer } from 'node:https';
import { createSecureContext } from 'node:tls';

const edge = readFileSync('deploy/nginx/hearthpulse-shadow-app.conf', 'utf8');

function block(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing ${marker}`);
  let depth = 1;
  for (let cursor = source.indexOf('{', start) + 1; cursor < source.length; cursor += 1) {
    if (source[cursor] === '{') depth += 1;
    if (source[cursor] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, cursor + 1);
  }
  throw new Error(`unclosed ${marker}`);
}

function port() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const result = server.address().port;
      server.close(error => error ? reject(error) : resolve(result));
    });
  });
}

function get(portNumber, path) {
  return new Promise((resolve, reject) => {
    const pending = request({ host: '127.0.0.1', port: portNumber, path, headers: { Host: 'hearthpulse.net' } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    pending.once('error', reject);
    pending.setTimeout(3000, () => pending.destroy(new Error(`nginx fixture timed out for ${path}`)));
    pending.end();
  });
}

function command(args) {
  const result = spawnSync('openssl', args, { encoding: 'utf8', stdio: 'ignore' });
  assert.equal(result.status, 0, `openssl ${args[0]} failed`);
}

function nginx() {
  for (const binary of [process.env.NGINX_BIN, 'nginx', '/usr/sbin/nginx', '/usr/local/sbin/nginx'].filter(Boolean)) {
    const probe = spawnSync(binary, ['-v'], { encoding: 'utf8' });
    if (!probe.error || probe.error.code !== 'ENOENT') return binary;
  }
  throw new Error('nginx is required for the identity TLS regression');
}

function certificates(root) {
  const ca = join(root, 'identity-ca.crt');
  const extension = join(root, 'identity.ext');
  command(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=fixture-ca', '-keyout', join(root, 'ca.key'), '-out', ca]);
  command(['req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=identity.fixture', '-keyout', join(root, 'identity.key'), '-out', join(root, 'identity.csr')]);
  writeFileSync(extension, 'subjectAltName=DNS:identity.fixture\n');
  command(['x509', '-req', '-days', '1', '-in', join(root, 'identity.csr'), '-CA', ca, '-CAkey', join(root, 'ca.key'), '-CAcreateserial', '-extfile', extension, '-out', join(root, 'identity.crt')]);
  command(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=legacy.fixture', '-keyout', join(root, 'legacy.key'), '-out', join(root, 'legacy.crt')]);
  return {
    ca,
    identity: { key: readFileSync(join(root, 'identity.key')), cert: readFileSync(join(root, 'identity.crt')) },
    legacy: { key: readFileSync(join(root, 'legacy.key')), cert: readFileSync(join(root, 'legacy.crt')) },
  };
}

function originServer(certificates) {
  let calls = 0;
  const contexts = new Map([
    ['identity.fixture', createSecureContext(certificates.identity)],
    ['legacy.fixture', createSecureContext(certificates.legacy)],
  ]);
  // Tickets are disabled so the observed cross-route state can only be an Nginx TCP keepalive socket.
  const server = createHttpsServer({ ...certificates.identity, secureOptions: constants.SSL_OP_NO_TICKET, sessionTimeout: 0, SNICallback(name, callback) {
    callback(null, contexts.get(name) || contexts.get('legacy.fixture'));
  } }, (incoming, response) => {
    calls += 1;
    const sni = incoming.socket.servername || 'no-sni';
    response.writeHead(200, { 'X-Fixture-SNI': sni });
    response.end(`fixture-sni:${sni}`);
  });
  return { server, calls: () => calls };
}

const genericOrigin = edge.match(/location \/ \{\s+proxy_pass https:\/\/([^;]+);/)?.[1];
const identityBlock = block(edge, 'location ^~ /identity/ {');
const identityOrigin = identityBlock.match(/proxy_pass https:\/\/([^;]+);/)?.[1];
assert.ok(genericOrigin && identityOrigin, 'identity and canonical proxy upstreams must be named');

function identityFixture(ca) {
  return identityBlock
    .replace(/proxy_ssl_name\s+[^;]+;/, 'proxy_ssl_name identity.fixture;')
    .replace(/proxy_ssl_trusted_certificate\s+[^;]+;/, `proxy_ssl_trusted_certificate ${ca};`);
}

async function runFixture(root, tlsPort, ca, label, action) {
  const listen = await port();
  const upstreams = [genericOrigin, identityOrigin].filter((name, index, names) => names.indexOf(name) === index)
    .map(name => `upstream ${name} { server 127.0.0.1:${tlsPort};${name === genericOrigin ? ' keepalive 2;' : ''} }`).join('\n');
  const config = join(root, `${label}.conf`);
  writeFileSync(config, `
worker_processes 1;
pid ${join(root, `${label}.pid`)};
events { worker_connections 32; }
http {
  access_log off;
  error_log ${join(root, `${label}.error.log`)} crit;
  ${upstreams}
  upstream untrusted_origin { server 127.0.0.1:${tlsPort}; }
  server {
    listen 127.0.0.1:${listen};
    server_name hearthpulse.net;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    location /legacy/ {
      proxy_pass https://${genericOrigin};
      proxy_ssl_server_name on;
      proxy_ssl_name legacy.fixture;
      proxy_ssl_verify off;
    }
    ${identityFixture(ca)}
    location /untrusted/ {
      proxy_pass https://untrusted_origin;
      proxy_ssl_server_name on;
      proxy_ssl_name legacy.fixture;
      proxy_ssl_verify on;
      proxy_ssl_trusted_certificate ${ca};
    }
    location / { return 418; }
  }
}`);
  const binary = nginx();
  const syntax = spawnSync(binary, ['-t', '-p', root, '-c', config], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout || 'nginx -t failed');
  const processState = spawn(binary, ['-p', root, '-c', config, '-g', 'daemon off; master_process off;'], { stdio: 'ignore' });
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try { if ((await get(listen, '/')).status === 418) break; } catch { /* wait for nginx */ }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return await action(path => get(listen, path));
  } finally {
    if (processState.exitCode === null) await new Promise(resolve => {
      processState.once('exit', resolve);
      processState.kill('SIGTERM');
    });
  }
}

const root = mkdtempSync(join(tmpdir(), 'identity-tls-pool-'));
let origin;
try {
  const generated = certificates(root);
  origin = originServer(generated);
  await new Promise((resolve, reject) => { origin.server.once('error', reject); origin.server.listen(0, '127.0.0.1', resolve); });
  const tlsPort = origin.server.address().port;
  await runFixture(root, tlsPort, generated.ca, 'untrusted', async fetch => {
    assert.equal((await fetch('/untrusted/proof')).status, 502, 'an untrusted legacy certificate must fail closed');
  });
  await runFixture(root, tlsPort, generated.ca, 'valid', async fetch => {
    const response = await fetch('/identity/proof');
    assert.equal(response.status, 200);
    assert.equal(response.headers['x-fixture-sni'], 'identity.fixture');
    assert.equal(response.body, 'fixture-sni:identity.fixture');
  });
  await runFixture(root, tlsPort, generated.ca, 'pool', async fetch => {
    assert.equal((await fetch('/legacy/prime')).status, 200, 'legacy primer must establish an unverified keepalive TLS socket');
    const before = origin.calls();
    const response = await fetch('/identity/proof');
    assert.equal(origin.calls(), before + 1, 'identity must issue exactly one upstream request without retry');
    assert.equal(response.status, 200);
    assert.equal(response.headers['x-fixture-sni'], 'identity.fixture', 'identity must not reuse a legacy-SNI upstream socket');
    assert.equal(response.body, 'fixture-sni:identity.fixture');
  });
} finally {
  if (origin?.server.listening) await new Promise(resolve => origin.server.close(resolve));
  rmSync(root, { recursive: true, force: true });
}

console.log('browser identity TLS pool regression passed');
