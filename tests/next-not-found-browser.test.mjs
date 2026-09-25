import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

test('unknown Next HTML uses the public 404 shell without changing card-specific 404s', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  try {
    const unknown = await fetch(`${runtime.nextOrigin}/definitely-unknown-20260925/`);
    const html = await unknown.text();
    assert.equal(unknown.status, 404);
    assert.match(html, /Страница не найдена/);
    assert.doesNotMatch(html, /Карта не найдена/);
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    assert.match(html, /href="\/articles\/?"/);

    const missingCard = await fetch(`${runtime.nextOrigin}/standard/cards/standard/missing-card-999999/`);
    assert.equal(missingCard.status, 404);
    assert.match(await missingCard.text(), /Карта не найдена/);

    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('response', response => {
      if (response.status() >= 500) failures.push(`${response.status()} ${response.url()}`);
    });
    for (const width of [320, 390, 1440]) {
      await page.setViewport({ width, height: 900 });
      const response = await page.goto(`${runtime.nextOrigin}/definitely-unknown-20260925/`,
        { waitUntil: 'networkidle2' });
      assert.equal(response.status(), 404);
      const state = await page.evaluate(() => ({
        heading: document.querySelector('h1')?.textContent?.trim(),
        mainCount: document.querySelectorAll('main').length,
        overflow: document.documentElement.scrollWidth > innerWidth,
        nav: Boolean(document.querySelector('nav')),
      }));
      assert.equal(state.heading, 'Страница не найдена');
      assert.equal(state.mainCount, 1);
      assert.equal(state.overflow, false, `404 overflow at ${width}px`);
      assert.equal(state.nav, true, `404 navigation at ${width}px`);
    }
    assert.deepEqual(failures, []);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
