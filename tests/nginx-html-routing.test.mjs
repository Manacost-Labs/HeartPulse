import assert from 'node:assert/strict';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer as createHttpServer, request } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const inventory = JSON.parse(readFileSync(
  join(projectRoot, 'config/public-route-inventory.json'),
  'utf8',
));
const mapSource = readFileSync(join(projectRoot, 'deploy/nginx/arena-seo-map.conf'), 'utf8');
const routingSource = readFileSync(join(projectRoot, 'deploy/nginx/arena-html-routing.conf'), 'utf8');
const edgeStaticSource = readFileSync(
  join(projectRoot, 'deploy/nginx/arena-edge-static-cache.conf'),
  'utf8',
);

function parseLocationBlocks(source) {
  const blocks = [];
  const matcher = /location\s+(=|\^~|~\*|~)?\s*(?:"([^"]+)"|([^\s{]+))\s*\{/g;
  for (const match of source.matchAll(matcher)) {
    let depth = 1;
    let cursor = match.index + match[0].length;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === '{') depth += 1;
      if (source[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    assert.equal(depth, 0, `unclosed nginx location ${match[2]}`);
    blocks.push({
      modifier: match[1] || '',
      pattern: match[2] || match[3],
      body: source.slice(match.index + match[0].length, cursor - 1),
    });
  }
  return blocks;
}

const locations = parseLocationBlocks(routingSource);
const regexLocations = locations
  .filter(location => location.modifier === '~' || location.modifier === '~*')
  .map(location => ({
    ...location,
    regex: new RegExp(location.pattern, location.modifier === '~*' ? 'i' : ''),
  }));

function matchingRegexLocations(pathname) {
  return regexLocations.filter(location => location.regex.test(pathname));
}

function firstMatchingRegexLocation(pathname) {
  return regexLocations.find(location => location.regex.test(pathname));
}

function substituteRouteParameters(route) {
  const defaults = {
    guideSlug: 'guide-1',
    archetypeId: '123',
    cardId: 'CATA_785',
    dbfId: '76521',
    slugAndDbfId: 'example-76521',
    additionalKind: 'anomalies',
    slug: 'invite_1',
    path: 'legacy/item',
  };
  return route.pattern.replace(/:([A-Za-z][A-Za-z0-9]*)(\*)?/g, (_match, name, catchAll) => {
    if (catchAll) return defaults[name] || 'legacy/item';
    const allowed = route.pathParameters?.[name]?.allowedValues;
    return allowed?.[0] || defaults[name] || 'example';
  });
}

function expectRegexAction(pathname, directive, message) {
  const match = firstMatchingRegexLocation(pathname);
  assert.ok(match?.body.includes(directive),
    `${message}: first matching regex for ${pathname} must contain ${directive}; got ${match?.pattern || 'none'}`);
}

assert.match(routingSource, /error_page\s+404\s+=404\s+\/404\.html;/,
  'unknown HTML must preserve an HTTP 404 while rendering the error document');
assert.match(routingSource, /location\s+\/\s*\{[\s\S]*?return\s+404;/,
  'the final prefix location must return a real 404');
assert.doesNotMatch(routingSource, /location\s+\/\s*\{[\s\S]*?try_files[^}]*\/index\.html/,
  'the unknown catch-all must never fall back to the SPA shell');
assert.doesNotMatch(routingSource, /\$http_user_agent|Googlebot|YandexBot/i,
  'HTML routing must not vary content by crawler user-agent');
assert.match(edgeStaticSource, /proxy_cache_valid\s+200\s+301\s+302\s+30d;/,
  'edge proxies may cache successful immutable assets internally');
const edgeLocations = parseLocationBlocks(edgeStaticSource);
const edgeCardImageLocation = edgeLocations.find(location => (
  location.modifier === '^~' && location.pattern === '/api/card-image/'
));
assert.match(edgeCardImageLocation?.body || '', /proxy_cache\s+hs_arena_cache;/,
  'card images must override the generic API BYPASS location and use the regional cache');
assert.match(edgeCardImageLocation?.body || '', /proxy_cache_key\s+"\$scheme:\$request_method:\$host:\$request_uri";/,
  'card-image cache keys must include the immutable source-version query');
assert.doesNotMatch(edgeCardImageLocation?.body || '', /proxy_(?:no_cache|cache_bypass)/,
  'the dedicated card-image edge route must never inherit the generic API bypass');
assert.doesNotMatch(edgeStaticSource, /proxy_cache_valid\s+404|expires\s+30d|Cache-Control/i,
  'edge proxies must preserve the origin no-store policy for missing assets');
assert.match(edgeStaticSource, /X-Proxy-Region\s+\$arena_proxy_region\s+always;/,
  'the shared edge contract must expose its configured region');

for (const machinePath of ['/sitemap.xml', '/sitemaps/static.xml', '/sitemaps/standard-cards.xml']) {
  const exact = locations.find(location => location.modifier === '=' && location.pattern === machinePath);
  assert.match(exact?.body || '', /proxy_pass\s+http:\/\/127\.0\.0\.1:3101;/,
    `${machinePath} must use the runtime sitemap resolver`);
  assert.match(exact?.body || '', /proxy_intercept_errors\s+off;/,
    `${machinePath} must preserve runtime status and cache validators`);
  assert.doesNotMatch(exact?.body || '', /try_files|add_header\s+Cache-Control/i,
    `${machinePath} must never fall back to a static or SPA response`);
}
const unknownSitemaps = locations.find(location => location.modifier === '^~' && location.pattern === '/sitemaps/');
assert.match(unknownSitemaps?.body || '', /proxy_pass\s+http:\/\/127\.0\.0\.1:3101;/,
  'unknown sitemap segments must reach the authoritative 404 resolver');
assert.match(unknownSitemaps?.body || '', /proxy_intercept_errors\s+off;/,
  'unknown sitemap 404 responses must pass through nginx');
assert.match(routingSource, /location\s+~\s+\^\/\(robots\\\.txt\|llms\\\.txt\)\$/,
  'robots and llms controls remain strict static files');
assert.doesNotMatch(routingSource, /location\s+~[^\n]*sitemap\\\.xml[^\n]*\{[\s\S]*?try_files\s+\$uri/,
  'sitemap.xml must no longer be served as a build-time static URL set');

for (const path of ['/api', '/api/health/ready', '/health/live', '/metrics']) {
  if (path === '/api') {
    const exact = locations.find(location => location.modifier === '=' && location.pattern === '/api');
    assert.match(exact?.body || '', /proxy_pass\s+http:\/\/127\.0\.0\.1:3101;/, `${path} proxy`);
  } else {
    const prefix = locations.find(location => location.modifier === '^~'
      && path.startsWith(location.pattern));
    const exact = locations.find(location => location.modifier === '=' && location.pattern === path);
    assert.match(prefix?.body || exact?.body || '', /proxy_pass\s+http:\/\/127\.0\.0\.1:3101;/,
      `${path} must bypass HTML routing`);
  }
  const technicalLocation = path === '/api'
    ? locations.find(location => location.modifier === '=' && location.pattern === '/api')
    : locations.find(location => location.modifier === '^~' && path.startsWith(location.pattern))
      || locations.find(location => location.modifier === '=' && location.pattern === path);
  assert.match(technicalLocation?.body || '', /X-Robots-Tag\s+"noindex, nofollow"\s+always;/,
    `${path} must be server-side noindex for every upstream status`);
  assert.match(technicalLocation?.body || '', /arena-security-headers\.conf/,
    `${path} must retain the shared security headers when adding robots policy`);
}

for (const path of ['/assets/app.js', '/uploads/example.png']) {
  const prefix = locations.find(location => location.modifier === '^~'
    && path.startsWith(location.pattern));
  assert.match(prefix?.body || '', /try_files\s+\$uri\s+=404;/, `${path} must stay a strict static file`);
}
assert.match(routingSource, /location\s+~\*\s+\\\.\(\?:css\|js[\s\S]*?try_files\s+\$uri\s+=404;/,
  'unknown paths with a file extension must never receive index.html');
const yandexVerification = locations.find(location => location.modifier === '='
  && location.pattern === '/yandex_eaea2c59052dad81.html');
assert.equal(existsSync(join(projectRoot, 'public/yandex_eaea2c59052dad81.html')), true,
  'the repository verification document must exist');
assert.match(yandexVerification?.body || '', /try_files\s+\$uri\s+=404;/,
  'the Yandex verification document must bypass the HTML 404 catch-all');

for (const removed of ['/decks', '/decks/legacy/item', '/jobs', '/jobs/archive']) {
  expectRegexAction(removed, 'return 410;', 'removed route');
  const location = firstMatchingRegexLocation(removed);
  assert.match(location?.body || '', /X-Robots-Tag\s+"noindex, nofollow"\s+always;/,
    `${removed} must be noindex`);
}

const adminRedirect = locations.find(location => location.modifier === '=' && location.pattern === '/admin');
const adminDocument = locations.find(location => location.modifier === '=' && location.pattern === '/admin/');
for (const location of [adminRedirect, adminDocument]) {
  assert.match(location?.body || '', /X-Robots-Tag\s+"noindex, nofollow"\s+always;/,
    'admin responses must carry a server-side noindex header');
}
assert.match(adminRedirect?.body || '', /return\s+301\s+\/admin\/\$is_args\$args;/,
  'admin slash normalization must preserve the query string in one redirect');
assert.match(adminDocument?.body || '', /try_files\s+\/admin\/index\.html\s+\/index\.html\s+=404;/,
  'canonical admin route must be allowed to use the SPA shell');

const deckBuilderRedirect = locations.find(location => location.modifier === '=' && location.pattern === '/deck-builder');
const deckBuilderDocument = locations.find(location => location.modifier === '=' && location.pattern === '/deck-builder/');
for (const location of [deckBuilderRedirect, deckBuilderDocument]) {
  assert.match(location?.body || '', /X-Robots-Tag\s+"noindex, nofollow"\s+always;/,
    'deck-builder responses must carry a server-side noindex header');
}
assert.match(deckBuilderRedirect?.body || '', /return\s+301\s+\/deck-builder\/\$is_args\$args;/,
  'deck-builder slash normalization must preserve the query string in one redirect');
assert.match(deckBuilderDocument?.body || '', /try_files\s+\/deck-builder\/index\.html\s+\/index\.html\s+=404;/,
  'canonical deck-builder route must serve its prerendered document');

const authQueryPolicy = inventory.queryPolicies.find(policy => policy.id === 'auth-state');
const adminQueryPolicy = inventory.queryPolicies.find(policy => policy.id === 'admin-state');
assert.match(mapSource, /map\s+\$request_uri\s+\$arena_auth_query_robots\s*\{/,
  'the query policy must use the immutable original URI, not an internally rewritten $uri');
const queryMapRules = [...mapSource.matchAll(/~\*([^\s]+)\s+"(noindex, (?:no)?follow)";/g)]
  .map(match => ({ regex: new RegExp(match[1], 'i'), robots: match[2] }));
assert.ok(queryMapRules.length >= 3, 'every inventory query-policy family must have a route-aware map rule');

function resolveQueryRobots(requestUri) {
  return queryMapRules.find(rule => rule.regex.test(requestUri))?.robots || '';
}

for (const policy of inventory.queryPolicies) {
  const expectedRobots = policy.indexPolicy === 'noindex-nofollow' ? 'noindex, nofollow' : 'noindex, follow';
  for (const pattern of policy.appliesTo) {
    if (pattern === '/admin') continue; // the admin location has a stronger unconditional nofollow header.
    const route = inventory.routes.find(candidate => candidate.pattern === pattern);
    assert.ok(route, `${policy.id} query route ${pattern} must exist`);
    const path = substituteRouteParameters(route);
    const canonicalPath = path === '/' ? '/' : `${path}/`;
    for (const parameter of policy.parameters) {
      assert.equal(resolveQueryRobots(`${canonicalPath}?${parameter}=example`), expectedRobots,
        `${policy.id}:${parameter} first query parameter`);
      assert.equal(resolveQueryRobots(`${canonicalPath}?utm_source=test&${parameter}=example`), expectedRobots,
        `${policy.id}:${parameter} later query parameter`);
    }
  }
}
for (const parameter of [...authQueryPolicy.parameters, ...adminQueryPolicy.parameters]) {
  assert.ok(mapSource.includes(parameter), `${parameter} must be present in the server-side query map`);
}
assert.equal(resolveQueryRobots('/?utm_source=test'), '', 'ordinary home query must not be noindex by accident');

for (const route of inventory.routes) {
  const path = substituteRouteParameters(route);
  if (route.kind === 'fallback') continue;
  if (route.kind === 'legacy') {
    expectRegexAction(path, 'return 410;', route.id);
    continue;
  }
  if (route.kind === 'redirect') {
    assert.equal(route.expectedStatus, 302, `${route.id} inventory redirect status`);
    expectRegexAction(path, 'proxy_pass http://127.0.0.1:3101;', route.id);
    const redirectResolver = firstMatchingRegexLocation(path);
    assert.match(redirectResolver?.body || '', /proxy_intercept_errors\s+off;/,
      `${route.id} must preserve the authoritative redirect or missing-link status`);
    assert.match(redirectResolver?.body || '', /X-Robots-Tag\s+"noindex, nofollow"\s+always;/,
      `${route.id} must stay noindex before the upstream responds`);
    continue;
  }
  if (route.id === 'home') {
    const root = locations.find(location => location.modifier === '=' && location.pattern === '/');
    assert.match(root?.body || '', /try_files\s+\/index\.html\s+=404;/, 'home document');
    continue;
  }
  if (route.id === 'admin-panel') continue;
  if (route.id === 'deck-builder') continue;
  if (route.id === 'archetypes') continue;

  expectRegexAction(path, 'return 301', `${route.id} non-canonical route`);
  const redirect = firstMatchingRegexLocation(path);
  assert.match(redirect?.body || '', /\$uri\/\$is_args\$args;/,
    `${route.id} must add the slash and preserve query in one redirect`);
  if (route.id === 'archetype-detail' || route.id === 'wild-archetype-decks') {
    expectRegexAction(`${path}/`, 'try_files /archetypes/index.html /index.html =404;', `${route.id} canonical route`);
    continue;
  }
  if (route.id === 'standard-card-detail' || route.id === 'bg-hero-detail'
    || route.id === 'bg-library-detail' || route.id === 'cosmetics-detail') {
    expectRegexAction(`${path}/`, 'proxy_pass http://127.0.0.1:3101;', `${route.id} canonical route`);
    const resolver = firstMatchingRegexLocation(`${path}/`);
    assert.doesNotMatch(resolver?.body || '', /try_files\s+[^;]*\/index\.html/,
      `${route.id} must not fall back to a static listing shell`);
    assert.match(resolver?.body || '', /proxy_intercept_errors\s+off;/,
      `${route.id} authoritative 404/503 HTML and headers must pass through nginx`);
    continue;
  }
  expectRegexAction(`${path}/`, '@arena_spa_noindex;', `${route.id} canonical route`);
}

const standardCardsListing = firstMatchingRegexLocation('/standard/cards/standard/');
assert.match(standardCardsListing?.body || '', /try_files\s+\$uri\/index\.html\s+@arena_spa_noindex;/,
  'constructed-card format listings must use the fail-closed SPA fallback');
assert.doesNotMatch(standardCardsListing?.body || '', /proxy_pass/,
  'constructed-card format listings must not be sent through the detail resolver');
const spaFallback = locations.find(location => location.pattern === '@arena_spa_noindex');
assert.match(spaFallback?.body || '', /X-Robots-Tag\s+"noindex, follow"\s+always;/,
  'the SPA fallback must be noindex until a materialized document exists');
assert.match(spaFallback?.body || '', /try_files\s+\/index\.html\s+=404;/,
  'the SPA fallback itself must fail closed when the application shell is missing');

for (const invalidPath of [
  '/articlesevil',
  '/standard/cards/classic',
  '/standard/cards/standard/CATA-785',
  '/standard/cards/standard/A',
  `/standard/cards/standard/${'A'.repeat(81)}`,
  '/heroes/0',
  '/heroes/not-a-number',
  '/library/weapons',
  '/library/minions/missing-numeric-id',
  '/admin/unknown',
]) {
  const htmlMatch = matchingRegexLocations(invalidPath)
    .some(location => location.body.includes('return 301') || location.body.includes('@arena_spa_noindex;'));
  assert.equal(htmlMatch, false, `${invalidPath} must reach the real 404 catch-all`);
}

async function reserveAvailablePort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  assert.notEqual(address, null, 'temporary nginx test port must be allocated');
  assert.equal(typeof address, 'object', 'temporary nginx test must use a TCP port');
  await new Promise((resolveClose, rejectClose) => {
    server.close(error => (error ? rejectClose(error) : resolveClose()));
  });
  return address.port;
}

function requestNginx(port, path, method = 'GET') {
  return new Promise((resolveRequest, rejectRequest) => {
    const pending = request({
      host: '127.0.0.1',
      port,
      path,
      method,
      headers: { Host: 'arena.test' },
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolveRequest({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    pending.once('error', rejectRequest);
    pending.end();
  });
}

async function startCardSeoUpstream() {
  const responses = new Map([
    ['/api', {
      status: 200,
      headers: { 'Cache-Control': 'private, max-age=17' },
      body: '{"api":true}',
    }],
    ['/api/missing', {
      status: 404,
      headers: { 'Cache-Control': 'private, max-age=11' },
      body: '{"error":"missing"}',
    }],
    ['/health/live', {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      body: '{"status":"ok"}',
    }],
    ['/metrics', {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      body: 'arena_requests_total 1\n',
    }],
    ['/sitemap.xml', {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=600',
        ETag: '"sitemap-index"',
        'X-Sitemap-Source': 'static',
      },
      body: '<?xml version="1.0"?><sitemapindex><sitemap><loc>https://arena.hs-manacost.ru/sitemaps/static.xml</loc></sitemap></sitemapindex>',
    }],
    ['/sitemaps/static.xml', {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=600',
        ETag: '"sitemap-static"',
        'Last-Modified': 'Tue, 21 Jul 2026 08:00:00 GMT',
        'X-Sitemap-Source': 'static',
      },
      body: '<?xml version="1.0"?><urlset><url><loc>https://arena.hs-manacost.ru/</loc></url></urlset>',
    }],
    ['/sitemaps/standard-cards.xml', {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=600',
        ETag: '"sitemap-cards"',
        'Last-Modified': 'Tue, 21 Jul 2026 08:05:00 GMT',
        'X-Sitemap-Source': 'catalog',
      },
      body: '<?xml version="1.0"?><urlset><url><loc>https://arena.hs-manacost.ru/standard/cards/standard/CARD_OK/</loc></url></urlset>',
    }],
    ['/sitemaps/unknown.xml', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      body: 'Sitemap not found',
    }],
    ['/r/summer', {
      status: 302,
      headers: {
        Location: '/contests?from=qa',
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      body: '<p>referral-upstream-302</p>',
    }],
    ['/r/summer/', {
      status: 302,
      headers: {
        Location: '/contests?from=qa',
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      body: '<p>referral-upstream-302</p>',
    }],
    ['/r/missing', {
      status: 404,
      headers: {
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      body: '<p>referral-upstream-404</p>',
    }],
    ['/standard/cards/standard/CARD_OK/', {
      status: 200,
      headers: {
        'X-Robots-Tag': 'index, follow, max-image-preview:large',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      body: '<!doctype html><title>Card OK</title><p>card-upstream-200</p>',
    }],
    ['/standard/cards/standard/MISSING_1/', {
      status: 404,
      headers: {
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      body: '<!doctype html><title>Missing card</title><p>card-upstream-404</p>',
    }],
    ['/standard/cards/standard/OUTAGE_1/', {
      status: 503,
      headers: {
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Retry-After': '300',
      },
      body: '<!doctype html><title>Catalog outage</title><p>card-upstream-503</p>',
    }],
    ['/heroes/76521/', {
      status: 200,
      headers: {
        'X-Robots-Tag': 'index, follow, max-image-preview:large',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      body: '<!doctype html><title>Hero OK</title><p>hero-upstream-200</p>',
    }],
    ['/heroes/999999/', {
      status: 404,
      headers: {
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      body: '<!doctype html><title>Missing hero</title><p>hero-upstream-404</p>',
    }],
    ['/heroes/888888/', {
      status: 503,
      headers: {
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Retry-After': '300',
      },
      body: '<!doctype html><title>Hero catalog outage</title><p>hero-upstream-503</p>',
    }],
    ['/library/minions/example-76521/', {
      status: 200,
      headers: {
        'X-Robots-Tag': 'index, follow, max-image-preview:large',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      body: '<!doctype html><title>BG card OK</title><p>bg-card-upstream-200</p>',
    }],
    ['/library/minions/missing-999999/', {
      status: 404,
      headers: {
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      body: '<!doctype html><title>Missing BG card</title><p>bg-card-upstream-404</p>',
    }],
    ['/library/spells/outage-888888/', {
      status: 503,
      headers: {
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Retry-After': '300',
      },
      body: '<!doctype html><title>BG catalog outage</title><p>bg-card-upstream-503</p>',
    }],
  ]);
  const server = createHttpServer((incomingRequest, response) => {
    const pathname = new URL(incomingRequest.url || '/', 'http://arena.test').pathname;
    const fixture = responses.get(pathname);
    if (!fixture) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(`unexpected upstream path: ${pathname}`);
      return;
    }
    response.writeHead(fixture.status, {
      'Content-Type': 'text/html; charset=utf-8',
      ...fixture.headers,
    });
    response.end(fixture.body);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  assert.notEqual(address, null, 'card SEO mock upstream must bind a port');
  assert.equal(typeof address, 'object', 'card SEO mock upstream must use a TCP port');
  return { server, port: address.port };
}

function stopHttpServer(server) {
  return new Promise((resolveClose, rejectClose) => {
    server.close(error => (error ? rejectClose(error) : resolveClose()));
  });
}

async function waitForNginx(port, processState) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (processState.exitCode !== null) {
      throw new Error(`temporary nginx exited before readiness: ${processState.diagnostics()}`);
    }
    try {
      const response = await requestNginx(port, '/');
      if (response.status === 200) return;
    } catch {
      // The worker may not have bound its socket yet.
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 40));
  }
  throw new Error(`temporary nginx readiness timeout: ${processState.diagnostics()}`);
}

async function stopNginx(processState) {
  if (processState.exitCode !== null) return;
  processState.kill('SIGTERM');
  await Promise.race([
    processState.exitPromise,
    new Promise(resolveWait => setTimeout(resolveWait, 2_000)),
  ]);
  if (processState.exitCode === null) {
    processState.kill('SIGKILL');
    await processState.exitPromise;
  }
}

async function runNginxContractCheck() {
  const candidates = [process.env.NGINX_BIN, 'nginx', '/usr/sbin/nginx', '/usr/local/sbin/nginx']
    .filter(Boolean);
  let nginxBinary = null;
  let version = null;
  for (const candidate of candidates) {
    const attempt = spawnSync(candidate, ['-v'], { encoding: 'utf8' });
    if (attempt.error?.code === 'ENOENT') continue;
    nginxBinary = candidate;
    version = attempt;
    break;
  }
  if (!nginxBinary) {
    console.log('nginx binary unavailable; strict JS routing/directive model passed');
    return;
  }
  assert.equal(version?.status, 0, version?.stderr || version?.stdout || 'nginx -v failed');

  const root = mkdtempSync(join(tmpdir(), 'arena-nginx-contract-'));
  let nginxProcess = null;
  let upstream = null;
  try {
    upstream = await startCardSeoUpstream();
    const www = join(root, 'www');
    mkdirSync(www, { recursive: true });
    mkdirSync(join(www, 'assets'), { recursive: true });
    mkdirSync(join(www, 'tierlist'), { recursive: true });
    writeFileSync(join(www, 'index.html'), '<!doctype html><title>SPA</title>');
    writeFileSync(join(www, '404.html'), '<!doctype html><title>404</title>');
    writeFileSync(join(www, 'assets', 'app.js'), 'window.arena = true;');
    writeFileSync(join(www, 'tierlist', 'index.html'), '<!doctype html><title>Tierlist</title>');
    copyFileSync(
      join(projectRoot, 'public/yandex_eaea2c59052dad81.html'),
      join(www, 'yandex_eaea2c59052dad81.html'),
    );

    const securitySnippet = join(root, 'arena-security-headers.conf');
    writeFileSync(securitySnippet, [
      'add_header X-Content-Type-Options "nosniff" always;',
      'add_header X-Frame-Options "SAMEORIGIN" always;',
    ].join('\n'));
    const testRouting = join(root, 'arena-html-routing.conf');
    writeFileSync(testRouting, routingSource
      .replaceAll('/etc/nginx/snippets/arena-security-headers.conf', securitySnippet)
      .replaceAll('http://127.0.0.1:3101', `http://127.0.0.1:${upstream.port}`));
    const testMap = join(root, 'arena-seo-map.conf');
    writeFileSync(testMap, mapSource);

    const port = await reserveAvailablePort();
    const nginxConfig = join(root, 'nginx.conf');
    writeFileSync(nginxConfig, `
worker_processes 1;
pid ${join(root, 'nginx.pid')};
error_log ${join(root, 'error.log')};
events { worker_connections 16; }
http {
    access_log off;
    include ${testMap};
    server {
        listen 127.0.0.1:${port};
        server_name arena.test;
        set $root_path ${www};
        root $root_path;
        include ${testRouting};
    }
}
`);
    chmodSync(root, 0o755);
    const checked = spawnSync(nginxBinary, ['-t', '-p', root, '-c', nginxConfig], { encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stderr || checked.stdout || 'nginx -t failed');
    const stderr = [];
    const stdout = [];
    nginxProcess = spawn(nginxBinary, [
      '-p', root,
      '-c', nginxConfig,
      '-g', 'daemon off; master_process off;',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    nginxProcess.stdout.on('data', chunk => stdout.push(chunk));
    nginxProcess.stderr.on('data', chunk => stderr.push(chunk));
    nginxProcess.diagnostics = () => Buffer.concat([...stdout, ...stderr]).toString('utf8').trim();
    nginxProcess.exitPromise = new Promise(resolveExit => nginxProcess.once('exit', resolveExit));
    await waitForNginx(port, nginxProcess);

    const home = await requestNginx(port, '/');
    assert.equal(home.status, 200, 'canonical home must resolve');
    assert.match(home.body, /<title>SPA<\/title>/, 'home must return the SPA document');
    assert.equal(home.headers['x-robots-tag'], undefined, 'ordinary home must remain indexable');

    const routeRedirect = await requestNginx(port, '/tierlist');
    assert.equal(routeRedirect.status, 301, 'known public route must normalize its slash');
    assert.match(routeRedirect.headers.location || '', /\/tierlist\/$/, 'slash redirect target');
    const materializedRoute = await requestNginx(port, '/tierlist/');
    assert.equal(materializedRoute.status, 200, 'canonical public route');
    assert.match(materializedRoute.body, /<title>Tierlist<\/title>/, 'materialized route document');
    assert.equal(materializedRoute.headers['x-robots-tag'], undefined,
      'materialized indexable route must not inherit fallback noindex');

    for (const shellPath of [
      '/standard/cards/standard/',
      '/library/minions/',
      '/library/anomalies/example-76521/',
      '/library/archive/minions/example-76521/',
      '/guides-archive/guide-1/',
    ]) {
      const shell = await requestNginx(port, shellPath);
      assert.equal(shell.status, 200, `${shellPath} must retain client navigation before its SSR resolver exists`);
      assert.match(shell.body, /<title>SPA<\/title>/, `${shellPath} fallback shell`);
      assert.equal(shell.headers['x-robots-tag'], 'noindex, follow', `${shellPath} fail-closed robots policy`);
      assert.match(shell.headers['cache-control'] || '', /no-store/, `${shellPath} fallback cache policy`);
    }

    const authState = await requestNginx(port, '/?login');
    assert.equal(authState.headers['x-robots-tag'], 'noindex, nofollow', 'auth state robots header');
    const facetedState = await requestNginx(port, '/articles/?search=meta');
    assert.equal(facetedState.headers['x-robots-tag'], 'noindex, follow', 'faceted state robots header');

    const adminRedirectResponse = await requestNginx(port, '/admin');
    assert.equal(adminRedirectResponse.status, 301, 'admin slash redirect');
    assert.equal(adminRedirectResponse.headers['x-robots-tag'], 'noindex, nofollow', 'admin redirect robots');
    const adminResponse = await requestNginx(port, '/admin/');
    assert.equal(adminResponse.status, 200, 'admin document');
    assert.equal(adminResponse.headers['x-robots-tag'], 'noindex, nofollow', 'admin document robots');

    const deckBuilderRedirectResponse = await requestNginx(port, '/deck-builder');
    assert.equal(deckBuilderRedirectResponse.status, 301, 'deck-builder slash redirect');
    assert.equal(deckBuilderRedirectResponse.headers['x-robots-tag'], 'noindex, nofollow', 'deck-builder redirect robots');
    const deckBuilderResponse = await requestNginx(port, '/deck-builder/');
    assert.equal(deckBuilderResponse.status, 200, 'deck-builder document');
    assert.equal(deckBuilderResponse.headers['x-robots-tag'], 'noindex, nofollow', 'deck-builder document robots');

    for (const technicalFixture of [
      { path: '/api', status: 200, body: /"api":true/, cache: /max-age=17/ },
      { path: '/api/missing', status: 404, body: /"error":"missing"/, cache: /max-age=11/ },
      { path: '/health/live', status: 200, body: /"status":"ok"/, cache: /no-store/ },
      { path: '/metrics', status: 200, body: /arena_requests_total/, cache: /no-store/ },
    ]) {
      const technical = await requestNginx(port, technicalFixture.path);
      assert.equal(technical.status, technicalFixture.status, `${technicalFixture.path} upstream status`);
      assert.match(technical.body, technicalFixture.body, `${technicalFixture.path} upstream body`);
      assert.match(technical.headers['cache-control'] || '', technicalFixture.cache,
        `${technicalFixture.path} upstream cache policy`);
      assert.equal(technical.headers['x-robots-tag'], 'noindex, nofollow',
        `${technicalFixture.path} technical robots policy`);
      assert.equal(technical.headers['x-content-type-options'], 'nosniff',
        `${technicalFixture.path} shared security headers`);
    }

    for (const sitemapFixture of [
      { path: '/sitemap.xml', status: 200, etag: '"sitemap-index"', source: 'static' },
      { path: '/sitemaps/static.xml', status: 200, etag: '"sitemap-static"', source: 'static' },
      { path: '/sitemaps/standard-cards.xml', status: 200, etag: '"sitemap-cards"', source: 'catalog' },
      { path: '/sitemaps/unknown.xml', status: 404, etag: undefined, source: undefined },
    ]) {
      const sitemap = await requestNginx(port, sitemapFixture.path);
      assert.equal(sitemap.status, sitemapFixture.status, `${sitemapFixture.path} runtime status`);
      assert.equal(sitemap.headers.etag, sitemapFixture.etag, `${sitemapFixture.path} ETag passthrough`);
      assert.equal(sitemap.headers['x-sitemap-source'], sitemapFixture.source,
        `${sitemapFixture.path} diagnostic passthrough`);
      if (sitemapFixture.status === 200) {
        assert.match(sitemap.headers['content-type'] || '', /^application\/xml/i,
          `${sitemapFixture.path} XML content type`);
        assert.match(sitemap.headers['cache-control'] || '', /public, max-age=600/,
          `${sitemapFixture.path} cache policy passthrough`);
      } else {
        assert.match(sitemap.headers['cache-control'] || '', /no-store/,
          `${sitemapFixture.path} missing-segment cache policy`);
      }
    }

    const cardRedirect = await requestNginx(
      port,
      '/standard/cards/standard/CARD_OK?utm_source=contract',
    );
    assert.equal(cardRedirect.status, 301, 'card detail must normalize its slash once');
    const cardRedirectTarget = new URL(cardRedirect.headers.location);
    assert.equal(
      `${cardRedirectTarget.pathname}${cardRedirectTarget.search}`,
      '/standard/cards/standard/CARD_OK/?utm_source=contract',
      'card detail slash normalization must preserve the query string',
    );

    const validCard = await requestNginx(port, '/standard/cards/standard/CARD_OK/');
    assert.equal(validCard.status, 200, 'valid card SSR status must pass through nginx');
    assert.match(validCard.body, /card-upstream-200/, 'valid card SSR body must pass through nginx');
    assert.equal(
      validCard.headers['x-robots-tag'],
      'index, follow, max-image-preview:large',
      'valid card robots policy must pass through nginx',
    );

    const missingCard = await requestNginx(port, '/standard/cards/standard/MISSING_1/');
    assert.equal(missingCard.status, 404, 'missing card SSR status must pass through nginx');
    assert.match(missingCard.body, /card-upstream-404/, 'missing card SSR body must pass through nginx');
    assert.equal(missingCard.headers['x-robots-tag'], 'noindex, nofollow', 'missing card robots policy');
    assert.match(missingCard.headers['cache-control'] || '', /no-store/, 'missing card cache policy');

    const unavailableCard = await requestNginx(port, '/standard/cards/standard/OUTAGE_1/');
    assert.equal(unavailableCard.status, 503, 'card catalog outage status must pass through nginx');
    assert.match(unavailableCard.body, /card-upstream-503/, 'card catalog outage body must pass through nginx');
    assert.equal(unavailableCard.headers['x-robots-tag'], 'noindex, nofollow', 'outage robots policy');
    assert.equal(unavailableCard.headers['retry-after'], '300', 'outage retry policy must pass through nginx');
    assert.match(unavailableCard.headers['cache-control'] || '', /no-store/, 'outage cache policy');

    const heroRedirect = await requestNginx(port, '/heroes/76521?utm_source=contract');
    assert.equal(heroRedirect.status, 301, 'hero detail must normalize its slash once');
    const heroRedirectTarget = new URL(heroRedirect.headers.location);
    assert.equal(
      `${heroRedirectTarget.pathname}${heroRedirectTarget.search}`,
      '/heroes/76521/?utm_source=contract',
      'hero detail slash normalization must preserve the query string',
    );

    const validHero = await requestNginx(port, '/heroes/76521/');
    assert.equal(validHero.status, 200, 'valid hero SSR status must pass through nginx');
    assert.match(validHero.body, /hero-upstream-200/, 'valid hero SSR body must pass through nginx');
    assert.equal(
      validHero.headers['x-robots-tag'],
      'index, follow, max-image-preview:large',
      'valid hero robots policy must pass through nginx',
    );

    const missingHero = await requestNginx(port, '/heroes/999999/');
    assert.equal(missingHero.status, 404, 'missing hero SSR status must pass through nginx');
    assert.match(missingHero.body, /hero-upstream-404/, 'missing hero SSR body must pass through nginx');
    assert.equal(missingHero.headers['x-robots-tag'], 'noindex, nofollow', 'missing hero robots policy');
    assert.match(missingHero.headers['cache-control'] || '', /no-store/, 'missing hero cache policy');

    const unavailableHero = await requestNginx(port, '/heroes/888888/');
    assert.equal(unavailableHero.status, 503, 'hero catalog outage status must pass through nginx');
    assert.match(unavailableHero.body, /hero-upstream-503/, 'hero catalog outage body must pass through nginx');
    assert.equal(unavailableHero.headers['x-robots-tag'], 'noindex, nofollow', 'hero outage robots policy');
    assert.equal(unavailableHero.headers['retry-after'], '300', 'hero outage retry policy must pass through nginx');
    assert.match(unavailableHero.headers['cache-control'] || '', /no-store/, 'hero outage cache policy');

    const bgCardRedirect = await requestNginx(
      port,
      '/library/minions/example-76521?utm_source=contract',
    );
    assert.equal(bgCardRedirect.status, 301, 'BG card detail must normalize its slash once');
    const bgCardRedirectTarget = new URL(bgCardRedirect.headers.location);
    assert.equal(
      `${bgCardRedirectTarget.pathname}${bgCardRedirectTarget.search}`,
      '/library/minions/example-76521/?utm_source=contract',
      'BG card detail slash normalization must preserve the query string',
    );

    const validBgCard = await requestNginx(port, '/library/minions/example-76521/');
    assert.equal(validBgCard.status, 200, 'valid BG card SSR status must pass through nginx');
    assert.match(validBgCard.body, /bg-card-upstream-200/, 'valid BG card SSR body must pass through nginx');
    assert.equal(
      validBgCard.headers['x-robots-tag'],
      'index, follow, max-image-preview:large',
      'valid BG card robots policy must pass through nginx',
    );

    const missingBgCard = await requestNginx(port, '/library/minions/missing-999999/');
    assert.equal(missingBgCard.status, 404, 'missing BG card SSR status must pass through nginx');
    assert.match(missingBgCard.body, /bg-card-upstream-404/, 'missing BG card SSR body must pass through nginx');
    assert.equal(missingBgCard.headers['x-robots-tag'], 'noindex, nofollow', 'missing BG card robots policy');
    assert.match(missingBgCard.headers['cache-control'] || '', /no-store/, 'missing BG card cache policy');

    const unavailableBgCard = await requestNginx(port, '/library/spells/outage-888888/');
    assert.equal(unavailableBgCard.status, 503, 'BG catalog outage status must pass through nginx');
    assert.match(unavailableBgCard.body, /bg-card-upstream-503/, 'BG catalog outage body must pass through nginx');
    assert.equal(unavailableBgCard.headers['x-robots-tag'], 'noindex, nofollow', 'BG outage robots policy');
    assert.equal(unavailableBgCard.headers['retry-after'], '300', 'BG outage retry policy must pass through nginx');
    assert.match(unavailableBgCard.headers['cache-control'] || '', /no-store/, 'BG outage cache policy');

    for (const referralPath of ['/r/summer', '/r/summer/']) {
      const referral = await requestNginx(port, referralPath);
      assert.equal(referral.status, 302, `${referralPath} must redirect without a client shell`);
      assert.equal(referral.headers.location, '/contests?from=qa', `${referralPath} redirect target`);
      assert.equal(referral.headers['x-robots-tag'], 'noindex, nofollow', `${referralPath} robots policy`);
      assert.match(referral.headers['cache-control'] || '', /no-store/, `${referralPath} cache policy`);
    }
    const missingReferral = await requestNginx(port, '/r/missing');
    assert.equal(missingReferral.status, 404, 'missing referral must preserve the upstream 404');
    assert.match(missingReferral.body, /referral-upstream-404/, 'missing referral response body');
    assert.equal(missingReferral.headers['x-robots-tag'], 'noindex, nofollow', 'missing referral robots policy');

    assert.equal((await requestNginx(port, '/decks/legacy')).status, 410, 'removed route must be gone');
    const missingPage = await requestNginx(port, '/definitely-unknown');
    assert.equal(missingPage.status, 404, 'unknown HTML must be a real 404');
    assert.match(missingPage.body, /<title>404<\/title>/, '404 document body');
    for (const headFixture of [
      { path: '/tierlist', status: 301 },
      { path: '/heroes/76521/', status: 200, robots: 'index, follow, max-image-preview:large' },
      { path: '/heroes/999999/', status: 404, robots: 'noindex, nofollow' },
      { path: '/heroes/888888/', status: 503, robots: 'noindex, nofollow' },
      { path: '/library/minions/example-76521/', status: 200, robots: 'index, follow, max-image-preview:large' },
      { path: '/library/minions/missing-999999/', status: 404, robots: 'noindex, nofollow' },
      { path: '/library/spells/outage-888888/', status: 503, robots: 'noindex, nofollow' },
      { path: '/decks/legacy', status: 410, robots: 'noindex, nofollow' },
      { path: '/definitely-unknown', status: 404, robots: 'noindex, nofollow' },
    ]) {
      const head = await requestNginx(port, headFixture.path, 'HEAD');
      assert.equal(head.status, headFixture.status, `${headFixture.path} HEAD status`);
      assert.equal(head.body, '', `${headFixture.path} HEAD body`);
      if (headFixture.robots) assert.equal(head.headers['x-robots-tag'], headFixture.robots,
        `${headFixture.path} HEAD robots policy`);
    }
    const missingAsset = await requestNginx(port, '/assets/missing.js');
    assert.equal(missingAsset.status, 404, 'missing asset must stay 404');
    assert.doesNotMatch(
      missingAsset.headers['cache-control'] || '',
      /immutable/,
      'a missing asset must never receive the success-only immutable cache policy',
    );
    const existingAsset = await requestNginx(port, '/assets/app.js');
    assert.equal(existingAsset.status, 200, 'existing asset must resolve');
    assert.match(existingAsset.headers['cache-control'] || '', /immutable/, 'existing asset cache policy');
    assert.equal(
      (await requestNginx(port, '/yandex_eaea2c59052dad81.html')).status,
      200,
      'Yandex verification file must resolve',
    );

    console.log('nginx syntax and runtime HTTP contract passed for the temporary configuration');
  } finally {
    if (nginxProcess) await stopNginx(nginxProcess);
    if (upstream) await stopHttpServer(upstream.server);
    rmSync(root, { recursive: true, force: true });
  }
}

await runNginxContractCheck();
assert.equal(existsSync(join(projectRoot, 'deploy/nginx/README.md')), true, 'operator instructions must be versioned');
console.log(`nginx HTML routing contract passed (${inventory.routes.length} route templates)`);
