import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// Prepared anonymous archetype summaries are reused by every viewer. Meta
// subscribers read only protected data after the account check; guests recover
// only a missing teaser, without waiting for that check. Protected archetype reads belong to the detail page.
test('Next.js soft-paywall pages request only the data the visitor may see', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    runtime.grant();
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const [name, value] = runtime.cookie.split('=');
    for (const [path, endpoint] of [['/standard/meta/', '/api/standard-meta'], ['/standard/archetypes/', '/api/constructed-archetypes']]) {
      for (const [subscriber, remembered] of [[true, true], [true, false], [false, false]]) {
        const context = await browser.createBrowserContext();
        if (subscriber) await context.setCookie({ name, value, domain: new URL(runtime.origin).hostname, path: '/' },
          // The readable session tag that sign-in sets with the session cookie.
          { name: 'hp_viewer', value: createHash('sha256').update(`hearthpulse-viewer-session:${value}`).digest('base64url').slice(0, 22),
            domain: new URL(runtime.origin).hostname, path: '/' });
        // A returning subscriber's browser remembers the viewer of this session:
        // an earlier visit verified it (the server set the session's viewer tag).
        if (remembered) {
          const earlier = await context.newPage();
          await earlier.goto(`${runtime.origin}${path}`, { waitUntil: 'networkidle0' });
          await earlier.waitForFunction(() => localStorage.getItem('hs_arena_viewer_hint'), { timeout: 10_000 });
          await earlier.close();
        }
        const page = await context.newPage();
        const requested = [];
        page.on('request', request => {
          const { pathname } = new URL(request.url());
          if (pathname.startsWith(endpoint)) requested.push(pathname);
        });
        const response = await page.goto(`${runtime.origin}${path}`, { waitUntil: 'networkidle0' });
        const html = await response.text();
        // The fixture Express has an (empty) archetype catalog but no meta data.
        const serverTeaser = path === '/standard/archetypes/';
        const label = `${path} for a ${subscriber ? `${remembered ? 'remembered' : 'new'} subscriber` : 'guest'}`;
        // A guest's teaser never waits for the session check. The meta page of
        // a browser holding a session waits for that check instead of reading
        // a teaser the full slice would cancel; the archetype catalog serves
        // its teaser from the server. Either way a subscriber reads the full
        // slice only.
        const expected = serverTeaser ? [] : !subscriber ? [`${endpoint}/teaser`] : [endpoint];
        assert.deepEqual(requested, expected, `${label} requested ${JSON.stringify(requested)}`);
        assert.doesNotMatch(html, /"deckCode":"[^"]/, `${path} carries no deck code in its HTML`);
        await context.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
