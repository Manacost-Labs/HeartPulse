import assert from 'node:assert/strict';
import http from 'node:http';
import { closeLocal, listenLocal } from './publicCardFixture.mjs';

const TILES = '.archetype-dossier .ui-kpi-group__tile';

/** Serve the real Next document in two writes, as a slow stream that paints its first two KPIs before the last four. */
export async function measureDossierStream({ browser, gateway, origin, state }, path, width) {
  const upstream = await fetch(origin + path, { headers: { 'User-Agent': await browser.userAgent() } });
  assert.equal(upstream.status, 200);
  const html = await upstream.text();
  const group = html.indexOf('class="ui-kpi-group', html.indexOf('class="archetype-dossier"'));
  const first = html.indexOf('</li>', group);
  const second = html.indexOf('</li>', first + 5);
  assert.ok(group >= 0 && first > group && second > first, 'two KPI tiles in the server document');
  const cut = second + '</li>'.length;
  const rest = Promise.withResolvers();
  const server = http.createServer((request, response) => {
    if (request.url !== path || request.headers['sec-fetch-dest'] !== 'document') {
      gateway.emit('request', request, response);
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.write(html.slice(0, cut));
    rest.promise.then(() => response.end(html.slice(cut)));
  });
  const address = await listenLocal(server);
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport({ width, height: 900 });
    await page.emulateCPUThrottling(4);
    await page.evaluateOnNewDocument(() => {
      window.dossierCLS = 0;
      new PerformanceObserver(list => {
        for (const shift of list.getEntries()) {
          const dossier = document.querySelector('.archetype-dossier');
          if (!shift.hadRecentInput && shift.sources.some(({ node }) => dossier?.contains(node))) {
            window.dossierCLS += shift.value;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const navigation = page.goto(address + path, { waitUntil: 'domcontentloaded' });
    let partial;
    try {
      await page.waitForFunction(tiles => document.querySelectorAll(tiles).length === 2
        && performance.getEntriesByName('first-contentful-paint').length > 0, {}, TILES);
      partial = await page.$eval(TILES, tile => tile.getBoundingClientRect().width);
    } finally {
      rest.resolve();
      await navigation;
    }
    await page.waitForSelector(state.member ? '.archetype-dossier .ui-kpi-group__delta' : '.archetype-dossier .paid-lock');
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    assert.equal(await page.$$eval(TILES, tiles => tiles.length), 6);
    return { partial, final: await page.$eval(TILES, tile => tile.getBoundingClientRect().width),
      cls: await page.evaluate(() => window.dossierCLS) };
  } finally {
    rest.resolve();
    await context.close();
    await closeLocal(server);
  }
}
