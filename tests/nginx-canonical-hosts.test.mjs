import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const inventory = JSON.parse(readFileSync(join(projectRoot, 'config/public-route-inventory.json'), 'utf8'));
const mapSource = readFileSync(join(projectRoot, 'deploy/nginx/arena-seo-map.conf'), 'utf8');
const redirectSource = readFileSync(
  join(projectRoot, 'deploy/nginx/arena-canonical-host-redirect.conf'),
  'utf8',
);

assert.match(mapSource, /map\s+\$uri\s+\$arena_canonical_edge_path\s*\{/,
  'the HTTP-context map must normalize known canonical HTML paths');
assert.match(redirectSource,
  /return\s+301\s+https:\/\/arena\.hs-manacost\.ru\$arena_canonical_edge_path\$is_args\$args;/,
  'every non-canonical host/scheme must redirect directly to the canonical origin');

function substituteRouteParameters(route) {
  const defaults = {
    guideSlug: 'guide-1',
    archetypeId: '123',
    cardId: 'CATA_785',
    dbfId: '76521',
    slugAndDbfId: 'example-76521',
    additionalKind: 'anomalies',
    slug: 'invite_1',
    publicProfileId: 'p_0123456789abcdefghijkl',
    path: 'legacy/item',
  };
  return route.pattern.replace(/:([A-Za-z][A-Za-z0-9]*)(\*)?/g, (_match, name, catchAll) => {
    if (catchAll) return defaults[name] || 'legacy/item';
    const allowed = route.pathParameters?.[name]?.allowedValues;
    return allowed?.[0] || defaults[name] || 'example';
  });
}

function expectedCanonicalPath(route, pathname) {
  if (pathname === '/') return '/';
  return ['static', 'listing', 'detail'].includes(route.kind) ? `${pathname}/` : pathname;
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await new Promise((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose()));
  return address.port;
}

function requestRedirect(port, host, path) {
  return new Promise((resolveRequest, rejectRequest) => {
    const pending = request({ host: '127.0.0.1', port, path, headers: { Host: host } }, response => {
      response.resume();
      response.once('end', () => resolveRequest({ status: response.statusCode, location: response.headers.location }));
    });
    pending.once('error', rejectRequest);
    pending.end();
  });
}

async function runRuntimeContract() {
  const candidates = [process.env.NGINX_BIN, 'nginx', '/usr/sbin/nginx', '/usr/local/sbin/nginx'].filter(Boolean);
  const nginxBinary = candidates.find(candidate => {
    const result = spawnSync(candidate, ['-v'], { encoding: 'utf8' });
    return !result.error && result.status === 0;
  });
  if (!nginxBinary) {
    console.log('nginx binary unavailable; canonical host static contract passed');
    return;
  }

  const root = mkdtempSync(join(tmpdir(), 'arena-canonical-hosts-'));
  let processState = null;
  try {
    chmodSync(root, 0o755);
    const mapFile = join(root, 'arena-seo-map.conf');
    const redirectFile = join(root, 'arena-canonical-host-redirect.conf');
    writeFileSync(mapFile, mapSource);
    writeFileSync(redirectFile, redirectSource);
    const port = await reservePort();
    const config = join(root, 'nginx.conf');
    writeFileSync(config, `
worker_processes 1;
pid ${join(root, 'nginx.pid')};
error_log ${join(root, 'error.log')};
events { worker_connections 64; }
http {
    access_log off;
    include ${mapFile};
    server {
        listen 127.0.0.1:${port};
        server_name arena.hs-manacost.ru www.arena.hs-manacost.ru hs-arena.ru www.hs-arena.ru;
        include ${redirectFile};
    }
}
`);
    const checked = spawnSync(nginxBinary, ['-t', '-p', root, '-c', config], { encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stderr || checked.stdout || 'nginx -t failed');
    processState = spawn(nginxBinary, ['-p', root, '-c', config, '-g', 'daemon off; master_process off;'], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const diagnostics = [];
    processState.stderr.on('data', chunk => diagnostics.push(chunk));
    const exitPromise = new Promise(resolveExit => processState.once('exit', resolveExit));

    let ready = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (processState.exitCode !== null) break;
      try {
        const response = await requestRedirect(port, 'arena.hs-manacost.ru', '/');
        if (response.status === 301) {
          ready = true;
          break;
        }
      } catch {
        // The temporary worker may not have bound yet.
      }
      await new Promise(resolveWait => setTimeout(resolveWait, 40));
    }
    assert.equal(ready, true, Buffer.concat(diagnostics).toString('utf8') || 'temporary nginx readiness timeout');

    const hosts = ['arena.hs-manacost.ru', 'www.arena.hs-manacost.ru', 'hs-arena.ru', 'www.hs-arena.ru'];
    let hostIndex = 0;
    for (const route of inventory.routes) {
      const pathname = route.kind === 'fallback' ? '/definitely-unknown' : substituteRouteParameters(route);
      const query = '?utm_source=contract&value=1';
      const response = await requestRedirect(port, hosts[hostIndex++ % hosts.length], `${pathname}${query}`);
      assert.equal(response.status, 301, `${route.id} edge redirect status`);
      const location = new URL(response.location);
      assert.equal(location.origin, inventory.canonicalOrigin, `${route.id} canonical origin`);
      assert.equal(location.pathname, expectedCanonicalPath(route, pathname), `${route.id} canonical path in one hop`);
      assert.equal(location.search, query, `${route.id} query preservation`);
    }

    for (const unchangedPath of [
      '/tierlist/',
      '/api',
      '/assets/app.js',
      '/sitemap.xml',
      '/sitemaps/static.xml',
      '/sitemaps/standard-cards.xml',
      '/decks/legacy',
    ]) {
      const response = await requestRedirect(port, 'www.arena.hs-manacost.ru', unchangedPath);
      assert.equal(new URL(response.location).pathname, unchangedPath, `${unchangedPath} must not gain another slash`);
    }

    processState.kill('SIGTERM');
    await exitPromise;
    processState = null;
  } finally {
    if (processState && processState.exitCode === null) processState.kill('SIGKILL');
    rmSync(root, { recursive: true, force: true });
  }
}

await runRuntimeContract();
console.log(`canonical host redirect contract passed (${inventory.routes.length} route templates)`);
