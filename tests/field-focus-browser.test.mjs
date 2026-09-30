import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

test('search fields keep their shape during pointer typing and retain a Tab indicator', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen();
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const readStyle = () => page.$eval('input[placeholder]', input => {
      const style = getComputedStyle(input);
      const frame = getComputedStyle(input.parentElement);
      return { radius: style.borderRadius, shadow: style.boxShadow, outline: style.outlineStyle, width: style.outlineWidth, frameShadow: frame.boxShadow, frameOutline: frame.outlineStyle };
    });
    for (const width of [390, 1440]) {
      await page.setViewport({ width, height: 900 });
      for (const route of ['meta', 'archetypes', 'fun-decks']) {
        await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/soft-paywall.html?page=${route}`);
        await page.waitForSelector('input[placeholder]');
        const before = await readStyle();
        await page.click('input[placeholder]');
        await page.keyboard.type('mage');
        const pointer = await readStyle();
        assert.equal(pointer.outline, 'none', `${route}: pointer typing must not add an outline`);
        assert.equal(pointer.shadow, 'none', `${route}: no inner glow`);
        assert.equal(pointer.radius, before.radius, `${route}: no shape change`);
        assert.equal(pointer.frameShadow, before.frameShadow, `${route}: no outer glow`);
        assert.equal(pointer.frameOutline, before.frameOutline, `${route}: no extra frame`);
        await page.keyboard.press('Tab');
        await page.keyboard.down('Shift');
        await page.keyboard.press('Tab');
        await page.keyboard.up('Shift');
        assert.equal(await page.$eval('input[placeholder]', e => e === document.activeElement), true);
        const keyboard = await readStyle();
        assert.equal(keyboard.outline, 'solid', `${route}: Tab must show focus`);
        assert.equal(keyboard.width, '2px');
        assert.equal(keyboard.shadow, 'none');
        assert.equal(keyboard.radius, before.radius);
        await page.click('input[placeholder]');
        assert.equal((await readStyle()).outline, 'none', `${route}: returning to pointer clears the ring`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      }
    }
  } finally {
    await browser?.close();
    await server.close();
  }
});
