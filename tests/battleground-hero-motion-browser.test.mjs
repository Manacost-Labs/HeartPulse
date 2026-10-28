import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startStorybookStatic } from './helpers/storybookStatic.mjs';

const axe = readFileSync(new URL(import.meta.resolve('axe-core')), 'utf8');

test('hero detail keeps buddies aligned and statistics navigable without a chart wall', async () => {
  // The stories render the heroes route on fixture data: a hero with a buddy
  // pair, the hero list and a hero without statistics.
  const storybook = await startStorybookStatic();
  const story = name => storybook.storyUrl(`battlegrounds-hero-detail--navigable-${name}`);
  let browser;
  try {
    const executablePath = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome'].find(path => path && existsSync(path));
    browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(story('detail'));
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
    const buddyImageSources = await page.$$eval(
      '[data-tour-id="bg-hero-detail-media"] button .bg-hero-action-card__image',
      images => images.slice(1).map(image => image.getAttribute('src')),
    );
    assert.notEqual(buddyImageSources[0], buddyImageSources[1], 'normal and golden buddies render distinct card versions');
    assert.match(buddyImageSources[1] || '', /%23d9ab49/, 'golden buddy prefers its full golden card over the nested portrait');
    await page.waitForSelector('[role="tablist"][aria-label="Статистика героя"]', { timeout: 3000 });
    const visiblePanels = () => page.$$eval('[role="tabpanel"]', panels => panels.filter(panel => !panel.hidden).length);
    assert.equal(await visiblePanels(), 1);
    const statisticsLayout = await page.$eval('.bg-hero-statistics', element => {
      const chart = element.querySelector('.analytics-chart');
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
        // Layout rows, not painted ones: a hovered card lifts by its hover transform.
        const mediaRows = await page.$$eval('[data-tour-id="bg-hero-detail-media"] button', buttons => buttons.map(button => button.offsetTop));
        assert.equal(new Set(mediaRows).size, 1, 'wide screens keep all three media cards in one compact row');
      }
    }
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(story('list'));
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
    assert.ok(parseFloat(heroMotion.previewDuration) >= 0.38 && parseFloat(heroMotion.previewDuration) <= 0.44, 'hero power reveal gives the card enough time to settle');
    assert.match(heroMotion.previewTiming, /cubic-bezier/, 'hero power reveal uses smooth easing');
    await page.hover('.battleground-hero-card');
    const previewDelay = await page.$eval('.battleground-hero-related-card', element => parseFloat(getComputedStyle(element).transitionDelay));
    assert.ok(previewDelay >= 0.05 && previewDelay <= 0.09, 'pointer hover gives the hero portrait a brief lead before revealing its power');
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
    await page.goto(story('empty-hero'));
    await page.waitForSelector('[role="tab"]');
    for (const label of ['Обзор', 'Сила героя', 'Таверна', 'Составы']) {
      await page.click(`[role="tab"][data-stat-tab="${label}"]`);
      assert.match(await page.$eval('[role="tabpanel"]:not([hidden])', panel => panel.textContent), /Для этого раздела пока нет статистики/, `empty ${label} is explained`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await storybook.close();
  }
});

test('hero ledger keeps SVG tier ranks, sorting and readable cells on desktop and mobile', async () => {
  const runtime = await startStorybookStatic();
  const browser = await launchBrowser({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewport({ width, height: 900 });
      await page.goto(runtime.storyUrl('battlegrounds-hero-ledger--tier-groups'), { waitUntil: 'networkidle0' });
      await page.waitForSelector('.bg-hero-ledger__tier-mark img');
      await page.evaluate(axe);
      const state = await page.evaluate(async () => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        ranks: [...document.querySelectorAll('.bg-hero-ledger__tier-mark img')].map(image => ({ alt: image.alt, loaded: image.complete && image.naturalWidth > 0 })),
        cells: [...document.querySelectorAll('.bg-hero-ledger__row')].map(row => row.querySelectorAll('[role=cell]').length),
        violations: (await axe.run(document.querySelector('.bg-hero-ledger'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => item.id),
      }));
      assert.equal(state.overflow, false, `${width}px table overflow`);
      assert.deepEqual(state.ranks.map(rank => rank.alt), ['Тир S', 'Тир A', 'Тир B', 'Тир C', 'Тир D']);
      assert.ok(state.ranks.every(rank => rank.loaded));
      assert.ok(state.cells.every(count => count === 6));
      assert.deepEqual(state.violations, [], `${width}px table accessibility`);
      const sort = width <= 1120 ? '.bg-hero-ledger__mobile-sort' : '.bg-hero-ledger__header';
      await page.click(`${sort} button::-p-text(${width <= 1120 ? 'Место' : 'Среднее место'})`);
      await page.waitForSelector('.bg-hero-ledger__row--flat');
      assert.equal(await page.$$eval('.bg-hero-ledger__row--flat', rows => rows.length), 5);
      assert.equal(await page.$eval('.bg-hero-ledger__row--flat .bg-hero-ledger__tier-emblem img', image => image.alt), 'Тир S');
      await page.click(`${sort} button::-p-text(${width <= 1120 ? 'Место' : 'Среднее место'})`);
      await page.waitForFunction(() => document.querySelector('.bg-hero-ledger__row--flat .bg-hero-ledger__tier-emblem img')?.alt === 'Тир D');
    }
    assert.deepEqual(errors, [], 'table stories and sorting produce no console errors');
  } finally { await browser.close(); await runtime.close(); }
});

test('hero filters preserve Top 1% errors and discard late responses after a fast switch', async () => {
  const runtime = await startStorybookStatic();
  const browser = await launchBrowser({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    await page.goto(runtime.storyUrl('battlegrounds-hero-tier-list--live-rankings'));
    await page.waitForSelector('.bg-heroes-page a[href="/heroes/61488/"]');
    await page.evaluate(() => {
      const originalFetch = globalThis.fetch;
      globalThis.heroFilterRequests = [];
      globalThis.fetch = async (input, init) => {
        const url = new URL(String(input), location.origin);
        if (url.pathname === '/bg-legacy/tier-data.js') {
          globalThis.heroFilterRequests.push('snapshot');
          throw new Error('Unfiltered snapshot must not be requested');
        }
        if (url.pathname !== '/api/bg/heroes') return originalFetch(input, init);
        const mmr = url.searchParams.get('mmr');
        globalThis.heroFilterRequests.push(mmr);
        if (mmr === 'TOP_1_PERCENT') return Response.json({ ok: false, error: 'Нет данных для Топ 1% (проверка)' }, { status: 503 });
        if (mmr === 'TOP_20_PERCENT') await new Promise(resolve => setTimeout(resolve, 300));
        return Response.json({ ok: true, fetched_at: '2026-10-12T12:00:00Z', heroes: [{
          dbfId: 61488, hero: 'Алекстраза', tier: 'A', pick_rate: '12%',
          avg_placement: mmr === 'TOP_5_PERCENT' ? 3.51 : 4.91,
        }] });
      };
    });
    await page.click('button::-p-text(Топ 1%)');
    await page.waitForFunction(() => document.querySelector('.bg-heroes-page [role=alert]')?.textContent.includes('Нет данных для Топ 1%'));
    assert.equal(await page.$$eval('.bg-heroes-page a[href="/heroes/61488/"]', links => links.length), 0);
    await page.click('button::-p-text(Топ 20%)');
    await page.click('button::-p-text(Топ 5%)');
    await page.waitForFunction(() => document.querySelector('.bg-heroes-page').innerText.includes('3,51'));
    // Wait beyond the deliberately delayed Top 20% response.
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.ok(await page.$eval('.bg-heroes-page', element => element.innerText.includes('3,51') && !element.innerText.includes('4,91')));
    assert.equal(await page.$eval('button::-p-text(Топ 5%)', button => button.getAttribute('aria-pressed')), 'true');
    assert.ok(new URL(page.url()).searchParams.get('mmr') === 'TOP_5_PERCENT');
    assert.deepEqual(await page.evaluate(() => globalThis.heroFilterRequests), ['TOP_1_PERCENT', 'TOP_20_PERCENT', 'TOP_5_PERCENT']);
    assert.deepEqual(consoleErrors, [], 'the live-ranking story and rapid switches produce no console errors');
  } finally { await browser.close(); await runtime.close(); }
});
