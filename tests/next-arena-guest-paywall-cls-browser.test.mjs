import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// The gate replaces a loading page once the guest check finishes. When the
// gated children are plain elements, React used to recycle their DOM nodes as
// the gate's wrapper and overlay, which the browser scores as moved content
// (production /legendaries/ CLS 0.20 desktop, 0.12 phone).
test('Next Arena pages swap a guest to the paywall without a layout shift', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
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
