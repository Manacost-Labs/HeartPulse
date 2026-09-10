import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer';

const storybookUrl = process.env.ARENA_STORYBOOK_URL;
const chromiumPath = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));

if (!storybookUrl) {
  throw new Error('Set ARENA_STORYBOOK_URL to the isolated Storybook server before running this browser test.');
}
assert.ok(chromiumPath, 'Chromium/Chrome executable is required for Arena card-motion browser tests');

const browser = await puppeteer.launch({
  headless: true,
  executablePath: chromiumPath,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 800, deviceScaleFactor: 1 });

  await page.goto(`${storybookUrl}/iframe.html?id=arena-hscard-geometry--disparate-sources-and-fallback`, { waitUntil: 'networkidle0' });
  const cards = await page.evaluate(() => [...document.querySelectorAll('.hs-tier-card')].map(card => {
    const rect = card.getBoundingClientRect();
    const inner = card.querySelector('.hs-tier-card-inner');
    return {
      width: rect.width,
      height: rect.height,
      innerWidth: inner?.getBoundingClientRect().width,
      innerHeight: inner?.getBoundingClientRect().height,
    };
  }));
  assert.equal(cards.length, 3, 'the story must cover portrait, wide, and fallback cards');
  for (const card of cards) {
    assert.ok(Math.abs(card.width - cards[0].width) < 1, 'all card containers have the same width');
    assert.ok(Math.abs(card.height - cards[0].height) < 1, 'all card containers have the same height');
    assert.ok(Math.abs(card.innerWidth - card.width) < 1, 'the visible card frame fills its stable container');
    assert.ok(Math.abs(card.innerHeight - card.height) < 1, 'the visible card frame owns its stable height');
  }

  await page.goto(`${storybookUrl}/iframe.html?id=arena-hscard-geometry--stable-winrate-label`, { waitUntil: 'networkidle0' });
  await new Promise(resolve => setTimeout(resolve, 450));
  const chart = await page.evaluate(() => {
    const row = document.querySelector('.arena-class-row');
    const fill = document.querySelector('.arena-class-meter-fill');
    const label = document.querySelector('.arena-class-meter-label');
    return {
      rowAnimation: getComputedStyle(row).animationName,
      fillWidth: getComputedStyle(fill).width,
      fillTransform: getComputedStyle(fill).transform,
      labelText: label?.textContent,
      labelTransform: getComputedStyle(label).transform,
      labelOpacity: getComputedStyle(label).opacity,
      fillTransition: getComputedStyle(fill).transitionProperty,
      fillDuration: getComputedStyle(fill).transitionDuration,
    };
  });
  assert.equal(chart.rowAnimation, 'none', 'class rows must not enter with a staggered motion');
  assert.equal(chart.labelText, '54.2%', 'the percent is readable throughout the fill entrance');
  assert.equal(chart.labelOpacity, '1', 'the percent is never hidden during the fill entrance');
  assert.equal(chart.labelTransform, 'none', 'the percent label is outside the scaled fill');
  assert.notEqual(chart.fillTransform, 'none', 'the fill is animated with a transform instead of width');
  assert.ok(!chart.fillTransition.includes('width'), 'the fill must not transition width');
  assert.ok(parseFloat(chart.fillDuration) <= 0.4, 'the fill entrance must complete within 400ms');

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(`${storybookUrl}/iframe.html?id=arena-hscard-geometry--disparate-sources-and-fallback`, { waitUntil: 'networkidle0' });
  await page.hover('.hs-tier-card');
  const reducedMotion = await page.$eval('.hs-tier-card-inner', card => ({
    transform: getComputedStyle(card).transform,
    transitionDuration: getComputedStyle(card).transitionDuration,
  }));
  assert.equal(reducedMotion.transform, 'none', 'reduced-motion cards stay static on hover');
  assert.ok(parseFloat(reducedMotion.transitionDuration) <= 0.001, 'reduced-motion cards do not animate perceptibly');

  await page.goto(`${storybookUrl}/iframe.html?id=arena-hscard-geometry--stable-winrate-label`, { waitUntil: 'networkidle0' });
  const reducedChartDuration = await page.$eval('.arena-class-meter-fill', fill => getComputedStyle(fill).transitionDuration);
  assert.ok(parseFloat(reducedChartDuration) <= 0.001, 'reduced-motion chart fills do not animate perceptibly');
} finally {
  await browser.close();
}
