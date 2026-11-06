import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// Administrators may read Arena statistics without a subscription; every
// Arena page must treat them as allowed, as the classes page already does.
test('Next Arena pages do not show the paywall to administrators without a subscription', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    runtime.backend.database.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run('card-reader');
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
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
