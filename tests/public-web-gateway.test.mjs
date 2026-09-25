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
  for (const page of ['faq', 'privacy', 'terms', 'developers/api', 'articles', 'classes', 'tierlist', 'legendaries']) {
    assert.equal(publicWebOwner(`/${page}/`, true), 'legacy');
    assert.equal(publicWebOwner(`/${page}/`, false, 'GET', true), 'next');
    assert.equal(publicWebOwner(`/${page}/`, false, 'POST', true), 'legacy');
  }
  assert.equal(publicWebOwner('/standard/cards/', false, 'GET', true), 'legacy');
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
