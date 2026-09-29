import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// The public shell offers the delayed Boosty support prompt to desktop readers
// once they scroll, as the single-page shell did before the Next.js migration.
test('Next.js public pages offer the delayed support prompt after scrolling', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${runtime.origin}/faq/`, { waitUntil: 'networkidle2' });
    assert.equal(await page.$('.support-prompt'), null, 'the prompt waits until the reader engages with the page');

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForSelector('.support-prompt--collapsed', { visible: true, timeout: 10_000 });
    await page.click('.support-prompt__trigger');
    await page.waitForSelector('.support-prompt--expanded', { visible: true, timeout: 10_000 });
    assert.equal(await page.$eval('.support-prompt__button', link => link.getAttribute('href')),
      'https://boosty.to/kolodahearthstone');
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
