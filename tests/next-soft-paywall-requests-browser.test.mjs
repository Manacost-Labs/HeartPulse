import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// Meta and the archetype catalog show a teaser to guests and full data to
// Diamond subscribers. They wait for the account check, so a subscriber does
// not first request, then abort, the guest teaser.
test('Next.js soft-paywall pages request only the data the visitor may see', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    runtime.grant();
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const [name, value] = runtime.cookie.split('=');
    for (const [path, endpoint] of [['/standard/meta/', '/api/standard-meta'], ['/standard/archetypes/', '/api/constructed-archetypes']]) {
      for (const subscriber of [true, false]) {
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        if (subscriber) await page.setCookie({ name, value, url: runtime.origin });
        const requested = [];
        page.on('request', request => {
          const { pathname } = new URL(request.url());
          if (pathname.startsWith(endpoint)) requested.push(pathname);
        });
        await page.goto(`${runtime.origin}${path}`, { waitUntil: 'networkidle0' });
        assert.deepEqual(requested, [subscriber ? endpoint : `${endpoint}/teaser`],
          `${path} for a ${subscriber ? 'subscriber' : 'guest'} requested ${JSON.stringify(requested)}`);
        await context.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
