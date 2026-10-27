import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

const vhost = readFileSync('deploy/nginx/hearthpulse-legacy-hs-arena.conf', 'utf8');
const servers = vhost.split(/^server \{$/m).slice(1);

test('both retired names redirect to HearthPulse on 80 and 443 with the edge certificate', () => {
  assert.equal(servers.length, 2);
  for (const server of servers) {
    assert.match(server, /server_name hs-arena\.ru www\.hs-arena\.ru;/);
    assert.match(server, /return 301 https:\/\/hearthpulse\.net\$request_uri;/);
    assert.doesNotMatch(server, /proxy_pass|deckview/, 'the deckview API is no longer answered under these names');
  }
  const [plain, tls] = servers;
  assert.match(plain, /listen 80;\n\s+listen \[::\]:80;/);
  assert.match(tls, /listen 443 ssl http2;\n\s+listen \[::\]:443 ssl http2;/,
    'the listen form matches the other edge vhosts');
  assert.match(tls, /ssl_certificate \/etc\/nginx\/ssl\/hs-arena\.ru\/fullchain\.pem;/);
  assert.match(tls, /ssl_certificate_key \/etc\/nginx\/ssl\/hs-arena\.ru\/privkey\.pem;/);
  assert.doesNotMatch(vhost, /default_server/, 'unknown names keep reaching the edge default server');
  assert.doesNotMatch(plain.split('location / {')[0], /^\s+return /m,
    'a server-level return on port 80 would also answer the ACME challenge');
});

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

// `ca` is the test's own certificate, so HTTPS requests still verify the chain
// and the requested name.
function fetchOnce(ca, port, host, path) {
  const request = ca ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const pending = request({ host: '127.0.0.1', port, path, headers: { Host: host },
      ...(ca ? { servername: host, ca } : {}) }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8') }));
    });
    pending.once('error', reject);
    pending.end();
  });
}

async function fetchStarted(...args) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { return await fetchOnce(...args); } catch { await new Promise(resolve => setTimeout(resolve, 40)); }
  }
  throw new Error('temporary edge did not start');
}

// The installed vhost runs unchanged except for its listen addresses and file
// paths, so the test exercises the real redirect and ACME locations.
test('a temporary nginx answers the retired names with one redirect and keeps the ACME path', async t => {
  const binary = ['nginx', '/usr/sbin/nginx'].find(candidate =>
    spawnSync(candidate, ['-v'], { encoding: 'utf8' }).status === 0);
  if (!binary || spawnSync('openssl', ['version']).status !== 0) {
    t.skip('nginx or openssl is not installed');
    return;
  }
  const root = mkdtempSync(join(tmpdir(), 'hearthpulse-legacy-hs-arena-'));
  const [plainPort, tlsPort] = [await freePort(), await freePort()];
  const certificate = join(root, 'fullchain.pem');
  const key = join(root, 'privkey.pem');
  const generated = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=hs-arena.ru', '-addext', 'subjectAltName=DNS:hs-arena.ru,DNS:www.hs-arena.ru',
    '-keyout', key, '-out', certificate], { encoding: 'utf8' });
  assert.equal(generated.status, 0, generated.stderr);
  const ca = readFileSync(certificate);
  mkdirSync(join(root, 'acme/.well-known/acme-challenge'), { recursive: true });
  writeFileSync(join(root, 'acme/.well-known/acme-challenge/token'), 'token.key-authorization');
  const local = vhost
    .replace('listen 80;', `listen 127.0.0.1:${plainPort};`)
    .replace('listen 443 ssl http2;', `listen 127.0.0.1:${tlsPort} ssl;`)
    .replace(/^\s+listen \[::\]:\d+[^;]*;\n/gm, '')
    .replace('/etc/nginx/ssl/hs-arena.ru/fullchain.pem', certificate)
    .replace('/etc/nginx/ssl/hs-arena.ru/privkey.pem', key)
    .replace('/var/www/letsencrypt', join(root, 'acme'));
  const config = join(root, 'nginx.conf');
  writeFileSync(config, `worker_processes 1;
pid ${join(root, 'nginx.pid')};
error_log ${join(root, 'error.log')} warn;
events { worker_connections 32; }
http {
  access_log off;
${local}
}
`);
  const syntax = spawnSync(binary, ['-t', '-p', root, '-c', config], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
  const nginx = spawn(binary, ['-p', root, '-c', config, '-g', 'daemon off; master_process off;']);
  try {
    for (const host of ['hs-arena.ru', 'www.hs-arena.ru']) {
      for (const [trusted, port] of [[null, plainPort], [ca, tlsPort]]) {
        const response = await fetchStarted(trusted, port, host, '/render?deck=AAE&lang=ru');
        assert.equal(response.status, 301, `${host} ${trusted ? 'https' : 'http'}`);
        assert.equal(response.headers.location, 'https://hearthpulse.net/render?deck=AAE&lang=ru');
        assert.doesNotMatch(response.body, /deckview/);
      }
    }
    const tls = await fetchStarted(ca, tlsPort, 'hs-arena.ru', '/');
    assert.equal(tls.headers['x-robots-tag'], 'noindex, follow');
    const challenge = await fetchStarted(null, plainPort, 'hs-arena.ru', '/.well-known/acme-challenge/token');
    assert.equal(challenge.status, 200, 'HTTP-01 renewal must keep working');
    assert.equal(challenge.body, 'token.key-authorization');
    assert.equal((await fetchStarted(null, plainPort, 'hs-arena.ru', '/.well-known/acme-challenge/missing')).status, 404);
  } finally {
    nginx.kill('SIGTERM');
    await new Promise(resolve => nginx.once('exit', resolve));
    rmSync(root, { recursive: true, force: true });
  }
});
