import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

test('hero detail keeps buddies aligned and statistics navigable without a chart wall', async () => {
  const server = await createServer({ configFile: 'tests/fixtures/vite.hero-motion.config.ts', server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen();
    const port = server.httpServer.address().port;
    const executablePath = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome'].find(path => path && existsSync(path));
    browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/tests/fixtures/battleground-hero-motion.html`);
    await page.waitForSelector('[data-tour-id="bg-hero-detail-media"] button');
    assert.equal(await page.$eval('.bg-hero-stat-plaque', element => getComputedStyle(element).padding), '12px', 'fixture preserves production CSS layer order');
    const buddyGeometry = await page.$$eval('[data-tour-id="bg-hero-detail-media"] button', buttons => buttons.slice(1).map(button => {
      const { x, y, width, height } = button.getBoundingClientRect();
      return { x, y, width, height };
    }));
    assert.equal(buddyGeometry.length, 2);
    assert.ok(Math.abs(buddyGeometry[0].y - buddyGeometry[1].y) < 1, 'normal and golden buddy belong on the same row');
    assert.ok(Math.abs(buddyGeometry[0].width - buddyGeometry[1].width) < 1, 'buddy cards have equal width');
    assert.ok(Math.abs(buddyGeometry[0].height - buddyGeometry[1].height) < 1, 'buddy cards have equal height');
    await page.waitForSelector('[role="tablist"][aria-label="Статистика героя"]', { timeout: 3000 });
    const visiblePanels = () => page.$$eval('[role="tabpanel"]', panels => panels.filter(panel => !panel.hidden).length);
    assert.equal(await visiblePanels(), 1);
    for (const label of ['Сила героя', 'Таверна', 'Составы', 'Обзор']) {
      const tab = await page.$(`[role="tab"][data-stat-tab="${label}"]`);
      assert.ok(tab, label);
      await tab.click();
      assert.equal(await tab.evaluate(element => element.getAttribute('aria-selected')), 'true');
      assert.equal(await visiblePanels(), 1);
    }
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Сила героя');
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Составы');
    await page.keyboard.press('Home');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Обзор');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewport({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no page overflow at ${width}px`);
      assert.equal(await visiblePanels(), 1);
      if (width === 390) {
        const heights = await page.$$eval('[data-tour-id="bg-hero-detail-media"] button', buttons => buttons.map(button => button.getBoundingClientRect().height));
        assert.ok(heights.every(height => height < 270), 'mobile media uses compact image-and-text rows');
      }
    }
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/tests/fixtures/battleground-hero-motion.html?path=/heroes`);
    await page.waitForSelector('.battleground-hero-card');
    await page.focus('.battleground-hero-card');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.battleground-hero-related-card')).opacity === '1');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.battleground-hero-related-card')).opacity === '0', { timeout: 1500 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.hover('.battleground-hero-card');
    const duration = await page.$eval('.battleground-hero-related-card', element => getComputedStyle(element).transitionDuration);
    assert.ok(duration.split(',').every(value => parseFloat(value) <= 0.001), 'reduced motion disables power movement');
    await page.click('.battleground-hero-card');
    await page.waitForSelector('.bg-hero-detail-page');
    await page.goto(`http://127.0.0.1:${port}/tests/fixtures/battleground-hero-motion.html?path=/heroes/61489`);
    await page.waitForSelector('[role="tab"]');
    for (const label of ['Обзор', 'Сила героя', 'Таверна', 'Составы']) {
      await page.click(`[role="tab"][data-stat-tab="${label}"]`);
      assert.match(await page.$eval('[role="tabpanel"]:not([hidden])', panel => panel.textContent), /Для этого раздела пока нет статистики/, `empty ${label} is explained`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
