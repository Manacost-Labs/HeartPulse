import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { qaSessionCookie } from '../scripts/qa/mockApi.mjs';
import { startQaNextRuntime } from '../scripts/qa/nextRuntime.mjs';
import { builds, summary } from './fixtures/viciousGoldPayload.mjs';

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const BANDS = [['Тир 1', 52, Infinity], ['Тир 2', 50, 52], ['Тир 3', 47, 50], ['Тир 4', -Infinity, 47]];

async function openAsSubscriber(browser, origin, viewport) {
  const page = await browser.newPage();
  const [name, value] = qaSessionCookie().split('=');
  await page.setCookie({ name, value, url: origin });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/vicious-syndicate-gold') return request.respond(json(summary));
    if (pathname === '/api/vicious-syndicate-gold/builds') return request.respond(json(builds));
    return request.continue();
  });
  await page.evaluateOnNewDocument(() => {
    window.__layoutShift = 0;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__layoutShift += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.setViewport(viewport);
  await page.goto(`${origin}/standard/vicious-gold/`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('.traditional-mode-banner__summary')?.textContent?.includes('24/28'));
  return page;
}

function readBands(page) {
  return page.$$eval('.vsgold__tier-band', bands => bands.map(band => ({
    title: band.querySelector('h3')?.textContent ?? '',
    note: band.querySelector('header p')?.textContent ?? '',
    winrates: [...band.querySelectorAll('.vsgold__tier-card > strong')].map(node => Number.parseFloat(node.firstChild.textContent.replace(',', '.'))),
    classes: [...band.querySelectorAll('.vsgold__tier-card small')].map(node => node.textContent),
  })));
}

function assertBands(bands, label) {
  assert.ok(bands.length > 0, `${label}: the Power Tier board must show at least one band`);
  const order = BANDS.map(([title]) => title);
  assert.deepEqual(bands.map(band => band.title), order.filter(title => bands.some(band => band.title === title)),
    `${label}: bands run from Tier 1 down`);
  for (const band of bands) {
    const [, from, to] = BANDS.find(([title]) => title === band.title);
    assert.ok(band.winrates.every(winrate => winrate >= from && winrate < to), `${label}: ${band.title} holds only its win rates`);
    assert.match(band.note, new RegExp(`, ${band.winrates.length} колод`), `${label}: ${band.title} counts its decks`);
  }
}

// The subscriber view of /standard/vicious-gold/: popularity bars, Power Tier bands and a stable first screen.
test('Vicious Gold reads as a ranked board and keeps its place while loading', { timeout: 120_000 }, async () => {
  const runtime = await startQaNextRuntime();
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await openAsSubscriber(browser, runtime.origin, { width: 1440, height: 900 });
    assert.ok(await page.evaluate(() => window.__layoutShift) < 0.02,
      'the access check, the loader and the statistics must share one banner and one place');

    const bars = await page.$$eval('.vsgold__class-bars button', rows => rows.map(row => {
      const track = row.querySelector('div').getBoundingClientRect().width;
      return row.querySelector('i').getBoundingClientRect().width / track;
    }));
    const leader = Math.max(...summary.classDistribution.map(item => item.frequency));
    assert.ok(bars[0] > 0.98, 'the most popular class fills its bar');
    summary.classDistribution.forEach((item, index) => assert.ok(Math.abs(bars[index] - item.frequency / leader) < 0.02,
      `${item.classLabel} is drawn against the leader`));

    const freshness = await page.$eval('.vsgold__freshness', node => ({ text: node.textContent, href: node.querySelector('a')?.href }));
    assert.equal(freshness.href, summary.sourceUrl);
    assert.match(freshness.text, /обновлено \d{2}\.\d{2}\.\d{4}/);

    assertBands(await readBands(page), 'all ranks');
    assert.equal(await page.$$eval('.vsgold__tier-card', cards => cards.length), summary.tierList[0].decks.length);
    assert.equal(await page.$eval('.vsgold__class-tabs', row => row.scrollWidth <= row.clientWidth), true,
      'every class chip is visible on a wide screen');

    await page.click('.vsgold__rank-tabs button:nth-child(2)');
    assertBands(await readBands(page), 'legend');
    await page.click('.vsgold__class-tabs button:nth-child(2)');
    const warrior = await readBands(page);
    assertBands(warrior, 'legend warriors');
    assert.ok(warrior.flatMap(band => band.classes).every(label => label === 'Воин'), 'the class chip filters the board');

    await page.addScriptTag({ path: axePath });
    const violations = await page.evaluate(async () => (await globalThis.axe.run(document.querySelector('.vsgold')))
      .violations.filter(violation => ['serious', 'critical'].includes(violation.impact)).map(violation => violation.id));
    assert.deepEqual(violations, []);
    await page.close();

    const phone = await openAsSubscriber(browser, runtime.origin, { width: 390, height: 844, isMobile: true, hasTouch: true });
    const growth = await phone.evaluate(async () => {
      const start = document.documentElement.scrollHeight;
      while (scrollY + innerHeight < document.documentElement.scrollHeight - 2) {
        scrollBy(0, 500);
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      return Math.abs(document.documentElement.scrollHeight - start);
    });
    // Unrendered tier cards reserve their mean height, so the scrollbar barely moves while they render.
    assert.ok(growth < 250, `the page height changed by ${growth}px while scrolling`);
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.ok(await phone.evaluate(() => window.__layoutShift) < 0.02);
    await phone.close();
  } finally {
    await browser?.close();
    await runtime.close();
  }
});
