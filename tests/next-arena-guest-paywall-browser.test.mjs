import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// The production observer (config/production-observer.json) requires the
// shared `.arena-paywall` gate on every paid Arena page for anonymous visitors.
test('Next Arena pages show the shared subscription paywall to guests', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    for (const path of ['/classes/', '/tierlist/', '/legendaries/']) {
      const page = await browser.newPage();
      await page.goto(`${runtime.origin}${path}`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.arena-paywall .arena-paywall__dialog', { timeout: 15000 })
        .catch(() => assert.fail(`${path} must render the shared paywall for a guest`));
      assert.equal(await page.$$eval('.arena-paywall', nodes => nodes.length), 1,
        `${path} must render exactly one paywall`);
      // A guest's preview never loads; its blurred loaders must not loop for the whole visit.
      const preview = await page.$eval('.arena-paywall__preview', node => ({
        loaders: node.querySelectorAll('.loading-block, [class*="animate-"]').length,
        running: document.getAnimations().filter(animation => animation.playState === 'running'
          && node.contains(animation.effect?.target)).map(animation => animation.animationName),
      }));
      assert.ok(preview.loaders > 0, `${path} preview must still hold its loading state`);
      assert.deepEqual(preview.running, [], `${path} must not loop animations inside the locked preview`);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
