import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// The production observer (config/production-observer.json) requires the
// shared `.arena-paywall` gate on every paid Arena page for anonymous visitors.
test('Next Arena pages show the shared subscription paywall to guests', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
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
        loaders: node.querySelectorAll('.skeleton, [class*="animate-"]').length,
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

// The gate replaces a loading page once the guest check finishes. When the
// gated children are plain elements, React used to recycle their DOM nodes as
// the gate's wrapper and overlay, which the browser scores as moved content
// (production /legendaries/ CLS 0.20 desktop, 0.12 phone).
test('Next Arena pages swap a guest to the paywall without a layout shift', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844, isMobile: true }]) {
      for (const path of ['/classes/', '/tierlist/', '/legendaries/']) {
        const page = await browser.newPage();
        await page.setViewport(viewport);
        await page.evaluateOnNewDocument(() => {
          window.__layoutShifts = [];
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) window.__layoutShifts.push(entry.value);
            }
          }).observe({ type: 'layout-shift', buffered: true });
        });
        await page.goto(`${runtime.origin}${path}`, { waitUntil: 'networkidle2' });
        await page.waitForSelector('.arena-paywall .arena-paywall__dialog', { timeout: 15000 });
        await new Promise(resolve => setTimeout(resolve, 500));
        const shift = await page.evaluate(() => window.__layoutShifts.reduce((sum, value) => sum + value, 0));
        assert.ok(shift < 0.02, `${path} at ${viewport.width}px shifted by ${shift.toFixed(4)} when the paywall appeared`);
        await page.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});

// Administrators may read Arena statistics without a subscription; every
// Arena page must treat them as allowed, as the classes page already does.
test('Next Arena pages do not show the paywall to administrators without a subscription', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    runtime.backend.database.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run('card-reader');
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
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
