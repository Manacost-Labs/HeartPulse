import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// Prepared anonymous archetype summaries are reused by every viewer. Meta
// subscribers still read protected data after the account check; guests recover
// only a missing teaser. Protected archetype reads belong to the detail page.
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
        const response = await page.goto(`${runtime.origin}${path}`, { waitUntil: 'networkidle0' });
        const html = await response.text();
        // The fixture Express has an (empty) archetype catalog but no meta data.
        const serverTeaser = path === '/standard/archetypes/';
        assert.deepEqual(requested, serverTeaser ? [] : subscriber ? [endpoint] : [`${endpoint}/teaser`],
          `${path} for a ${subscriber ? 'subscriber' : 'guest'} requested ${JSON.stringify(requested)}`);
        assert.doesNotMatch(html, /"deckCode":"[^"]/, `${path} carries no deck code in its HTML`);
        await context.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
