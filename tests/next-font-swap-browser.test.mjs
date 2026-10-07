import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// `font-display: swap` paints text in a local face until the web font arrives.
// Unless that face is scaled to the web font's width and line box, the swap
// re-wraps lines and moves the page (production CLS 0.20 on /terms/ and 0.18
// on /privacy/ for phones; the battlegrounds title wrapped to two lines).
test('public pages keep their layout when the web fonts arrive late', { timeout: 180_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    for (const viewport of [{ width: 390, height: 844, isMobile: true }, { width: 1440, height: 900 }]) {
      for (const path of ['/terms/', '/privacy/', '/battlegrounds/tier-list/']) {
        const page = await browser.newPage();
        await page.setViewport(viewport);
        await page.evaluateOnNewDocument(() => {
          window.__layoutShift = 0;
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) window.__layoutShift += entry.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });
        });
        let releaseFonts;
        const fontsHeld = new Promise(resolve => { releaseFonts = resolve; });
        await page.setRequestInterception(true);
        page.on('request', async request => {
          if (new URL(request.url()).pathname.endsWith('.woff2')) await fontsHeld;
          await request.continue();
        });
        await page.goto(`${runtime.origin}${path}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#main-content h1');
        // Hydration and the access check settle while the fonts are held.
        await pause(1000);
        const beforeFonts = await page.evaluate(() => window.__layoutShift);
        releaseFonts();
        await page.evaluate(() => document.fonts.ready);
        await pause(300);
        const label = `${path} at ${viewport.width}px`;
        assert.equal(await page.evaluate(() => [...document.fonts].some(face => face.family.replace(/["']/g, '') === 'Inter'
          && face.status === 'loaded')), true, `${label} must end up with the Inter web font`);
        const swapShift = await page.evaluate(() => window.__layoutShift) - beforeFonts;
        assert.ok(swapShift < 0.02, `${label} moved by ${swapShift.toFixed(4)} when the web fonts arrived`);
        await page.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
