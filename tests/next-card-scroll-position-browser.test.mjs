import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// Next.js renders the card before the browser loads its full detail. A reader
// who scrolls meanwhile must keep their place when that detail arrives.
test('a card page keeps the reader scroll position when its full detail arrives', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 600 });
    let releaseDetail;
    const detailRequested = new Promise(resolve => {
      page.on('request', request => {
        if (!new URL(request.url()).pathname.startsWith('/api/constructed-cards/blizzard')) {
          request.continue();
          return;
        }
        releaseDetail = () => request.continue();
        resolve();
      });
    });
    await page.setRequestInterception(true);
    await page.goto(`${runtime.origin}/standard/cards/standard/blizzard%3A12345/`, { waitUntil: 'domcontentloaded' });
    await detailRequested;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(() => window.scrollTo(0, 400));
    assert.equal(await page.evaluate(() => window.scrollY), 400, 'the page must be long enough to scroll');

    const detailLoaded = page.waitForResponse(response => new URL(response.url()).pathname.startsWith('/api/constructed-cards/blizzard'));
    releaseDetail();
    await detailLoaded;
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));
    assert.equal(await page.evaluate(() => window.scrollY), 400);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
