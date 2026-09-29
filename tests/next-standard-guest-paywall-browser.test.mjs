import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// Traditional-mode analytics require the Boosty «Алмаз» tier, so their guest
// paywall must name that tier, as the single-page shell did.
test('Next traditional-mode pages ask guests for the Diamond tier', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    for (const path of ['/standard/matchups/', '/standard/vicious-gold/']) {
      const page = await browser.newPage();
      await page.goto(`${runtime.origin}${path}`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.arena-paywall .arena-paywall__dialog', { timeout: 15000 })
        .catch(() => assert.fail(`${path} must render the shared paywall for a guest`));
      const copy = await page.$eval('.arena-paywall', paywall => paywall.textContent ?? '');
      assert.match(copy, /«Алмаз»/, `${path} must name the Diamond tier`);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
