import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startStorybookStatic } from './helpers/storybookStatic.mjs';

const chromiumPath = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for ModalSurface browser tests');

// The story renders a page root with a card lightbox and two stacked dialogs.
const storybook = await startStorybookStatic();
let browser;
try {
  browser = await launchBrowser({
    executablePath: chromiumPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 700, deviceScaleFactor: 1 });
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.goto(storybook.storyUrl('components-modal-surface--lightbox-and-stacked-dialogs'), { waitUntil: 'networkidle0' });
  await page.waitForSelector('#lightbox-trigger');

  await page.click('#lightbox-trigger');
  await page.waitForSelector('[role="dialog"]');
  const opened = await page.evaluate(() => {
    const surface = document.querySelector('[role="dialog"]');
    const root = document.getElementById('root');
    const style = surface instanceof HTMLElement ? getComputedStyle(surface) : null;
    return {
      portalParent: surface?.parentElement?.tagName,
      rootInert: root?.inert,
      rootAriaHidden: root?.getAttribute('aria-hidden'),
      activeLabel: document.activeElement?.getAttribute('aria-label'),
      activeElement: document.activeElement?.outerHTML,
      bodyOverflow: document.body.style.overflow,
      bodyPosition: document.body.style.position,
      viewportHeight: Number.parseFloat(style?.getPropertyValue('--modal-surface-height') || '0'),
      surfaceHeight: surface?.getBoundingClientRect().height || 0,
    };
  });
  assert.equal(opened.portalParent, 'BODY', 'the modal must use a body portal');
  assert.equal(opened.rootInert, true);
  assert.equal(opened.rootAriaHidden, 'true');
  assert.equal(opened.activeLabel, 'Закрыть', `the close button takes the focus: ${JSON.stringify(opened)}`);
  assert.equal(opened.bodyOverflow, 'hidden');
  assert.equal(opened.bodyPosition, 'fixed');
  assert.ok(opened.viewportHeight > 0 && Math.abs(opened.surfaceHeight - opened.viewportHeight) < 2);
  await page.setViewport({ width: 390, height: 520, deviceScaleFactor: 1 });
  await page.waitForFunction(() => {
    const surface = document.querySelector('[role="dialog"]');
    if (!(surface instanceof HTMLElement)) return false;
    const variable = Number.parseFloat(getComputedStyle(surface).getPropertyValue('--modal-surface-height'));
    return Math.abs(variable - window.visualViewport.height) < 2
      && Math.abs(surface.getBoundingClientRect().height - window.visualViewport.height) < 2;
  });
  await page.setViewport({ width: 390, height: 700, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  assert.deepEqual(await page.evaluate(() => ({
    backdropAnimation: getComputedStyle(document.querySelector('.modal-surface__backdrop')).animationName,
    panelAnimation: getComputedStyle(document.querySelector('.modal-surface__panel')).animationName,
  })), { backdropAnimation: 'none', panelAnimation: 'none' });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

  await page.click('[aria-label="Следующая картинка"]');
  await page.waitForFunction(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return document.getElementById(dialog?.getAttribute('aria-labelledby') ?? '')?.textContent === 'Вторая карта';
  });
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'lightbox-trigger', 'changing slides must not replace the original focus target');
  assert.deepEqual(await page.evaluate(() => ({
    inert: document.getElementById('root')?.inert,
    ariaHidden: document.getElementById('root')?.getAttribute('aria-hidden'),
    overflow: document.body.style.overflow,
    position: document.body.style.position,
  })), { inert: false, ariaHidden: null, overflow: '', position: '' });

  await page.click('#lightbox-trigger');
  await page.keyboard.down('Shift');
  await page.keyboard.press('Tab');
  await page.keyboard.up('Shift');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Следующая картинка');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Закрыть');
  // With the page styles a phone-sized lightbox covers its whole backdrop, so
  // the backdrop is clicked where it is reachable: beside the panel on a wide screen.
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  assert.equal(await page.evaluate(() => document.elementFromPoint(8, 8)?.getAttribute('aria-label')), 'Закрыть просмотр',
    'beside the panel the pointer is on the backdrop');
  await page.mouse.click(8, 8);
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  await page.setViewport({ width: 390, height: 700, deviceScaleFactor: 1 });

  await page.click('#first-trigger');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'first-close');
  await page.click('#nested-trigger');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'second-close');
  assert.deepEqual(await page.evaluate(() => ({
    firstInert: document.querySelector('.harness-modal--first')?.inert,
    firstHidden: document.querySelector('.harness-modal--first')?.getAttribute('aria-hidden'),
    secondInert: document.querySelector('.harness-modal--second')?.inert,
  })), { firstInert: true, firstHidden: 'true', secondInert: false });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.harness-modal--second', { hidden: true });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'nested-trigger');
  assert.ok(await page.$('.harness-modal--first'), 'Escape must close only the top-most surface');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.harness-modal--first', { hidden: true });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'first-trigger');

  await page.click('#first-trigger');
  await page.evaluate(() => {
    const rogue = document.createElement('button');
    rogue.id = 'rogue-focus';
    document.body.appendChild(rogue);
    rogue.focus();
  });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'first-close', 'focus must be redirected into the top-most dialog');
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.getElementById('rogue-focus')?.remove());

  assert.deepEqual(runtimeErrors, []);
  console.log('ModalSurface browser tests passed');
} finally {
  await browser?.close();
  await storybook.close();
}
