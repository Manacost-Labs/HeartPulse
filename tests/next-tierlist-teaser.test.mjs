import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import express from 'express';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { createTierlistRouter } from '../server/tierlistRoutes.ts';
import { buildTierlistFixture, closedValues, CLASS_IDS } from './helpers/tierlistTeaserFixture.ts';

// The built /tierlist/ page against an Express that serves the real open-slice
// projection: a guest and a robot get the same HTML with the top ten cards and
// the top three of each class, and no closed value (winrate, score, per-card
// games, a card outside the slice) is in the HTML, the RSC payload
// (`self.__next_f`) or the JSON-LD. Without data the page is still a 200.

const TOP = ['mage-s0', 'mage-s1', 'mage-s2', 'any-s0', 'any-s1', 'warlock-s0', 'death-knight-0', 'demon-hunter-0', 'druid-0', 'hunter-0'];
const classTop = classId => classId === 'mage' ? ['mage-s0', 'mage-s1', 'mage-s2']
  : classId === 'warlock' ? ['warlock-s0', 'warlock-0', 'warlock-1'] : [0, 1, 2].map(j => `${classId}-${j}`);
const VISIBLE = new Set([...TOP, ...CLASS_IDS.flatMap(classTop)].map(id => `FX_${id}`));
const CLOSED = closedValues(VISIBLE);
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const ROBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

function startLegacy(state) {
  const app = express();
  app.use((request, _response, next) => {
    state.reads.push({ path: request.originalUrl, cookie: request.headers.cookie ?? '' });
    next();
  });
  app.get('/api/auth/me', (_request, response) => response.json({ user: null }));
  app.use('/api', createTierlistRouter({
    // Nobody is a subscriber here: only the open slice may be answered.
    accessGuard: (_request, response) => { response.status(403).json({ error: 'subscription required' }); },
    cache: new Map(),
    resolveSource: () => 'hsreplay',
    getData: async () => {
      if (state.down) throw new Error('origin down');
      return { data: buildTierlistFixture(), etag: '"fixture"', cacheSource: 'origin' };
    },
    present: data => ({ ...data, classPositions: {} }),
    loadFallback: () => null,
    onError: () => undefined,
  }));
  return app;
}

const guestHtml = async (origin, headers = {}) => {
  const response = await fetch(`${origin}/tierlist/`, { headers });
  assert.equal(response.status, 200);
  return response.text();
};

test('the guest HTML of /tierlist/ carries the open slice and nothing closed', async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  // The build copy of the page is made without Express: it has no slice.
  const state = { reads: [], down: true };
  const legacy = startLegacy(state);
  const legacyServer = legacy.listen(0, '127.0.0.1');
  await once(legacyServer, 'listening');
  const next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${legacyServer.address().port}`,
    env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
  // /tierlist/ is a five-minute ISR page. Move the server's clock past that window and request until the
  // regenerated copy (stale-while-revalidate: the first answer is the old one) satisfies `ready`.
  const regenerated = async (ready, phase, headers = { 'User-Agent': BROWSER_UA, Cookie: 'session=guest-fixture' }) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      // Every attempt moves the clock again: a regeneration still running from an earlier request stamps its copy
      // with the shifted time, and that copy must not count as fresh.
      process.kill(next.pid, 'SIGUSR2');
      const html = await guestHtml(next.origin, headers);
      if (ready(html)) return html;
      await delay(250);
    }
    return assert.fail(`the page was not regenerated: ${phase}; reads ${JSON.stringify(state.reads.map(read => read.path))}; ${next.output().slice(-300)}`);
  };
  const hasSlice = html => html.includes('class="tierlist-public-teaser"');
  try {
    const buildCopy = await guestHtml(next.origin);
    assert.equal(hasSlice(buildCopy), false, 'the copy made without Express has no slice but is a 200 page');
    assert.match(buildCopy, /class="paywalled-tierlist"/);
    state.down = false;
    const html = await regenerated(hasSlice, 'slice appears');

    const start = html.indexOf('class="tierlist-public-teaser"');
    const slice = html.slice(start, html.indexOf('</section>', start));
    assert.ok(slice.length > 100, 'the open slice is in the server HTML');
    const shown = [...slice.matchAll(/Карта ([\w-]+) — тир ([SA-F])/g)].map(match => match[1]);
    assert.deepEqual(shown.slice(0, 10), TOP, 'the top ten, best first, then the class lists');
    assert.equal(shown.length, 10 + 33, 'ten cards and three of each of the eleven classes');
    for (const classId of CLASS_IDS) {
      assert.match(slice, new RegExp(`<h4>Класс ${classId}</h4><ol>(<li>[^<]*</li>){3}</ol>`), `three cards for ${classId}`);
    }
    assert.match(slice, /Карта mage-s0 — тир S, Класс mage/, 'a top card names its tier and class');
    assert.match(slice, /Данные на <time dateTime="2026-11-15T17:00:03\.639Z">15 ноября 2026, 20:00 МСК<\/time> · по данным более 980\s000 игр · источник HSReplay\./, 'date, sample and source');
    assert.match(html, /class="paywalled-tierlist"/, 'the closed part has the class the JSON-LD names');

    // Nothing closed in the HTML, in the RSC payload and in the JSON-LD: each is checked on its own.
    assert.match(html, /self\.__next_f/, 'the page carries an RSC payload');
    const payload = [...html.matchAll(/<script>self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g)].map(match => match[1]).join('\n');
    const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => match[1]);
    assert.ok(payload.length > 0 && jsonLd.length > 0, 'both are present, so the checks below are not vacuous');
    for (const [name, text] of [['HTML', html], ['RSC payload', payload], ['JSON-LD', jsonLd.join('\n')]]) {
      assert.deepEqual(CLOSED.filter(value => text.includes(value)), [], `${name} has no closed value`);
    }
    const graph = JSON.parse(jsonLd.find(text => text.includes('Dataset')))['@graph'];
    const dataset = graph.find(node => node['@type'] === 'Dataset');
    assert.equal(dataset.isAccessibleForFree, false);
    assert.deepEqual(dataset.hasPart, { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-tierlist' });
    assert.equal('license' in dataset, false, 'no license on the dataset');
    assert.equal('creator' in dataset, false, 'the site is no creator of the data');
    assert.equal(dataset.dateModified, '2026-11-15T17:00:03.639Z', 'dated by the data the page prints');

    // The server reads the projection anonymously.
    const reads = state.reads.filter(read => read.path.startsWith('/api/tierlist'));
    assert.ok(reads.length > 0 && reads.every(read => read.path === '/api/tierlist/public-teaser'), 'only the open projection is read');
    assert.deepEqual([...new Set(state.reads.map(read => read.cookie))], [''], 'cookies are never forwarded');

    // A robot and a guest get the same document.
    assert.equal(await guestHtml(next.origin, { 'User-Agent': ROBOT_UA }), await guestHtml(next.origin, { 'User-Agent': BROWSER_UA }),
      'the HTML does not depend on the user agent');

    // No data: a 200 page, with its text and markup but without the slice.
    state.down = true;
    const empty = await regenerated(page => !hasSlice(page), 'slice disappears without data');
    assert.doesNotMatch(empty, /tierlist-public-teaser/, 'no slice without data');
    assert.match(empty, /class="paywalled-tierlist"/);
    assert.match(empty, /class="seo-page-intro"/, 'the page text stays');
  } finally {
    await next.close();
    legacyServer.closeAllConnections();
    await new Promise(done => legacyServer.close(done));
  }
});

// The deploy warm-up against the real built page and the real revalidate route.
async function warmStand({ articlesReadyAfterMs = 0, expressRecoversAfterFirstRevalidation = false }) {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const state = { reads: [], down: true };
  const legacyServer = startLegacy(state).listen(0, '127.0.0.1');
  await once(legacyServer, 'listening');
  const legacyOrigin = `http://127.0.0.1:${legacyServer.address().port}`;
  const next = await startNextServer({ legacyOrigin });
  const revalidations = [];
  const opened = Date.now();
  // The tier-list projection answers from the start, unless the test brings it up after the first regeneration.
  state.down = expressRecoversAfterFirstRevalidation;
  // One public address for the warm-up: Express under /api, Next for everything else.
  const gateway = createServer(async (incoming, response) => {
    if (incoming.url === '/api/articles') {
      response.writeHead(Date.now() - opened >= articlesReadyAfterMs ? 200 : 503, { 'Content-Type': 'application/json' }).end('[]');
      return;
    }
    const target = incoming.url.startsWith('/api/') ? legacyOrigin : next.origin;
    const answer = await fetch(`${target}${incoming.url}`, { method: incoming.method, redirect: 'manual' });
    const body = await answer.text();
    if (incoming.method === 'POST' && incoming.url === '/health/next/revalidate/') {
      revalidations.push(JSON.parse(body).revalidated);
      // Express recovers only after the first regeneration has already run on nothing.
      if (expressRecoversAfterFirstRevalidation && revalidations.length === 1) setTimeout(() => { state.down = false; }, 600);
    }
    response.writeHead(answer.status, { 'Content-Type': answer.headers.get('content-type') ?? 'text/html',
      'X-Nextjs-Cache': answer.headers.get('x-nextjs-cache') ?? 'none' }).end(body);
  });
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  const address = `http://127.0.0.1:${gateway.address().port}`;
  const warm = async env => {
    const child = spawn(process.execPath, ['scripts/warm-prerendered-pages.mjs'], { env: { PATH: process.env.PATH,
      PRODUCTION_BASE_URL: address, NEXT_LOCAL_ORIGIN: address, WARM_ONLY: '/tierlist/', WARM_DELAY_MS: '300', ...env } });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const [code] = await once(child, 'exit');
    return { code, output };
  };
  const close = async () => {
    gateway.closeAllConnections();
    await new Promise(done => gateway.close(done));
    await next.close();
    legacyServer.closeAllConnections();
    await new Promise(done => legacyServer.close(done));
  };
  return { next, revalidations, warm, close };
}

test('the post-deploy warm-up revalidates again until /tierlist/ carries its slice', async () => {
  const stand = await warmStand({ expressRecoversAfterFirstRevalidation: true });
  try {
    const before = await guestHtml(stand.next.origin);
    assert.equal(before.includes('class="tierlist-public-teaser"'), false, 'the build copy has no slice');
    const { code, output } = await stand.warm({ WARM_TOTAL_MS: '30000' });
    assert.equal(code, 0, output);
    assert.ok(stand.revalidations.length >= 2, `a page left without data is revalidated again: ${output}`);
    assert.deepEqual([...stand.revalidations[0]].sort(), ['/articles', '/classes', '/standard/meta', '/tierlist'],
      'the real route regenerates exactly the pages that render data');
    assert.match(output, /\[warm\] \/tierlist\/: with data/, output);
    // What a visitor gets right after the warm-up, with no clock shifted and no second request needed.
    const after = await guestHtml(stand.next.origin);
    assert.match(after, /class="tierlist-public-teaser"/, 'the slice is in the served HTML');
    assert.match(after, /Карта mage-s0 — тир S/, 'with its cards');
  } finally {
    await stand.close();
  }
});

test('the post-deploy warm-up waits for a cold Express and warns for every page when it never comes', async () => {
  const stand = await warmStand({ articlesReadyAfterMs: 1500 });
  try {
    const late = await stand.warm({ WARM_API_WAIT_MS: '20000', WARM_TOTAL_MS: '30000' });
    assert.equal(late.code, 0, late.output);
    assert.match(late.output, /\[warm\] \/tierlist\/: with data/, 'Express came up after the runner started: it waited');
    assert.doesNotMatch(late.output, /::warning::/);
  } finally {
    await stand.close();
  }
  const absent = await warmStand({ articlesReadyAfterMs: 1e9 });
  try {
    const { code, output } = await absent.warm({ WARM_ONLY: '/tierlist/,/classes/', WARM_API_WAIT_MS: '1200', WARM_TOTAL_MS: '5000' });
    assert.equal(code, 0, 'the deploy is never failed');
    assert.deepEqual(absent.revalidations, [], 'nothing is regenerated while Express is down');
    for (const path of ['/tierlist/', '/classes/']) assert.match(output, new RegExp(`\\[warm\\] ${path}: without data`), `${path} is named`);
    assert.match(output, /::warning::pages without data after the deploy warm-up: \/tierlist\/, \/classes\//, output);
  } finally {
    await absent.close();
  }
});
