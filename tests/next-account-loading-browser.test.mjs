import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

test('a delayed account chunk does not reveal a footer that jumps away on load', { timeout: 45000 }, async () => {
  const chunks = join('apps/public-web/.next/static/chunks');
  const accountChunk = readdirSync(chunks, { recursive: true }).find(name => name.endsWith('.js')
    && readFileSync(join(chunks, name), 'utf8').includes('account-dashboard'));
  assert.ok(accountChunk, 'the built account view has a lazy chunk');
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    for (const width of [390, 1440]) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 1000 });
      const [name, value] = runtime.cookie.split('=');
      await page.setCookie({ name, value, url: runtime.origin });
      let held;
      const requested = new Promise(resolve => page.on('request', request => {
        if (new URL(request.url()).pathname === `/_next/static/chunks/${accountChunk}`) {
          held = request; resolve();
        } else request.continue();
      }));
      await page.setRequestInterception(true);
      await page.goto(`${runtime.origin}/?login`, { waitUntil: 'domcontentloaded' });
      await requested;
      await page.waitForSelector('.arena-content');
      const footerTop = await page.$eval('footer', footer => footer.getBoundingClientRect().top);
      assert.ok(footerTop >= 1000, `loading must keep the footer outside the initial viewport at ${width}px (top=${footerTop})`);
      await held.continue();
      await page.waitForSelector('.account-dashboard .account-hero');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
