import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createPublicWebGateway } from '../scripts/public-web-gateway.mjs';
import { publicWebOwner } from '../apps/public-web/routeOwnership.mjs';

async function listen(server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}

test('route ownership preserves default and assigns only the pilot namespace', () => {
  for (const path of ['/standard/cards', '/standard/cards/', '/standard/cards/standard/', '/standard/cards/wild/', '/standard/cards/invalid/', '/standard/cards/wild/bad/extra/', '/standard/cards/standard/CARD_1/', '/standard/cards/wild/blizzard%3A12345', '/_next/static/app.js']) {
    assert.equal(publicWebOwner(path), 'legacy');
    assert.equal(publicWebOwner(path, true), 'next');
    assert.equal(publicWebOwner(path, true, 'POST'), 'legacy');
  }
  for (const path of ['/', '/standard/cards-extra/', '/api/auth/me', '/profile/', '/sitemap.xml', '/assets/app.js']) {
    assert.equal(publicWebOwner(path, true), 'legacy');
  }
});

test('switch and rollback retain paths, query, cookies, bodies and response cookies', async () => {
  const fixture = owner => http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    res.setHeader('set-cookie', 'session=fixture; HttpOnly; Path=/');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ owner, url: req.url, cookie: req.headers.cookie, method: req.method, body }));
  });
  const legacy = fixture('legacy'); const next = fixture('next');
  const legacyOrigin = await listen(legacy); const nextOrigin = await listen(next);
  try {
    for (const enabled of [false, true, false]) {
      const gateway = createPublicWebGateway({ legacyOrigin, nextOrigin, enabled });
      const origin = await listen(gateway);
      try {
        const path = '/standard/cards/wild/blizzard%3A12345/?period=7d&rank=diamond';
        const response = await fetch(`${origin}${path}`, { headers: { Cookie: 'session=local' } });
        assert.match(response.headers.get('set-cookie'), /HttpOnly/);
        assert.deepEqual(await response.json(), { owner: enabled ? 'next' : 'legacy', url: path, cookie: 'session=local', method: 'GET', body: '' });
        const api = await fetch(`${origin}/api/auth/logout`, { method: 'POST', body: '{"fixture":true}', headers: { Cookie: 'session=local' } });
        assert.deepEqual(await api.json(), { owner: 'legacy', url: '/api/auth/logout', cookie: 'session=local', method: 'POST', body: '{"fixture":true}' });
      } finally { await close(gateway); }
    }
  } finally { await close(legacy); await close(next); }
});

test('static public pages roll out independently of cards', () => {
  assert.equal(publicWebOwner('/', false, 'GET', true), 'next');
  assert.equal(publicWebOwner('/', false, 'POST', true), 'legacy');
  for (const path of ['/admin', '/admin/', '/admin/unknown/']) {
    assert.equal(publicWebOwner(path, false, 'GET', true), 'next', path);
    assert.equal(publicWebOwner(path, false, 'HEAD', true), 'next', path);
    assert.equal(publicWebOwner(path, false, 'POST', true), 'legacy', path);
  }
  assert.equal(publicWebOwner('/api/admin/contests', false, 'GET', true), 'legacy');
  for (const path of ['/deck-builder', '/deck-builder/', '/deck-builder/unknown/']) {
    assert.equal(publicWebOwner(path, false, 'GET', true), 'next', path);
    assert.equal(publicWebOwner(path, false, 'POST', true), 'legacy', path);
  }
  assert.equal(publicWebOwner('/api/admin/deck-builder/resolve', false, 'GET', true), 'legacy');
  for (const path of ['/archetypes', '/archetypes/', '/archetypes/856/', '/archetypes/wild/', '/archetypes/unknown/']) {
    assert.equal(publicWebOwner(path, false, 'GET', true), 'next', path);
    assert.equal(publicWebOwner(path, false, 'POST', true), 'legacy', path);
  }
  assert.equal(publicWebOwner('/api/admin/archetypes', false, 'GET', true), 'legacy');
  for (const path of ['/connect', '/connect/', '/connect/unknown/']) {
    assert.equal(publicWebOwner(path, false, 'GET', true), 'next', path);
    assert.equal(publicWebOwner(path, false, 'POST', true), 'legacy', path);
    assert.equal(publicWebOwner(path, false, 'GET', false), 'legacy', path);
  }
  for (const path of ['/id/1/', '/id/0/', '/id/1/unknown/',
    '/profiles/p_AbCdEfGhIjKlMnOpQrStUv/', '/profiles/p_short/']) {
    assert.equal(publicWebOwner(path, false, 'GET', true), 'next', path);
    assert.equal(publicWebOwner(path, false, 'HEAD', true), 'next', path);
    assert.equal(publicWebOwner(path, false, 'POST', true), 'legacy', path);
  }
  for (const page of ['faq', 'privacy', 'terms', 'developers/api', 'articles', 'guides-archive', 'heroes', 'library', 'classes', 'tierlist', 'legendaries', 'standard/matchups', 'standard/meta', 'standard/fun-decks', 'standard/vicious-gold', 'standard/archetypes']) {
    assert.equal(publicWebOwner(`/${page}/`, true), 'legacy');
    assert.equal(publicWebOwner(`/${page}/`, false, 'GET', true), 'next');
    assert.equal(publicWebOwner(`/${page}/`, false, 'POST', true), 'legacy');
  }
  assert.equal(publicWebOwner('/standard/cards/', false, 'GET', true), 'legacy');
  assert.equal(publicWebOwner('/fonts/google/inter-cyrillic.woff2', false, 'GET', true), 'legacy');
  assert.equal(publicWebOwner('/heroes/123/', false, 'GET', true), 'next');
  for (const path of ['/battlegrounds/tier-list/', '/battlegrounds/tier-list/unknown/']) {
    assert.equal(publicWebOwner(path, false, 'GET', true), 'next', path);
    assert.equal(publicWebOwner(path, false, 'POST', true), 'legacy', path);
  }
  for (const path of ['/battlegrounds/strategies/', '/battlegrounds/tier-builder/',
    '/battlegrounds/strategies/unknown/', '/battlegrounds/tier-builder/unknown/']) {
    assert.equal(publicWebOwner(path, false, 'GET', true), 'next', path);
    assert.equal(publicWebOwner(path, false, 'POST', true), 'legacy', path);
  }
  for (const path of ['/cosmetics/', '/cosmetics/heroes/', '/cosmetics/coins/',
    '/cosmetics/pets/', '/cosmetics/unknown/']) {
    assert.equal(publicWebOwner(path, false, 'GET', true), 'next', path);
    assert.equal(publicWebOwner(path, false, 'POST', true), 'legacy', path);
  }
  assert.equal(publicWebOwner('/cosmetics/heroes/TEST_CARD/', false, 'GET', true), 'next');
  for (const path of ['/library/minions/', '/library/spells/', '/library/anomalies/',
    '/library/dark-gifts/', '/library/quests/', '/library/rewards/',
    '/library/darkmoon-prizes/', '/library/trinkets/', '/library/timewarped/',
    '/library/archive/', '/library/archive/minions/', '/library/archive/spells/',
    '/library/archive/anomalies/', '/library/archive/quests/',
    '/library/archive/rewards/', '/library/archive/darkmoon-prizes/',
    '/library/archive/trinkets/']) {
    assert.equal(publicWebOwner(path, false, 'GET', true), 'next');
  }
  assert.equal(publicWebOwner('/library/archive/dark-gifts/', false, 'GET', true), 'legacy');
  assert.equal(publicWebOwner('/library/minions/example-123/', false, 'GET', true), 'next');
  assert.equal(publicWebOwner('/library/spells/example-123/', false, 'POST', true), 'legacy');
  for (const path of ['/library/anomalies/example-123/', '/library/dark-gifts/example-123/',
    '/library/quests/example-123/', '/library/rewards/example-123/',
    '/library/darkmoon-prizes/example-123/', '/library/trinkets/example-123/',
    '/library/timewarped/example-123/', '/library/archive/minions/example-123/',
    '/library/archive/spells/example-123/', '/library/archive/anomalies/example-123/',
    '/library/archive/quests/example-123/', '/library/archive/rewards/example-123/',
    '/library/archive/darkmoon-prizes/example-123/', '/library/archive/trinkets/example-123/']) {
    assert.equal(publicWebOwner(path, false, 'GET', true), 'next', path);
  }
  for (const family of ['archetypes', 'meta']) {
    assert.equal(publicWebOwner(`/standard/${family}/wild/thief-priest/`, false, 'GET', true), 'next');
    assert.equal(publicWebOwner(`/standard/${family}/wild/thief-priest/`, false, 'POST', true), 'legacy');
    assert.equal(publicWebOwner(`/standard/${family}/invalid/detail/`, false, 'GET', true), 'next');
  }
  assert.equal(publicWebOwner('/guides-archive/arena-100-percent/', false, 'GET', true), 'next');
  assert.equal(publicWebOwner('/guides-archive/missing/', false, 'GET', true), 'next');
  assert.equal(publicWebOwner('/guides-archive/arena-100-percent/', false, 'POST', true), 'legacy');
  assert.equal(publicWebOwner('/_next/static/app.js', false, 'GET', true), 'next');
});

test('gallery can roll out without moving API or other editorial routes', () => {
  assert.equal(publicWebOwner('/gallery/', false, 'GET', false, true), 'next');
  assert.equal(publicWebOwner('/gallery', false, 'HEAD', false, true), 'next');
  assert.equal(publicWebOwner('/gallery/', false, 'POST', false, true), 'legacy');
  assert.equal(publicWebOwner('/gallery-extra/', false, 'GET', false, true), 'legacy');
  assert.equal(publicWebOwner('/api/gallery', false, 'GET', false, true), 'legacy');
  assert.equal(publicWebOwner('/articles/', false, 'GET', false, true), 'legacy');
});

test('a static directory serves its files and leaves everything else to the owners', async () => {
  // The fixtures echo the request, so they answer as JSON, never as a sniffable document.
  const upstreamServer = owner => http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ owner, url: req.url }));
  });
  const legacy = upstreamServer('legacy'); const next = upstreamServer('next');
  const legacyOrigin = await listen(legacy); const nextOrigin = await listen(next);
  const gateway = createPublicWebGateway({ legacyOrigin, nextOrigin, enabled: true, pagesEnabled: true, staticDir: 'public' });
  const origin = await listen(gateway);
  try {
    const robots = await fetch(`${origin}/robots.txt`);
    assert.equal(robots.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.match(await robots.text(), /Sitemap:/);
    const icon = await fetch(`${origin}/favicon-32.png?v=1`, { method: 'HEAD' });
    assert.equal(icon.status, 200);
    assert.equal(icon.headers.get('content-type'), 'image/png');

    assert.equal((await (await fetch(`${origin}/api/auth/me`)).json()).owner, 'legacy', 'APIs still reach Express');
    assert.equal((await (await fetch(`${origin}/classes/`)).json()).owner, 'next', 'pages still reach Next.js');
    assert.equal((await (await fetch(`${origin}/missing-file.png`)).json()).owner, 'legacy');
    // Encoded traversal must not leave the directory.
    assert.equal((await (await fetch(`${origin}/..%2Fpackage.json`)).json()).owner, 'legacy');
    const post = await fetch(`${origin}/robots.txt`, { method: 'POST' });
    assert.equal((await post.json()).owner, 'legacy', 'only reads are answered from the directory');
    assert.equal((await fetch(`${origin}/vacancies.pdf`, { method: 'HEAD' })).headers.get('content-type'), 'application/pdf');

    // The `next dev` error overlay posts to its own endpoints on the page origin.
    const frames = await fetch(`${origin}/__nextjs_original-stack-frames`, { method: 'POST', body: '{}' });
    assert.deepEqual(await frames.json(), { owner: 'next', url: '/__nextjs_original-stack-frames' });
  } finally { await close(gateway); await close(legacy); await close(next); }
});

test('development HMR WebSockets reach Next.js and no other upgrade passes', { timeout: 15_000 }, async () => {
  const legacy = http.createServer((req, res) => res.end('legacy'));
  const next = http.createServer((req, res) => res.end('next'));
  const upgrades = [];
  let pendingUpstream = null;
  next.on('upgrade', (request, socket) => {
    if (request.url === '/_next/held') { pendingUpstream = socket; socket.on('error', () => {}); return; }
    if (request.url === '/_next/refused') {
      socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    upgrades.push({ url: request.url, host: request.headers.host });
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
    socket.on('data', chunk => socket.write(`echo:${chunk}`));
    socket.on('end', () => socket.destroy());
    socket.on('error', () => {});
  });
  const legacyOrigin = await listen(legacy); const nextOrigin = await listen(next);
  const gateway = createPublicWebGateway({ legacyOrigin, nextOrigin, enabled: true, pagesEnabled: true });
  const origin = new URL(await listen(gateway));
  const upgrade = path => new Promise((resolve, reject) => {
    const request = http.request({ host: origin.hostname, port: origin.port, path,
      headers: { Connection: 'Upgrade', Upgrade: 'websocket' } });
    request.on('upgrade', (response, socket) => resolve({ status: response.statusCode, socket }));
    request.on('response', response => { response.resume(); resolve({ status: response.statusCode }); });
    request.on('error', reject);
    request.setTimeout(3_000, () => request.destroy(new Error('upgrade was not answered')));
    request.end();
  });
  try {
    const hmr = await upgrade('/_next/webpack-hmr?page=%2Ffaq');
    assert.equal(hmr.status, 101);
    hmr.socket.write('ping');
    const [reply] = await once(hmr.socket, 'data');
    assert.equal(String(reply), 'echo:ping', 'frames flow both ways through the gateway');
    hmr.socket.destroy();
    assert.deepEqual(upgrades, [{ url: '/_next/webpack-hmr?page=%2Ffaq', host: `${origin.hostname}:${origin.port}` }]);

    assert.equal((await upgrade('/api/socket')).status, 200, 'other upgrade requests are served as ordinary requests');
    assert.equal(upgrades.length, 1, 'only Next.js development sockets are forwarded');
    assert.equal((await upgrade('/_next/refused')).status, 403, 'a refused upgrade reaches the client with its status');

    // A client that gives up before Next.js answers must not leave the upstream request open.
    const abandoned = http.request({ host: origin.hostname, port: origin.port, path: '/_next/held',
      headers: { Connection: 'Upgrade', Upgrade: 'websocket' } });
    abandoned.on('error', () => {});
    abandoned.end();
    while (!pendingUpstream) await new Promise(resolve => setTimeout(resolve, 10));
    // The upstream socket is half-open capable, so its end is the signal.
    const upstreamEnded = Promise.race([once(pendingUpstream, 'end'), once(pendingUpstream, 'close')]);
    abandoned.destroy();
    await upstreamEnded;
    pendingUpstream.destroy();
  } finally { await close(gateway); await close(legacy); await close(next); }
});
