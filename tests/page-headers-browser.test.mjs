import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const selector = '.traditional-mode-banner, .constructed-cards__header, .section-banner-modern';
test('traditional and Arena headers share geometry without clipping or reduced-motion animation', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen();
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewport({ width, height: 1000 });
      const dimensions = [];
      for (let index = 0; index < 9; index++) {
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/page-headers.html?case=${index}`);
        await page.waitForSelector(selector);
        await page.evaluate(() => document.fonts.ready);
        const geometry = await page.$eval(selector, el => {
          const rect = el.getBoundingClientRect();
          const title = el.querySelector('h1');
          const children = [...el.querySelectorAll('h1, p, dl, .constructed-cards__beta')];
          return { width: rect.width, height: rect.height, x: rect.x, y: rect.y, font: getComputedStyle(title).fontSize,
            gap: document.querySelector('[data-header-content]').getBoundingClientRect().top - rect.bottom,
            h1: document.querySelectorAll('h1').length,
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            clipped: children.some(child => { const r = child.getBoundingClientRect(); return r.left < rect.left || r.right > rect.right + 1 || r.bottom > rect.bottom + 1; }),
          };
        });
        assert.equal(geometry.h1, 1);
        assert.ok(Math.abs(geometry.gap - 16) <= 1, `${width}px case ${index}: expected 16px content gap, got ${geometry.gap}`);
        assert.equal(geometry.overflow, false, `${width}px case ${index}: page overflow`);
        assert.equal(geometry.clipped, false, `${width}px case ${index}: header content clipped`);
        dimensions.push(geometry);
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        assert.equal(await page.$eval(selector, el => el.getAnimations({ subtree: true }).filter(a => a.effect.getComputedTiming().duration > 1).length), 0);
        await page.emulateMediaFeatures([]);
        await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
        assert.equal(await page.$eval(selector, el => {
          const title = el.querySelector('h1');
          return title.scrollWidth > title.clientWidth + 1
            || title.getBoundingClientRect().bottom > el.getBoundingClientRect().bottom + 1
            || document.documentElement.scrollWidth > innerWidth + 1;
        }), false, `${width}px case ${index}: enlarged title must remain visible`);
        await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
      }
      for (const key of ['width', 'height', 'x', 'y']) {
        const values = dimensions.map(d => d[key]);
        assert.ok(Math.max(...values) - Math.min(...values) <= 1, `${width}px ${key}: ${values.join(', ')}`);
      }
      assert.equal(new Set(dimensions.map(d => d.font)).size, 1, `${width}px: heading scale differs`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
