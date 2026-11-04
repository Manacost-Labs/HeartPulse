import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

test('the removed radar returns 404 and is absent from navigation', { timeout: 240000 }, async () => {
  const pilot = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true });
    const page = await browser.newPage();
    const response = await page.goto(`${pilot.origin}/standard/radar/`, { waitUntil: 'networkidle2' });
    assert.equal(response.status(), 404);
    await page.goto(`${pilot.origin}/`, { waitUntil: 'networkidle2' });
    assert.equal(await page.$('a[href="/standard/radar/"]'), null);
    assert.equal(await page.$('a[href="/standard/radar"]'), null);
  } finally {
    if (browser) await browser.close();
    await pilot.close();
  }
});
