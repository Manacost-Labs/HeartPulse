import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// The production observer (config/production-observer.json) requires the
// shared `.arena-paywall` gate on every paid Arena page for anonymous visitors.
test('Next Arena pages show the shared subscription paywall to guests', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    for (const path of ['/classes/', '/tierlist/', '/legendaries/']) {
      const page = await browser.newPage();
      await page.goto(`${runtime.origin}${path}`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.arena-paywall .arena-paywall__dialog', { timeout: 15000 })
        .catch(() => assert.fail(`${path} must render the shared paywall for a guest`));
      assert.equal(await page.$$eval('.arena-paywall', nodes => nodes.length), 1,
        `${path} must render exactly one paywall`);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
