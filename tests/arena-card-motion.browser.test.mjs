import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { startStorybookStatic } from './helpers/storybookStatic.mjs';

const chromiumPath = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].find(candidate => candidate && existsSync(candidate));
assert.ok(chromiumPath, 'Chromium/Chrome executable is required for Arena card-motion browser tests');
// The story shows three cards, a two-class chart and a Tailwind utility probe.
const storybook = await startStorybookStatic();
const storyUrl = storybook.storyUrl('arena-hscard-geometry--cards-and-class-chart');

async function assertStableGeometryAndChart(page, width) {
  await page.setViewport({ width, height: 800, deviceScaleFactor: 1 });
  await page.goto(storyUrl, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.arena-class-meter-label');
  const immediate = await page.evaluate(() => {
    const label = document.querySelector('.arena-class-meter-label');
    const fill = document.querySelector('.arena-class-meter-fill');
    const utilityProbe = document.querySelector('.arena-motion-tailwind-probe');
    const cardFrame = document.querySelector('.hs-tier-card-inner');
    return {
      labelText: label?.textContent,
      labelOpacity: label ? getComputedStyle(label).opacity : '',
      labelBackground: label ? getComputedStyle(label).backgroundColor : '',
      fillTransition: fill ? getComputedStyle(fill).transitionProperty : '',
      fillDuration: fill ? getComputedStyle(fill).transitionDuration : '',
      fillDelays: [...document.querySelectorAll('.arena-class-meter-fill')].map(element => getComputedStyle(element).transitionDelay),
      cardTransition: cardFrame ? getComputedStyle(cardFrame).transitionProperty : '',
      cardDuration: cardFrame ? getComputedStyle(cardFrame).transitionDuration : '',
      cardTiming: cardFrame ? getComputedStyle(cardFrame).transitionTimingFunction : '',
      utilityPadding: utilityProbe ? getComputedStyle(utilityProbe).paddingTop : '',
    };
  });
  assert.equal(immediate.labelText, '54.2%', `${width}px label is readable from the first frame`);
  assert.equal(immediate.labelOpacity, '1', `${width}px label is never hidden during fill entrance`);
  assert.notEqual(immediate.labelBackground, 'rgba(0, 0, 0, 0)', `${width}px label has a stable contrast backing`);
  assert.ok(!immediate.fillTransition.includes('width'), `${width}px fill does not transition width`);
  assert.ok(parseFloat(immediate.fillDuration) <= 0.4, `${width}px fill entrance completes within 400ms`);
  assert.ok(immediate.fillDelays.length >= 2 && parseFloat(immediate.fillDelays[1]) > parseFloat(immediate.fillDelays[0]), `${width}px chart bars enter with a subtle stagger`);
  assert.equal(immediate.cardTransition, 'transform', `${width}px card hover animates only the compositor-friendly transform`);
  assert.ok(parseFloat(immediate.cardDuration) >= 0.24 && parseFloat(immediate.cardDuration) <= 0.32, `${width}px card hover is soft without feeling delayed`);
  assert.match(immediate.cardTiming, /cubic-bezier/, `${width}px card hover uses a smooth easing curve`);
  assert.equal(immediate.utilityPadding, '12px', `${width}px Tailwind p-3 survives DeferredRoutes CSS loading`);
  const cards = await page.$$eval('.hs-tier-card', nodes => nodes.map(card => {
    const outer = card.getBoundingClientRect();
    const inner = card.querySelector('.hs-tier-card-inner')?.getBoundingClientRect();
    return { width: outer.width, height: outer.height, innerWidth: inner?.width, innerHeight: inner?.height };
  }));
  assert.equal(cards.length, 3, `${width}px fixture covers portrait, wide, and fallback cards`);
  for (const card of cards) {
    assert.ok(Math.abs(card.width - cards[0].width) < 1, `${width}px card containers share width`);
    assert.ok(Math.abs(card.height - cards[0].height) < 1, `${width}px card containers share height`);
    assert.ok(Math.abs(card.innerWidth - card.width) < 1, `${width}px card frame fills container width`);
    assert.ok(Math.abs(card.innerHeight - card.height) < 1, `${width}px card frame fills container height`);
  }
  for (const row of await page.$$('.arena-class-row')) {
    await row.hover();
    assert.equal(await row.evaluate(node => getComputedStyle(node).transform), 'none', `${width}px row hover must not move the ranking`);
  }
}

let browser;
try {
  browser = await puppeteer.launch({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await assertStableGeometryAndChart(page, 900);
  await assertStableGeometryAndChart(page, 390);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(storyUrl, { waitUntil: 'networkidle0' });
  await page.hover('.hs-tier-card');
  const reducedMotion = await page.evaluate(() => ({ cardTransform: getComputedStyle(document.querySelector('.hs-tier-card-inner')).transform, cardDuration: getComputedStyle(document.querySelector('.hs-tier-card-inner')).transitionDuration, fillDuration: getComputedStyle(document.querySelector('.arena-class-meter-fill')).transitionDuration }));
  assert.equal(reducedMotion.cardTransform, 'none', 'reduced-motion cards stay static on hover');
  assert.ok(parseFloat(reducedMotion.cardDuration) <= 0.001, 'reduced-motion cards do not animate perceptibly');
  assert.ok(parseFloat(reducedMotion.fillDuration) <= 0.001, 'reduced-motion chart fills do not animate perceptibly');
  const mediaClient = await page.createCDPSession();
  await mediaClient.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
  assert.ok(await page.evaluate(() => matchMedia('(forced-colors: active)').matches));
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
  const contrast = await page.evaluate(async () => {
    const result = await window.axe.run({ include: [['.arena-class-meter-label']] }, { runOnly: ['color-contrast'] });
    return result.violations.map(violation => ({ id: violation.id, impact: violation.impact }));
  });
  assert.deepEqual(contrast, [], 'class percentages remain readable in forced colors');
  assert.deepEqual(runtimeErrors, []);
  console.log('Arena card-motion browser tests passed');
} finally {
  await browser?.close();
  await storybook.close();
}
