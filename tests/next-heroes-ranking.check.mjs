import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import express from 'express';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { createBattlegroundHeroRankingRouter } from '../server/battlegroundHeroRankingRoutes.ts';
import { buildHeroCatalog, closedValues, HERO_COUNT, OPEN_ROWS } from './helpers/battlegroundHeroesFixture.ts';

// The built /heroes/ page against an Express that serves the real open-ranking projection: a guest
// and a robot get the same HTML with the full base-range ranking of solo and duos (tier, average
// place, top-4, pick rate, tip, date), the ItemList equals the solo table, and no closed value is in
// the HTML, the RSC payload (`self.__next_f`) or the JSON-LD. Without data the page is a 200.

const CLOSED = closedValues();
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const ROBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const format = (value, digits) => value.toFixed(digits).replace('.', ',');

function startLegacy(state) {
  const app = express();
  app.use((request, _response, next) => {
    state.reads.push({ path: request.originalUrl, cookie: request.headers.cookie ?? '' });
    next();
  });
  app.get('/api/auth/me', (_request, response) => response.json({ user: null }));
  // `state.reset()` makes a new router: the last known copy of the old one is gone.
  const make = () => createBattlegroundHeroRankingRouter({
    loadCatalog: async mode => {
      if (state.down) throw new Error('service down');
      return buildHeroCatalog('TOP_50_PERCENT', mode);
    },
    onError: () => undefined,
  });
  let router = make();
  state.reset = () => { router = make(); };
  app.use('/api', (request, response, next) => router(request, response, next));
  return app;
}

const guestHtml = async (origin, headers = {}) => {
  const response = await fetch(`${origin}/heroes/`, { headers });
  assert.equal(response.status, 200);
  return response.text();
};

test('the guest HTML of /heroes/ carries the open ranking of both modes and nothing closed', async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const state = { reads: [], down: true };
  const legacyServer = startLegacy(state).listen(0, '127.0.0.1');
  await once(legacyServer, 'listening');
  const next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${legacyServer.address().port}`,
    env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
  // /heroes/ is a five-minute ISR page: move the server's clock past that window until the regenerated copy is served.
  const regenerated = async (ready, phase, headers = { 'User-Agent': BROWSER_UA, Cookie: 'session=guest-fixture' }) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      const html = await guestHtml(next.origin, headers);
      if (ready(html)) return html;
      await delay(250);
    }
    return assert.fail(`the page was not regenerated: ${phase}; ${next.output().slice(-300)}`);
  };
  const hasRanking = html => html.includes('id="heroes-solo"');
  try {
    const buildCopy = await guestHtml(next.origin);
    assert.equal(hasRanking(buildCopy), false, 'the copy made without Express has no ranking but is a 200 page');
    assert.match(buildCopy, /class="paywalled-heroes"/);
    state.down = false;
    const html = await regenerated(hasRanking, 'ranking appears');

    const rowsOf = id => {
      const start = html.indexOf(`id="${id}"`);
      const section = html.slice(start, html.indexOf('</section>', start));
      return [...section.matchAll(/<tr><td>(\d+)<\/td><th scope="row"><a class="bg-heroes-public__hero" href="\/heroes\/(\d+)\/">(?:<img[^>]*>)?<span>([^<]+)<\/span><\/a><\/th><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><td class="bg-heroes-public__tip">([^<]+)<\/td><\/tr>/g)]
        .map(match => ({ place: Number(match[1]), dbfId: Number(match[2]), name: match[3], tier: match[4], avg: match[5], top4: match[6], pick: match[7], tip: match[8] }));
    };
    for (const [id, mode] of [['heroes-solo', 'solo'], ['heroes-duos', 'duos']]) {
      assert.deepEqual(rowsOf(id), OPEN_ROWS(mode).map((row, index) => ({
        place: index + 1, dbfId: row.dbfId, name: row.name, tier: row.tier, avg: format(row.avgPlacement, 2),
        top4: row.top4Rate === null ? '—' : `${format(row.top4Rate, 1)}%`, pick: `${format(row.pickRate, 1)}%`,
        tip: `Сила: Сила ${index}. Лучшая сборка: Сборка ${index}. Ключевые существа: Существо ${index}a, Существо ${index}b`,
      })), `${mode}: every ranked hero, in order, with the open figures`);
    }
    assert.match(html, /Данные на <time dateTime="2026-11-18T17:01:18\.663Z">18 ноября 2026, 20:01 МСК<\/time> · источник HSReplay/, 'date and source');
    assert.ok(html.indexOf('<h1') < html.indexOf('id="heroes-solo"') && html.indexOf('id="heroes-solo"') < html.indexOf('class="paywalled-heroes"'),
      'the ranking stands after the H1 and before the closed part');
    assert.match(html, /Топ 20%[\s\S]*Топ 5%[\s\S]*Топ 1%/, 'the narrower ranges are named and locked');

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
    assert.deepEqual(dataset.hasPart, { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-heroes' });
    const list = graph.find(node => node['@type'] === 'ItemList');
    assert.equal(list.numberOfItems, HERO_COUNT);
    assert.deepEqual(list.itemListElement.map(item => ({ name: item.name, url: item.url })),
      rowsOf('heroes-solo').map(row => ({ name: row.name, url: `https://hearthpulse.net/heroes/${row.dbfId}/` })), 'the ItemList equals the solo table');

    // The server reads the projection anonymously.
    const reads = state.reads.filter(read => read.path.startsWith('/api/bg/heroes'));
    assert.ok(reads.length > 0 && reads.every(read => /^\/api\/bg\/heroes\/public\?mode=(solo|duos)$/.test(read.path)), 'only the open projection is read');
    assert.deepEqual([...new Set(state.reads.map(read => read.cookie))], [''], 'cookies are never forwarded');

    // A robot and a guest get the same document. A regeneration started by the loop above may still land, so
    // wait until the page is stable (two copies in a row are equal) before comparing the two viewers.
    let settled = await guestHtml(next.origin);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await delay(250);
      const again = await guestHtml(next.origin);
      if (again === settled) break;
      settled = again;
    }
    assert.equal(await guestHtml(next.origin, { 'User-Agent': ROBOT_UA }), await guestHtml(next.origin, { 'User-Agent': BROWSER_UA }),
      'the HTML does not depend on the user agent');

    // No data: a 200 page without the table but with the closed-part marker and a notice.
    state.reset();
    state.down = true;
    const empty = await regenerated(page => !hasRanking(page), 'ranking disappears without data');
    assert.match(empty, /class="paywalled-heroes"/);
    assert.match(empty, /Рейтинг героев временно недоступен/);
  } finally {
    await next.close();
    legacyServer.closeAllConnections();
    await new Promise(done => legacyServer.close(done));
  }
});
