import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import http from 'node:http';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

const chromiumPath = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome'].find(candidate => candidate && existsSync(candidate));
const CLASSES = ['deathknight', 'demonhunter', 'druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior'];
// The production standard catalog lists about 90 archetypes.
const catalog = JSON.stringify({
  format: 'standard', formatLabel: 'Стандарт', patch: '36.6.3', minimumGames: 50,
  updatedAt: '2026-10-07T10:00:00.000Z', coverage: {},
  items: Array.from({ length: 90 }, (_, index) => ({
    slug: `archetype-${index + 1}`, archetype: `Archetype ${index + 1}`, archetypeLabel: `Архетип ${index + 1}`,
    translated: true, classKey: CLASSES[index % CLASSES.length], format: 'standard',
    games: 128_000 - index * 1_000, winrate: 48 + (index % 9) / 2, popularity: 10 - index / 10,
    turns: 11, durationMinutes: 10.5, climbingSpeed: 0.2, deckCount: 4 + (index % 20), builds: [], sourceUrl: '',
  })),
});

function answerApi(request, response) {
  const body = request.url.startsWith('/api/constructed-archetypes/teaser') ? catalog : JSON.stringify({ user: null });
  response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(body);
}

async function startGateway(nextOrigin) {
  const next = new URL(nextOrigin);
  const server = http.createServer((request, response) => {
    if (request.url.startsWith('/api/')) return answerApi(request, response);
    const upstream = http.request(next, { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  return { server, origin: await listenLocal(server) };
}

// Each archetype row is a nested grid with a filtered class icon. Rendering all
// 90 at once cost a phone (CPU x4) about 0.55 s of blocking time; rows outside
// the viewport now skip style, layout and paint until they approach it.
test('the archetype catalog renders only the rows near the viewport', { timeout: 90_000 }, async () => {
  const legacy = http.createServer(answerApi);
  let next, gateway, browser;
  try {
    next = await startNextServer({ legacyOrigin: await listenLocal(legacy) });
    gateway = await startGateway(next.origin);
    browser = await puppeteer.launch({ executablePath: chromiumPath,
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true });
    await page.evaluateOnNewDocument(() => {
      window.__layoutShift = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__layoutShift += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(`${gateway.origin}/standard/archetypes/`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.archetype-row');
    // On a phone the banner and filters push the list below the fold.
    await page.$eval('.archetype-row', row => row.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const rendered = await page.$$eval('.archetype-row', rows => ({
      count: rows.length,
      links: rows.filter(row => row.querySelector('a.archetype-row__open[href]')).length,
      // The row keeps its box; content-visibility skips what is inside it.
      first: rows[0].querySelector('h2').checkVisibility({ contentVisibilityAuto: true }),
      far: rows[80].querySelector('h2').checkVisibility({ contentVisibilityAuto: true }),
    }));
    assert.equal(rendered.count, 90);
    assert.equal(rendered.links, 90, 'skipped rows stay in the document for search engines and assistive technology');
    assert.equal(rendered.first, true, 'a row in the viewport is rendered');
    assert.equal(rendered.far, false, 'a row far below the viewport must skip rendering');

    const before = await page.evaluate(() => window.__layoutShift);
    await page.evaluate(async () => {
      while (scrollY + innerHeight < document.documentElement.scrollHeight - 2) {
        scrollBy(0, 400);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    });
    await new Promise(resolve => setTimeout(resolve, 300));
    const scrolled = await page.evaluate(() => window.__layoutShift);
    assert.ok(scrolled - before < 0.01, `scrolling the catalog shifted visible content by ${(scrolled - before).toFixed(4)}`);
    // At the very bottom the footer fills a phone screen, so bring the row back.
    await page.$eval('.archetype-row:last-child', row => row.scrollIntoView({ block: 'center' }));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.$eval('.archetype-row:last-child h2', title => title.checkVisibility({ contentVisibilityAuto: true })), true,
      'the last row renders once it is scrolled into view');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.close();
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    await closeLocal(legacy);
  }
});
