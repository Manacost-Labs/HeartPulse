import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startQaNextRuntime } from '../scripts/qa/nextRuntime.mjs';

// The page search field of each Standard section that shares the field styles.
// Every page also has the global header search, so the field is named.
const SEARCH_FIELDS = [
  ['/standard/meta/', 'input[placeholder^="Найти архетип"]'],
  ['/standard/archetypes/', 'input[placeholder^="Найти архетип"]'],
  ['/standard/fun-decks/', 'input[placeholder="Найти колоду или класс"]'],
];

test('search fields keep their shape during pointer typing and retain a Tab indicator', async () => {
  const runtime = await startQaNextRuntime();
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    for (const width of [390, 1440]) {
      await page.setViewport({ width, height: 900 });
      for (const [route, field] of SEARCH_FIELDS) {
        await page.goto(`${runtime.origin}${route}`, { waitUntil: 'networkidle2' });
        await page.waitForSelector(field, { visible: true });
        const readStyle = () => page.$eval(field, input => {
          const style = getComputedStyle(input);
          const frame = getComputedStyle(input.parentElement);
          return { radius: style.borderRadius, shadow: style.boxShadow, outline: style.outlineStyle, width: style.outlineWidth, frameShadow: frame.boxShadow, frameOutline: frame.outlineStyle };
        });
        const before = await readStyle();
        await page.click(field);
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
        assert.equal(await page.$eval(field, e => e === document.activeElement), true, `${route}: Shift+Tab returns to the field`);
        const keyboard = await readStyle();
        assert.equal(keyboard.outline, 'solid', `${route}: Tab must show focus`);
        assert.equal(keyboard.width, '2px');
        assert.equal(keyboard.shadow, 'none');
        assert.equal(keyboard.radius, before.radius);
        await page.click(field);
        assert.equal((await readStyle()).outline, 'none', `${route}: returning to pointer clears the ring`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      }
    }
  } finally {
    await browser?.close();
    await runtime.close();
  }
});
