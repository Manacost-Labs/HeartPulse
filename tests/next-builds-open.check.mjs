import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import express from 'express';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { createBattlegroundBuildsRouter } from '../server/battlegroundBuildsPublicRoutes.ts';
import { buildSourcePayload, BUILD_COUNT, closedValues, OPEN_BUILDS, sourceOf } from './helpers/battlegroundBuildsFixture.ts';

// The built /battlegrounds/tier-list/ and /battlegrounds/strategies/ against an Express that serves the real
// open-builds projection: a guest and a robot get the same HTML with every build of the base slice by tier
// (title, facts, conditions, key minions, example board, link to the builder), the ItemList equals the list,
// and no closed value is in the HTML, the RSC payload (`self.__next_f`) or the JSON-LD. A failing Express never
// turns a page with builds into an empty one.

const CLOSED = closedValues();
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const ROBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const PAGES = [['/battlegrounds/tier-list/', 'compositions'], ['/battlegrounds/strategies/', 'strategies']];
const format = (value, digits) => value.toFixed(digits).replace('.', ',');

function startLegacy(state) {
  const app = express();
  app.use((request, _response, next) => {
    state.reads.push({ path: request.originalUrl, cookie: request.headers.cookie ?? '' });
    next();
  });
  app.get('/api/auth/me', (_request, response) => response.json({ user: null }));
  // `state.reset()` makes a new router: the last known copy of the old one is gone.
  const make = () => createBattlegroundBuildsRouter({
    loadSource: async list => {
      if (state.down) throw new Error('service down');
      return buildSourcePayload(sourceOf(list));
    },
    fallbackDir: null,
    onError: () => undefined,
  });
  let router = make();
  state.reset = () => { router = make(); };
  app.use('/api', (request, response, next) => router(request, response, next));
  return app;
}

const pageHtml = async (origin, path, headers = {}) => {
  const response = await fetch(`${origin}${path}`, { headers });
  assert.equal(response.status, 200);
  return response.text();
};
const clean = html => html.replace(/<!-- -->/g, '');

/** The articles of the page: tier of the section, title, facts, conditions, key minions, example board, builder link. */
function articlesOf(html) {
  const page = clean(html);
  const out = [];
  for (const section of page.matchAll(/<section id="tier-([sabcd])"[^>]*>([\s\S]*?)<\/section>/g)) {
    for (const article of section[2].matchAll(/<article id="build-([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)) {
      const body = article[2];
      out.push({
        key: article[1], tier: section[1].toUpperCase(),
        title: body.match(/<h3[^>]*>([^<]+)<\/h3>/)?.[1],
        facts: body.match(/<p class="bg-builds-public__facts">([^<]+)<\/p>/)?.[1] ?? null,
        description: body.match(/<\/h3>(?:<p class="bg-builds-public__facts">[^<]*<\/p>)?<p>([^<]+)<\/p>/)?.[1],
        core: [...(body.match(/<ul class="bg-builds-public__minions"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? '').matchAll(/<span>([^<]+)<\/span>/g)].map(match => match[1]),
        extra: body.match(/Пример стола дополняют: ([^<]+)\.<\/p>/)?.[1].split(', ') ?? [],
        builder: body.match(/<a class="bg-builds-public__builder" href="([^"]+)"/)?.[1],
      });
    }
  }
  return out;
}

test('the guest HTML of both builds pages carries every open build and nothing closed', async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const state = { reads: [], down: true };
  const legacyServer = startLegacy(state).listen(0, '127.0.0.1');
  await once(legacyServer, 'listening');
  const next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${legacyServer.address().port}`,
    env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
  // Both pages are five-minute ISR pages: move the server's clock past that window until the regenerated copy is served.
  const regenerated = async (path, ready, phase, headers = { 'User-Agent': BROWSER_UA, Cookie: 'session=guest-fixture' }) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      const html = await pageHtml(next.origin, path, headers);
      if (ready(html)) return html;
      await delay(250);
    }
    return assert.fail(`${path} was not regenerated: ${phase}; ${next.output().slice(-300)}`);
  };
  const hasBuilds = html => html.includes('class="bg-builds-public"') && html.includes('id="build-');
  try {
    for (const [path] of PAGES) {
      const buildCopy = await pageHtml(next.origin, path);
      assert.equal(hasBuilds(buildCopy), false, `${path}: the copy made without Express has no builds but is a 200 page`);
      assert.match(buildCopy, /class="paywalled-builds"/);
    }
    state.down = false;
    for (const [path, list] of PAGES) {
      const html = await regenerated(path, hasBuilds, 'builds appear');
      const expected = OPEN_BUILDS(list);
      assert.equal(articlesOf(html).length, BUILD_COUNT, `${path}: every build is printed (${(clean(html).match(/<article id="[^"]+"/g) ?? []).join(' ')}; ${(clean(html).match(/<section id="[^"]+"/g) ?? []).join(' ')})`);
      assert.deepEqual(articlesOf(html), expected.map(item => ({
        key: item.key, tier: item.tier, title: item.title,
        facts: [item.archetype, `сложность: ${item.difficulty.toLowerCase()}`,
          item.avgPlacement === null ? null : `среднее место ${format(item.avgPlacement, 2)}`,
          item.popularity === null ? null : `популярность ${format(item.popularity, 1)}%`].filter(Boolean).join(' · '),
        description: item.description, core: item.core, extra: item.extra, builder: '/battlegrounds/tier-builder/',
      })), `${path}: the open figures of every build, by tier`);
      assert.match(clean(html), /Данные на <time dateTime="2026-11-19T06:00:17\.742Z">19 ноября 2026, 09:00 МСК<\/time> · источник (HSReplay|Firestone)/, 'date and source');
      assert.ok(html.indexOf('<h1') < html.indexOf('class="bg-builds-public"') && html.indexOf('class="bg-builds-public"') < html.indexOf('class="paywalled-builds"'),
        'the list stands after the H1 and before the closed part');
      assert.doesNotMatch(html, /arena-paywall-pending|class="arena-paywall"/, 'no placeholder or gate for a visitor of an open page');
      assert.match(html, /Подробнее по подписке/, 'the closed part is named');

      // Nothing closed in the HTML, in the RSC payload and in the JSON-LD: each is checked on its own.
      assert.match(html, /self\.__next_f/, 'the page carries an RSC payload');
      const payload = [...html.matchAll(/<script>self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g)].map(match => match[1]).join('\n');
      const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => match[1]);
      assert.ok(payload.length > 0 && jsonLd.length > 0, 'both are present, so the checks below are not vacuous');
      for (const [name, text] of [['HTML', html], ['RSC payload', payload], ['JSON-LD', jsonLd.join('\n')]]) {
        assert.deepEqual(CLOSED.filter(value => text.includes(value)), [], `${path}: ${name} has no closed value`);
      }
      const graph = JSON.parse(jsonLd.find(text => text.includes('Dataset')))['@graph'];
      const dataset = graph.find(node => node['@type'] === 'Dataset');
      assert.equal(dataset.isAccessibleForFree, false);
      assert.deepEqual(dataset.hasPart, { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-builds' });
      const itemList = graph.find(node => node['@type'] === 'ItemList');
      assert.equal(itemList.numberOfItems, BUILD_COUNT);
      assert.deepEqual(itemList.itemListElement.map(item => ({ name: item.name, url: item.url })),
        articlesOf(html).map(item => ({ name: item.title, url: `https://hearthpulse.net${path}#build-${item.key}` })), 'the ItemList equals the printed list');
    }

    // The server reads the projection anonymously, one list per page.
    const reads = state.reads.filter(read => read.path.startsWith('/api/bg/'));
    assert.ok(reads.length > 0 && reads.every(read => /^\/api\/bg\/tier-lists\/public\?list=(compositions|strategies)$/.test(read.path)), 'only the open projection is read');
    assert.deepEqual([...new Set(state.reads.map(read => read.cookie))], [''], 'cookies are never forwarded');

    // A robot and a guest get the same document, once the copies are stable.
    for (const [path] of PAGES) {
      let settled = await pageHtml(next.origin, path);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await delay(250);
        const again = await pageHtml(next.origin, path);
        if (again === settled) break;
        settled = again;
      }
      assert.equal(await pageHtml(next.origin, path, { 'User-Agent': ROBOT_UA }), await pageHtml(next.origin, path, { 'User-Agent': BROWSER_UA }),
        `${path}: the HTML does not depend on the user agent`);
    }

    // The service fails: Express has no copy (503), yet a regeneration never turns the page into an empty one.
    state.reset();
    state.down = true;
    const before = state.reads.length;
    for (const [path] of PAGES) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        process.kill(next.pid, 'SIGUSR2');
        const html = await pageHtml(next.origin, path);
        assert.equal(hasBuilds(html), true, `${path}: the page keeps its builds while Express fails`);
        assert.doesNotMatch(html, /Сборки временно недоступны/);
        await delay(250);
      }
    }
    assert.ok(state.reads.length > before, 'the pages did try to regenerate (the scenario is real)');
  } finally {
    await next.close();
    legacyServer.closeAllConnections();
    await new Promise(done => legacyServer.close(done));
  }
});
