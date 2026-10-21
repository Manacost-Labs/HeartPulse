import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startStorybookStatic } from './helpers/storybookStatic.mjs';

// Archetype detail sections and the Vicious Gold report: each placeholder is
// compared with the loaded view in the same container at the public widths.
// Fixed structures agree within 2 px in width and 4 px in height; Power Tier
// rows keep one-line names, so they are fixed structures too.
const PAIRS = [
  ['archetype builds', 'archetype-detail-measured-loading-geometry--ready', 'archetype-detail-measured-loading-geometry--builds-loading',
    ['.archetype-builds', '.archetype-builds > :first-child', '.archetype-builds .archetype-deck-card', '.archetype-builds__more']],
  ['archetype history', 'archetype-detail-measured-loading-geometry--ready', 'archetype-detail-measured-loading-geometry--history-loading',
    ['.archetype-history', '.archetype-history .analytics-chart']],
  // The analysis placeholder arrives with the lazy analysis chunk and uses its classes. The mulligan
  // panel is the fixture's 18 cards (a first page of 15 and the «show all» control).
  ['archetype analysis', 'archetype-detail-measured-loading-geometry--ready', 'archetype-detail-measured-loading-geometry--analysis-loading',
    ['.constructed-analysis-panel', '.constructed-matchup-ledger', '.constructed-matchup-ledger li', '.constructed-card-stats__toolbar',
      '.constructed-card-stats__table tbody tr', '.constructed-card-stats__list > li']],
  ['vicious gold', 'vicious-gold-measured-loading-geometry--ready', 'vicious-gold-measured-loading-geometry--loading',
    ['.vsgold-report', '.vsgold-report__kpis', '.vsgold-power .vsgold-section__head', '.vsgold-power__controls', '.vsgold-tier__head', '.vsgold-power-row',
      // The banner's totals: label and value placeholders in the same cells.
      ['.traditional-mode-banner__summary > div', '.traditional-mode-banner__summary > div']]],
];

test('archetype and Vicious Gold placeholders fit their loaded views at public widths', { timeout: 600_000 }, async () => {
  const storybook = await startStorybookStatic();
  let browser;
  try {
    const executablePath = [process.env.CHROMIUM_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path));
    browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    async function open(storyId, readySelector) {
      // One repeat under the same conditions: a story chunk can fail to load once on a busy host.
      for (let attempt = 1; ; attempt += 1) {
        await page.goto(storybook.storyUrl(storyId), { waitUntil: 'networkidle0' });
        const loaded = await page.waitForSelector(readySelector, { timeout: 15_000 }).then(() => true, () => false);
        if (loaded) break;
        if (attempt === 2) throw new Error(`${storyId} at ${page.viewport()?.width}px did not render: ${await page.evaluate(() => document.body.innerText.slice(0, 200))}`);
      }
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
    }
    /** Boxes of the first two matches; each is scrolled into view, so content-visibility lays it out. */
    function boxes(selector) {
      return page.$$eval(selector, async elements => {
        const result = [];
        for (const element of elements.slice(0, 2)) {
          element.scrollIntoView({ block: 'center' });
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const { width, height } = element.getBoundingClientRect();
          result.push({ width, height });
        }
        return result;
      });
    }
    for (const width of [1350, 1024, 768, 412, 360]) {
      await page.setViewport({ width, height: 940 });
      for (const [name, readyStory, loadingStory, selectors] of PAIRS) {
        await open(readyStory, name === 'vicious gold' ? '.vsgold-tier .arena-tier-badge' : '.constructed-matchup-ledger li');
        const ready = [];
        for (const selector of selectors) ready.push(await boxes(Array.isArray(selector) ? selector[0] : selector));
        await open(loadingStory, name === 'archetype analysis' ? '.loading-surface .constructed-matchup-ledger li' : '[role="status"]');
        for (const [index, pair] of selectors.entries()) {
          const selector = Array.isArray(pair) ? pair[0] : pair;
          // A [ready, loading] pair names both selectors in full; a plain one is looked up inside the placeholder.
          const loading = await boxes(Array.isArray(pair) ? pair[1] : `.loading-surface ${pair}`);
          // Band and row counts are data: compare the placeholders that stand for loaded ones.
          assert.ok(loading.length > 0 && ready[index].length > 0, `${name} ${selector} at ${width}px: both states expose it`);
          for (const [item, box] of ready[index].slice(0, loading.length).entries()) {
            assert.ok(Math.abs(box.width - loading[item].width) <= 2, `${name} ${selector} #${item} at ${width}px: width ${loading[item].width} vs ${box.width}`);
            assert.ok(Math.abs(box.height - loading[item].height) <= 4, `${name} ${selector} #${item} at ${width}px: height ${loading[item].height} vs ${box.height}`);
          }
        }
      }
    }
  } finally {
    await browser?.close();
    await storybook.close();
  }
});
