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
    browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4'] });
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
    const buddyMediaGeometry = await page.$$eval(
      '[data-tour-id="bg-hero-detail-media"] button .bg-hero-action-card__media',
      media => media.slice(1).map(element => {
        const { width, height } = element.getBoundingClientRect();
        return { width, height };
      }),
    );
    assert.equal(buddyMediaGeometry.length, 2);
    assert.ok(
      Math.abs(buddyMediaGeometry[0].width - buddyMediaGeometry[1].width) < 1
        && Math.abs(buddyMediaGeometry[0].height - buddyMediaGeometry[1].height) < 1,
      'normal and golden buddy artwork use the same visible frame',
    );
    assert.ok(
      Math.abs((buddyMediaGeometry[0].width / buddyMediaGeometry[0].height) - (512 / 776)) < 0.01,
      'buddy artwork frame preserves the full-card ratio',
    );
    await page.waitForSelector('[role="tablist"][aria-label="Статистика героя"]', { timeout: 3000 });
    const visiblePanels = () => page.$$eval('[role="tabpanel"]', panels => panels.filter(panel => !panel.hidden).length);
    assert.equal(await visiblePanels(), 1);
    const statisticsLayout = await page.$eval('.bg-hero-statistics', element => {
      const chart = element.querySelector('.bg-hero-chart-card');
      const panel = element.querySelector('[role="tabpanel"]:not([hidden])');
      return {
        rootWidth: element.getBoundingClientRect().width,
        rootOverflowX: getComputedStyle(element).overflowX,
        panelWidth: panel?.getBoundingClientRect().width || 0,
        panelScrollWidth: panel?.scrollWidth || 0,
        chartWidth: chart?.getBoundingClientRect().width || 0,
      };
    });
    assert.equal(statisticsLayout.rootOverflowX, 'clip', 'statistics clip decorative paint at their content boundary');
    assert.ok(statisticsLayout.panelScrollWidth <= statisticsLayout.panelWidth + 1, 'active statistics panel does not overflow');
    assert.ok(statisticsLayout.chartWidth > 0 && statisticsLayout.chartWidth <= 1152, 'wide charts stay readable instead of becoming a wall');
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
    for (const width of [320, 390, 768, 1440, 1600]) {
      await page.setViewport({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no page overflow at ${width}px`);
      assert.equal(await visiblePanels(), 1);
      if (width === 390) {
        const heights = await page.$$eval('[data-tour-id="bg-hero-detail-media"] button', buttons => buttons.map(button => button.getBoundingClientRect().height));
        assert.ok(heights.every(height => height < 270), 'mobile media uses compact image-and-text rows');
      }
      if (width === 1600) {
        const mediaRows = await page.$$eval('[data-tour-id="bg-hero-detail-media"] button', buttons => buttons.map(button => Math.round(button.getBoundingClientRect().y)));
        assert.equal(new Set(mediaRows).size, 1, 'wide screens keep all three media cards in one compact row');
      }
    }
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/tests/fixtures/battleground-hero-motion.html?path=/heroes`);
    await page.waitForSelector('.battleground-hero-card');
    assert.ok(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches), 'desktop test has an actual fine-pointer media state');
    const heroMotion = await page.$eval('.battleground-hero-card', card => {
      const preview = card.querySelector('.battleground-hero-related-card');
      return {
        cardTransition: getComputedStyle(card).transitionProperty,
        previewDuration: preview ? getComputedStyle(preview).transitionDuration : '',
        previewTiming: preview ? getComputedStyle(preview).transitionTimingFunction : '',
      };
    });
    assert.match(heroMotion.cardTransition, /box-shadow/, 'hero tile has a deliberate surface transition');
    assert.ok(parseFloat(heroMotion.previewDuration) >= 0.24 && parseFloat(heroMotion.previewDuration) <= 0.32, 'hero power reveal is gentle but responsive');
    assert.match(heroMotion.previewTiming, /cubic-bezier/, 'hero power reveal uses smooth easing');
    await page.hover('.battleground-hero-card');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.battleground-hero-related-card')).opacity === '1');
    await page.hover('.battleground-hero-related-card');
    assert.equal(await page.$eval('.battleground-hero-related-card', element => getComputedStyle(element).opacity), '1', 'power remains hoverable');
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.battleground-hero-related-card')).opacity === '0');
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
