import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { qaSessionCookie } from '../scripts/qa/mockApi.mjs';
import { startQaNextRuntime } from '../scripts/qa/nextRuntime.mjs';

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

const summary = {
  title: 'Vicious Syndicate Gold',
  format: 'Standard',
  games: 345678,
  source: 'Vicious Syndicate Live',
  sourceUrl: 'https://www.vicioussyndicate.com/data-reaper-live/',
  updatedAt: '2026-07-26T08:00:00.000Z',
  minimumDeckFrequency: 0.5,
  classDistribution: [
    { class: 'Mage', classLabel: 'Маг', classIcon: 'mage', frequency: 18.5 },
    { class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior', frequency: 12.25 },
  ],
  deckDistribution: [
    { deck: 'Burn Mage', deckLabel: 'Берн Маг', class: 'Mage', classLabel: 'Маг', classIcon: 'mage', frequency: 8.4, build: null },
    { deck: 'Control Warrior', deckLabel: 'Контроль Воин', class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior', frequency: 5.1, build: null },
  ],
  tierList: [
    {
      rankBracket: 'All ranks',
      rankLabel: 'Все ранги',
      decks: [
        { rank: 1, deck: 'Burn Mage', deckLabel: 'Берн Маг', class: 'Mage', classLabel: 'Маг', classIcon: 'mage', winrate: 53.2, build: null },
      ],
    },
  ],
  buildCoverage: { found: 0, total: 2 },
};

const builds = {
  builds: [
    {
      deck: 'Burn Mage',
      build: {
        deckCode: 'AAECAf0EBK/ABtH4BsvhBqfTBw2P9AaM9AaQ9AaY9Aaa9Aab9Aad9Aaf9Aag9Aah9Aai9Aaj9Aak9AYAAA==',
        source: 'hsguru-decks',
        sourceLabel: 'HSGuru',
        sourceUrl: 'https://www.hsguru.com/deck/example',
        matchedArchetype: 'Burn Mage',
        matchMethod: 'exact',
        updatedAt: '2026-07-26T08:00:00.000Z',
        winrate: 53.2,
        sampleGames: 1000,
        deckCards: [],
      },
    },
    { deck: 'Control Warrior', build: null },
  ],
  buildCoverage: { found: 1, total: 2 },
};

const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

test('Vicious Gold shows its summary before the deck builds arrive', async () => {
  const runtime = await startQaNextRuntime();
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    const [name, value] = qaSessionCookie().split('=');
    await page.setCookie({ name, value, url: runtime.origin });

    // The builds answer waits until the test has seen the page without it.
    let releaseBuilds;
    let buildsReleased = new Promise(resolve => { releaseBuilds = resolve; });
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const { pathname } = new URL(request.url());
      if (pathname === '/api/vicious-syndicate-gold') return request.respond(json(summary));
      if (pathname === '/api/vicious-syndicate-gold/builds') {
        await buildsReleased;
        return request.respond(json(builds));
      }
      return request.continue();
    });

    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.goto(`${runtime.origin}/standard/vicious-gold/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.traditional-mode-banner__summary');
    assert.match(await page.$eval('.traditional-mode-banner__summary', node => node.textContent ?? ''), /догружаем сборки/i,
      'the summary renders while the builds are still loading');
    assert.equal(await page.$$eval('.vsgold__deck-row', rows => rows.length), 2);
    assert.equal(await page.$('.vsgold__build-copy-button'), null, 'no build is shown before the builds answer');

    releaseBuilds();
    await page.waitForFunction(() => document.querySelector('.traditional-mode-banner__summary')?.textContent?.includes('1/2'));
    assert.ok(await page.$('.vsgold__build-copy-button'));
    assert.deepEqual(runtimeErrors, []);

    buildsReleased = Promise.resolve();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.vsgold__mobile-nav a');
    const mobile = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      navTargets: [...document.querySelectorAll('.vsgold__mobile-nav a')]
        .map(element => element.getBoundingClientRect().height),
    }));
    assert.ok(mobile.overflow <= 1, `Vicious Gold overflowed by ${mobile.overflow}px on mobile`);
    assert.ok(mobile.navTargets.length > 0 && mobile.navTargets.every(height => height >= 44),
      'mobile section links must keep 44px touch targets');

    await page.addScriptTag({ path: axePath });
    const violations = await page.evaluate(async () => {
      const result = await globalThis.axe.run(document.querySelector('.vsgold'));
      return result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
    });
    assert.deepEqual(violations, []);
  } finally {
    await browser?.close();
    await runtime.close();
  }
});
