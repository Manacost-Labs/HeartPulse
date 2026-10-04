import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// Meta and the archetype catalog show a teaser to guests and full data to
// Diamond subscribers. The server renders the anonymous teaser when Express
// has it (tests/next-first-paint-data-browser.test.mjs), so a guest requests
// at most the teaser, and only when the page has none; a subscriber makes
// exactly one request, for the full data, after the account check.
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
        assert.deepEqual(requested, subscriber ? [endpoint] : serverTeaser ? [] : [`${endpoint}/teaser`],
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
