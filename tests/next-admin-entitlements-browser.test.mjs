import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

test('Next subscribers pages preserve administrator API access without a subscription', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    runtime.backend.database.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run('card-reader');
    const subscription = await fetch(`${runtime.origin}/api/subscription/status`, {
      headers: { Cookie: runtime.cookie },
    }).then(response => response.json());
    assert.equal(subscription.entitlements?.standard, false);
    assert.equal(subscription.entitlements?.arena, false);

    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const context = await browser.createBrowserContext();
    const [name, value] = runtime.cookie.split('=');
    for (const [path, api] of [
      ['/classes/', '/api/winrates'],
      ['/tierlist/', '/api/tierlist'],
      ['/legendaries/', '/api/legendaries'],
      ['/standard/matchups/', '/api/standard/matchups'],
      ['/standard/meta/', '/api/standard-meta'],
    ]) {
      const page = await context.newPage();
      await page.setCookie({ name, value, url: runtime.origin });
      await page.setRequestInterception(true);
      let requests = 0;
      page.on('request', request => {
        if (new URL(request.url()).pathname !== api) { request.continue(); return; }
        requests += 1;
        void request.respond({ status: 403, contentType: 'application/json', body: '{"error":"fixture"}' });
      });
      await page.goto(`${runtime.origin}${path}`, { waitUntil: 'networkidle2' });
      assert.ok(requests > 0, `${path} must request its protected API for an administrator`);
      await page.close();
    }
    await context.close();
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
