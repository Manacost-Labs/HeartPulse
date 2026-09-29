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

// Administrators may read Arena statistics without a subscription; every
// Arena page must treat them as allowed, as the classes page already does.
test('Next Arena pages do not show the paywall to administrators without a subscription', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    runtime.backend.database.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run('card-reader');
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const [name, value] = runtime.cookie.split('=');
    for (const path of ['/classes/', '/tierlist/', '/legendaries/']) {
      const page = await browser.newPage();
      await page.setCookie({ name, value, url: runtime.origin });
      const statusChecked = page.waitForResponse(response => new URL(response.url()).pathname === '/api/subscription/status');
      await page.goto(`${runtime.origin}${path}`, { waitUntil: 'networkidle2' });
      await statusChecked;
      assert.equal(await page.$$eval('.arena-paywall', nodes => nodes.length), 0,
        `${path} must not gate an administrator behind the subscription paywall`);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
