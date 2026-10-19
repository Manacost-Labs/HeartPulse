import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startStorybookStatic } from './helpers/storybookStatic.mjs';

test('loading cards and class rows fit their loaded counterparts at public page widths', async () => {
  const storybook = await startStorybookStatic();
  let browser;
  try {
    const executablePath = [process.env.CHROMIUM_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path));
    browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    async function geometry(storyId, selector) {
      await page.goto(storybook.storyUrl(storyId));
      await page.waitForSelector(selector, { visible: true });
      if (storyId === 'meta-chart-loading-geometry--expanded') await page.waitForSelector('.standard-meta-chart__plot', { visible: true });
      if (storyId === 'cards-statistics-history--dense-small-values') await page.waitForSelector('.analytics-chart__plot > svg', { visible: true });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => Promise.all(document.getAnimations()
        .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
        .map(animation => animation.finished.catch(() => {}))));
      await page.$eval(selector, element => element.scrollIntoView({ block: 'center' }));
      await page.mouse.move(0, 0);
      return page.$$eval(selector, elements => elements.slice(0, 2).map(element => {
        const { width, height } = element.getBoundingClientRect();
        const part = selector => element.querySelector(selector)?.getBoundingClientRect().height ?? null;
        return { width, height, heading: part('.article-body-modern h3'),
          media: part('.article-image-shell, .home-latest-article__image'), metadata: part('.article-meta-modern'), votes: part('.article-vote-row') };
      }));
    }
    for (const width of [1350, 1024, 768, 412, 360]) {
      await page.setViewport({ width, height: 940 });
      for (const [name, readyStory, loadingStory, readySelector, loadingSelector] of [
        ['articles', 'articles-measured-loading-geometry--ready', 'articles-measured-loading-geometry--loading', '.article-card-modern', '.articles-grid-modern > .skeleton, .article-card-skeleton'],
        ['deck builder', 'constructed-deckbuilder--empty', 'constructed-deckbuilder--loading', '.hp-builder-card', '.hp-builder-skeletons > div'],
        ['classes', 'arena-classes-data--ready', 'arena-classes-data--loading', '.arena-class-row', '.arena-classes-loading .arena-class-row'],
        ['contests', 'contests-measured-loading-geometry--ready', 'contests-measured-loading-geometry--loading', '.contest-card', '.contest-card--loading'],
        ['archetypes', 'constructed-archetype-catalog-loading--ready', 'constructed-archetype-catalog-loading--loading', '.archetype-row', '.archetypes-loading__row'],
        ['card history', 'cards-statistics-history--dense-small-values', 'cards-statistics-history--loading', '.constructed-card-history__content', '.constructed-card-history__content'],
        ['meta chart', 'meta-chart-loading-geometry--expanded', 'meta-chart-loading-geometry--loading', '.standard-meta-chart__content', '.standard-meta-chart__content'],
      ]) {
        const ready = await geometry(readyStory, readySelector);
        const loading = await geometry(loadingStory, loadingSelector);
        const short = name === 'articles' ? await geometry('articles-measured-loading-geometry--short-headlines', readySelector) : null;
        assert.ok(ready.length > 0 && loading.length >= ready.length, `${name} exposes both states`);
        for (const [index, item] of ready.entries()) {
          assert.ok(Math.abs(item.width - loading[index].width) <= 2, `${name} row ${index} at ${width}px: loading width ${loading[index].width}, loaded width ${item.width}`);
          if (short) {
            const placeholder = loading[index];
            // Headlines vary naturally. Match the fixed card chrome exactly
            // and keep the reserved text between real short and long content.
            for (const part of ['heading', 'media', 'metadata', 'votes']) assert.notEqual(placeholder[part], null, `article skeleton contains ${part}`);
            for (const part of ['media', 'metadata', 'votes']) assert.ok(Math.abs(item[part] - placeholder[part]) <= 2, `article ${part} at ${width}px matches content`);
            assert.ok(Math.abs((item.height - item.heading) - (placeholder.height - placeholder.heading)) <= 2, `article chrome at ${width}px matches content`);
            assert.ok(placeholder.height >= short[index].height - 2 && placeholder.height <= item.height + 2, `article at ${width}px reserves a real text-height range`);
          } else if (name === 'archetypes' && width <= 820) {
            const heights = ready.map(row => row.height);
            assert.ok(loading[index].height >= Math.min(...heights) - 2 && loading[index].height <= Math.max(...heights) + 2,
              `archetype at ${width}px reserves a real short/long-title row`);
          } else assert.ok(Math.abs(item.height - loading[index].height) <= 4, `${name} row ${index} at ${width}px: loading height ${loading[index].height}, loaded height ${item.height}`);
        }
      }
      for (const [name, readyStory, shortStory, loadingStory, selector] of [
        ['cosmetics', 'cosmetics-measured-loading-geometry--ready', 'cosmetics-measured-loading-geometry--short-names', 'cosmetics-measured-loading-geometry--loading', '.cosmetics-card'],
        ['guides', 'guides-measured-loading-geometry--ready', 'guides-measured-loading-geometry--short-text', 'guides-measured-loading-geometry--loading', '.guide-archive-card'],
        ['gallery', 'gallery-measured-loading-geometry--long-text', 'gallery-measured-loading-geometry--ready', 'gallery-measured-loading-geometry--loading', '.gallery-card'],
        ['matchups', 'meta-matchup-matrix--populated-overview', 'meta-matchup-matrix--overview', 'meta-matchup-matrix--loading', '.standard-matchups__picker'],
        ['home articles', 'home-measured-article-loading--long-text', 'home-measured-article-loading--ready', 'home-measured-article-loading--loading', '.home-latest-article'],
      ]) {
        const ready = await geometry(readyStory, selector);
        const short = await geometry(shortStory, selector);
        const loading = await geometry(loadingStory, selector);
        for (const [index, item] of ready.entries()) {
          assert.ok(Math.abs(item.width - loading[index].width) <= 2, `${name} card width at ${width}px`);
          if (name === 'home articles') {
            assert.notEqual(loading[index].media, null, 'home loading cards reserve the real cover');
            assert.ok(Math.abs(item.media - loading[index].media) <= 2, `home cover at ${width}px`);
          }
          assert.ok(loading[index].height >= short[index].height - 2 && loading[index].height <= item.height + 2,
            `${name} card at ${width}px: skeleton ${loading[index].height}, real text range ${short[index].height}–${item.height}`);
        }
      }
    }
  } finally {
    await browser?.close();
    await storybook.close();
  }
});
