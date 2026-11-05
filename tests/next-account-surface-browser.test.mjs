import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const surfaceClasses = page => page.$eval('.arena-app-shell', shell => [...shell.classList]
  .filter(name => name.startsWith('arena-app-') && name !== 'arena-app-shell').sort());

test('Next.js account and home pages carry their own shell surface', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const [name, value] = runtime.cookie.split('=');
    await page.setCookie({ name, value, url: runtime.origin });

    await page.goto(`${runtime.origin}/?login`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.account-dashboard .account-hero', { timeout: 15_000 });
    assert.deepEqual(await surfaceClasses(page), ['arena-app-profile']);
    assert.equal(await page.title(), 'Личный кабинет — HearthPulse');
    assert.deepEqual(await page.$$eval('h1', headings => headings.map(heading => heading.id)), ['account-title'],
      'the account name is the only page heading');

    await page.goto(`${runtime.origin}/`, { waitUntil: 'networkidle2' });
    assert.deepEqual(await surfaceClasses(page), ['arena-app-home']);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
