import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startStorybookStatic } from './helpers/storybookStatic.mjs';

// Archetype detail sections and the Vicious Gold dashboard: each placeholder
// is compared with the loaded view in the same container at the public
// widths. Fixed structures agree within 2 px in width and 4 px in height; a
// Power Tier card's name wraps with its data, so its placeholder must stay
// within the loaded cards' short/long range.
const PAIRS = [
  ['archetype builds', 'archetype-detail-measured-loading-geometry--ready', 'archetype-detail-measured-loading-geometry--builds-loading',
    ['.archetype-main-build', '.archetype-main-build > header', '.archetype-main-build .archetype-deck-card', '.archetype-main-build > footer']],
  ['archetype history', 'archetype-detail-measured-loading-geometry--ready', 'archetype-detail-measured-loading-geometry--history-loading',
    ['.archetype-history', '.archetype-history .analytics-chart']],
  // The analysis placeholder arrives with the lazy analysis chunk and uses its classes. The mulligan
  // panel is the fixture's 18 cards (a first page of 15 and the «show all» control).
  ['archetype analysis', 'archetype-detail-measured-loading-geometry--ready', 'archetype-detail-measured-loading-geometry--analysis-loading',
    ['.constructed-analysis-panel', '.constructed-matchup-ledger', '.constructed-matchup-ledger li', '.constructed-card-stats__mobile-sort']],
  ['vicious gold', 'vicious-gold-measured-loading-geometry--ready', 'vicious-gold-measured-loading-geometry--loading',
    ['.vsgold__mobile-nav', '.vsgold__classes', '.vsgold__deck-row', '.vsgold__power-heading', '.vsgold__rank-tabs', '.vsgold__tier-band > header']],
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
        await open(readyStory, name === 'vicious gold' ? '.vsgold__tier-card' : '.constructed-matchup-ledger li');
        const ready = [];
        for (const selector of selectors) ready.push(await boxes(Array.isArray(selector) ? selector[0] : selector));
        const readyTiers = name === 'vicious gold' ? await page.$$eval('.vsgold__tier-card', async cards => {
          const heights = [];
          for (const card of cards) {
            card.scrollIntoView({ block: 'center' });
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            heights.push(card.getBoundingClientRect().height);
          }
          return heights;
        }) : null;
        if (name === 'archetype analysis' && width <= 820) {
          // The analysis stylesheet keeps its cascade place: its phone sort controls stay at their own size.
          assert.equal(await page.$eval('.constructed-card-stats__mobile-sort button', button => getComputedStyle(button).fontSize), '9.92px',
            `loaded mulligan sort controls at ${width}px keep the analysis stylesheet's size`);
        }
        await open(loadingStory, name === 'archetype analysis' ? '.loading-surface .constructed-matchup-ledger li' : '[role="status"]');
        for (const [index, pair] of selectors.entries()) {
          const selector = Array.isArray(pair) ? pair[0] : pair;
          const loading = await boxes(`.loading-surface ${Array.isArray(pair) ? pair[1] : pair}`);
          // Band and row counts are data: compare the placeholders that stand for loaded ones.
          assert.ok(loading.length > 0 && ready[index].length > 0, `${name} ${selector} at ${width}px: both states expose it`);
          for (const [item, box] of ready[index].slice(0, loading.length).entries()) {
            assert.ok(Math.abs(box.width - loading[item].width) <= 2, `${name} ${selector} #${item} at ${width}px: width ${loading[item].width} vs ${box.width}`);
            assert.ok(Math.abs(box.height - loading[item].height) <= 4, `${name} ${selector} #${item} at ${width}px: height ${loading[item].height} vs ${box.height}`);
          }
        }
        if (readyTiers) {
          const [placeholder] = await boxes('.loading-surface .vsgold__tier-card');
          const low = Math.min(...readyTiers) - 4;
          const high = Math.max(...readyTiers) + 4;
          assert.ok(placeholder.height >= low && placeholder.height <= high,
            `vicious gold tier card at ${width}px: placeholder ${placeholder.height}, loaded ${low + 4}–${high - 4}`);
        }
      }
    }
  } finally {
    await browser?.close();
    await storybook.close();
  }
});
