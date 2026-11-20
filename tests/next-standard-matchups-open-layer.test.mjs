import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import express from 'express';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { SENTINELS, openAnswer, protectedAnswer } from './helpers/standardMatchupsOpenFixture.ts';

// The built /standard/matchups/ page against an Express stub: a guest and both robots get the same HTML with the
// open general slice (archetypes, class, popularity, winrate and games of every pair, source, date), and no paid
// value is in the HTML, the RSC payload or the JSON-LD, even when the stub's public answer carries sentinels by
// mistake and the protected route answers with them. When Express is down a regeneration keeps the last good page.

const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const YANDEXBOT_UA = 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)';
const HTML_BUDGET_BYTES = 300 * 1024;
const hasMatrix = html => html.replaceAll('<!-- -->', '').includes('Открытый архетип 20<');

function startLegacy(state) {
  const app = express();
  app.use((request, _response, next) => {
    state.reads.push({ path: request.originalUrl, cookie: request.headers.cookie ?? '' });
    next();
  });
  app.get('/api/auth/me', (_request, response) => response.json({ user: null }));
  app.get('/api/standard/matchups/public', (_request, response) => {
    if (state.down) return response.status(503).set('Retry-After', '60').json({ error: 'unavailable' });
    return response.json(openAnswer({ noise: true, warning: state.warning }));
  });
  // Nobody is a subscriber here; the page must not even ask for it on the server.
  app.get('/api/standard/matchups', (_request, response) => response.status(401).json(protectedAnswer()));
  return app;
}

const guestHtml = async (origin, headers = {}) => {
  const response = await fetch(`${origin}/standard/matchups/`, { headers });
  assert.equal(response.status, 200);
  return response.text();
};

test('the guest HTML of /standard/matchups/ carries the open matrix and no paid value', { timeout: 240_000 }, async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const state = { reads: [], down: false, warning: undefined };
  const legacyServer = startLegacy(state).listen(0, '127.0.0.1');
  await once(legacyServer, 'listening');
  const next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${legacyServer.address().port}`,
    env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
  // A five-minute ISR page: move the server's clock past that window and request until the regenerated copy satisfies `ready`.
  const regenerated = async (ready, phase, headers = { 'User-Agent': BROWSER_UA }) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      const html = await guestHtml(next.origin, headers);
      if (ready(html)) return html;
      await delay(250);
    }
    return assert.fail(`the page was not regenerated: ${phase}; reads ${JSON.stringify(state.reads.map(read => read.path))}; ${next.output().slice(-300)}`);
  };
  try {
    const raw = await regenerated(hasMatrix, 'matrix appears');
    const html = raw.replaceAll('<!-- -->', '');
    assert.ok(Buffer.byteLength(raw) <= HTML_BUDGET_BYTES, `the document weighs ${Buffer.byteLength(raw)} bytes`);
    // The most played archetypes of the slice are in the HTML, the long tail is not.
    assert.ok(html.includes('Открытый архетип 1<') && html.includes('Открытый архетип 20<'));
    assert.equal(html.includes('Открытый архетип 21<'), false, 'the tail loads in the browser');
    assert.match(html, /Все ранги/, 'the slice is named');
    assert.match(html, /18\.11\.2026 12:30 МСК/, 'date');
    assert.match(html, /class="[^"]*paywalled-standard-matchups/, 'the locked filters have the class the JSON-LD names');
    assert.doesNotMatch(html, /arena-paywall/, 'no gate over the page');
    assert.equal((html.match(/<h1/g) ?? []).length, 1);

    // Nothing paid in the HTML, the RSC payload and the JSON-LD: each is checked on its own.
    const payload = [...html.matchAll(/<script>self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g)].map(match => match[1]).join('\n');
    const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => match[1]);
    assert.ok(payload.length > 0 && jsonLd.length > 0, 'both are present, so the checks below are not vacuous');
    assert.ok(Buffer.byteLength(payload) < HTML_BUDGET_BYTES);
    for (const [name, text] of [['HTML', html], ['RSC payload', payload], ['JSON-LD', jsonLd.join('\n')]]) {
      assert.deepEqual(SENTINELS.filter(value => text.includes(value)), [], `${name} has no sentinel`);
    }
    const dataset = JSON.parse(jsonLd.find(text => text.includes('Dataset')))['@graph'].find(node => node['@type'] === 'Dataset');
    assert.equal(dataset.isAccessibleForFree, false);
    assert.deepEqual(dataset.hasPart, { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-standard-matchups' });
    assert.equal(dataset.dateModified, '2026-11-18T09:30:00.000Z', 'dated by the data the page prints');
    assert.doesNotMatch(jsonLd.join('\n'), /Открытый архетип|\b41\.5\b/, 'no row of the matrix is in the graph');

    // The server reads only the open projection, anonymously.
    const reads = state.reads.filter(read => read.path.startsWith('/api/standard/matchups'));
    assert.ok(reads.length > 0 && reads.every(read => read.path === '/api/standard/matchups/public?format=standard'), `only the open projection is read: ${JSON.stringify(reads)}`);
    assert.deepEqual([...new Set(state.reads.map(read => read.cookie))], [''], 'cookies are never forwarded');

    // A browser, Googlebot and YandexBot get the same document (one at a time, after the copy is warm).
    // Compare only after two identical copies in a row: right after a regeneration the head can still differ.
    let browser = await guestHtml(next.origin, { 'User-Agent': BROWSER_UA });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const again = await guestHtml(next.origin, { 'User-Agent': BROWSER_UA });
      if (again === browser) break;
      browser = again;
      await delay(300);
    }
    assert.equal(await guestHtml(next.origin, { 'User-Agent': GOOGLEBOT_UA }), browser, 'Googlebot gets the guest HTML');
    assert.equal(await guestHtml(next.origin, { 'User-Agent': YANDEXBOT_UA }), browser, 'YandexBot gets the guest HTML');

    // Express is down: a failed regeneration keeps the last good page, never an empty one.
    state.down = true;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      const kept = await guestHtml(next.origin, { 'User-Agent': BROWSER_UA });
      assert.ok(hasMatrix(kept), 'the last good matrix stays while Express is down');
      await delay(300);
    }
    assert.ok(state.reads.filter(read => read.path.includes('/public')).length > reads.length, 'the regeneration really tried the origin');

    // The deploy's warm-up while the source is down: the route does not mark the page stale, so a guest and Googlebot keep the
    // good matrix and nobody gets a 500 (a stale mark would make the next request render without data and fail).
    const revalidated = await fetch(`${next.origin}/health/next/revalidate/`, { method: 'POST' });
    assert.equal(revalidated.status, 200);
    const answer = await revalidated.json();
    assert.ok(!answer.revalidated.includes('/standard/matchups'), 'the page whose source is down is not revalidated');
    assert.deepEqual(answer.skipped.find(item => item.path === '/standard/matchups'), { path: '/standard/matchups', reason: 'source-unavailable' });
    for (const headers of [{ 'User-Agent': BROWSER_UA }, { 'User-Agent': GOOGLEBOT_UA }]) {
      const response = await fetch(`${next.origin}/standard/matchups/`, { headers });
      assert.equal(response.status, 200, 'no 500 after the revalidation call while Express is down');
      assert.ok(hasMatrix(await response.text()), 'the earlier matrix stays');
    }
  } finally {
    await next.close();
    legacyServer.closeAllConnections();
    await new Promise(done => legacyServer.close(done));
  }
});

// A restart loses the process memory. Next keeps only the copy the build wrote on disk; a regeneration that finds Express down
// must not publish an empty page nor answer 500: the earlier copy is served again, and the matrix returns with Express.
test('after a Next restart with Express down the page answers from the earlier copy, then recovers', { timeout: 240_000 }, async () => {
  const state = { reads: [], down: true, warning: undefined };
  const legacyServer = startLegacy(state).listen(0, '127.0.0.1');
  await once(legacyServer, 'listening');
  const next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${legacyServer.address().port}`,
    env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
  try {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      const response = await fetch(`${next.origin}/standard/matchups/`, { headers: { 'User-Agent': BROWSER_UA } });
      assert.equal(response.status, 200, `no 500 while Express is down: ${next.output().slice(-300)}`);
      assert.equal((await response.text()).replaceAll('<!-- -->', '').includes('Открытый архетип 1<'), false, 'no invented matrix');
      await delay(300);
    }
    assert.ok(state.reads.some(read => read.path.includes('/public')), 'the regeneration really tried the origin');
    state.down = false;
    let html = '';
    for (let attempt = 0; attempt < 40 && !hasMatrix(html); attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      html = await (await fetch(`${next.origin}/standard/matchups/`, { headers: { 'User-Agent': BROWSER_UA } })).text();
      await delay(250);
    }
    assert.ok(hasMatrix(html), 'the matrix returns once Express does');
  } finally {
    await next.close();
    legacyServer.closeAllConnections();
    await new Promise(done => legacyServer.close(done));
  }
});
