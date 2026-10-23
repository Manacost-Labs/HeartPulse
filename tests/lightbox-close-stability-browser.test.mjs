import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test, { after, before } from 'node:test';
import puppeteer from 'puppeteer';
import { openStory, startStorybookStatic } from './helpers/storybookStatic.mjs';

const chromiumPath = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for the lightbox close test');

// Closing a lightbox flickered on desktop: the page scroll lock hid the classic
// scrollbar, so the page reflowed 15 px wider under the dialog and jumped back
// on the frame it closed, and the sticky search header, carried away with the
// fixed body, popped back in. The hero media lightbox also vanished in one
// frame instead of fading out. Every frame from the press to well after the
// close is sampled here; Chrome is launched with real (not hidden) scrollbars.
let storybook;
let browser;

before(async () => {
  storybook = await startStorybookStatic();
  browser = await puppeteer.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    ignoreDefaultArgs: ['--hide-scrollbars'],
  });
});

after(async () => {
  await browser?.close();
  await storybook?.close();
});

/** Records one sample per animation frame until `window.__stopFrames()` resolves with them. */
function recordFrames() {
  const frames = [];
  let running = true;
  const sample = () => {
    const header = document.querySelector('.global-utility-header');
    const thumb = document.querySelector('[aria-label="Открыть картинку"]');
    const backdrop = document.querySelector('.lightbox-zoom-story .modal-surface__backdrop');
    frames.push({
      bodyWidth: document.body.getBoundingClientRect().width,
      headerTop: header?.getBoundingClientRect().top ?? null,
      thumbTop: thumb?.getBoundingClientRect().top ?? null,
      thumbLeft: thumb?.getBoundingClientRect().left ?? null,
      open: Boolean(document.querySelector('.lightbox-zoom-story')),
      backdropOpacity: backdrop ? Number(getComputedStyle(backdrop).opacity) : null,
    });
    if (running) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  window.__stopFrames = () => new Promise(resolve => requestAnimationFrame(() => { running = false; resolve(frames); }));
}

async function closeOnScrolledPage(viewport) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport(viewport);
  await openStory(page, storybook.storyUrl('components-lightbox-zoom--on-a-scrolled-page'));
  await page.waitForSelector('[aria-label="Открыть картинку"]');
  await page.evaluate(() => window.scrollTo(0, 900));
  const baseline = await page.evaluate(() => ({
    scrollY: window.scrollY,
    viewportWidth: document.documentElement.clientWidth,
    bodyWidth: document.body.getBoundingClientRect().width,
    headerTop: document.querySelector('.global-utility-header').getBoundingClientRect().top,
    thumbTop: document.querySelector('[aria-label="Открыть картинку"]').getBoundingClientRect().top,
    thumbLeft: document.querySelector('[aria-label="Открыть картинку"]').getBoundingClientRect().left,
  }));
  await page.evaluate(recordFrames);
  await page.click('[aria-label="Открыть картинку"]');
  await page.waitForSelector('.lightbox-zoom-story');
  await page.waitForFunction(() => !document.querySelector('.lightbox-flight'));
  const openFrames = await page.evaluate(() => window.__stopFrames().then(frames => frames.length));
  await page.evaluate(recordFrames);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.lightbox-zoom-story'));
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 150)));
  const frames = await page.evaluate(() => window.__stopFrames());
  const afterClose = await page.evaluate(() => ({ scrollY: window.scrollY, viewportWidth: document.documentElement.clientWidth }));
  await page.close();
  return { baseline, openFrames, frames, afterClose, errors };
}

for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ['phone', { width: 412, height: 915, deviceScaleFactor: 1, isMobile: true, hasTouch: true }],
]) {
  test(`closing a lightbox on a scrolled page moves nothing on the ${name} page`, async () => {
    const { baseline, openFrames, frames, afterClose, errors } = await closeOnScrolledPage(viewport);
    assert.deepEqual(errors, []);
    if (name === 'desktop') {
      assert.ok(baseline.viewportWidth < viewport.width, 'the desktop page must show a classic scrollbar for this check');
      assert.equal(baseline.headerTop, 0, 'the sticky search header starts in view');
    }
    assert.ok(openFrames > 0 && frames.length > 3, `too few frames sampled: ${openFrames}, ${frames.length}`);
    for (const [index, frame] of frames.entries()) {
      const at = `close frame ${index}: ${JSON.stringify(frame)}`;
      assert.equal(frame.bodyWidth, baseline.bodyWidth, `the page reflowed; ${at}`);
      assert.equal(frame.headerTop, baseline.headerTop, `the header moved; ${at}`);
      assert.ok(Math.abs(frame.thumbTop - baseline.thumbTop) < 1 && Math.abs(frame.thumbLeft - baseline.thumbLeft) < 1,
        `the page content jumped; ${at}`);
    }
    const fading = frames.filter(frame => frame.open).map(frame => frame.backdropOpacity);
    assert.ok(fading.every((opacity, index) => index === 0 || opacity <= fading[index - 1] + 0.001),
      `the backdrop fade must only fall: ${fading.join(', ')}`);
    const closedAt = frames.findIndex(frame => !frame.open);
    assert.ok(closedAt > 0 && frames.slice(closedAt).every(frame => !frame.open), 'the lightbox must not come back');
    assert.equal(afterClose.scrollY, baseline.scrollY, 'the reading position is kept');
    assert.equal(afterClose.viewportWidth, baseline.viewportWidth);
  });
}

/**
 * The opacity of the hero media lightbox on every frame after Escape, until it
 * has been gone a while. A busy runner renders few, late frames: the CPU is
 * slowed down for the close, as on CI, where a close timed from the key press
 * unmounted the lightbox while it was still a fifth visible.
 */
async function heroLightboxClose({ reducedMotion }) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await openStory(page, storybook.storyUrl('battlegrounds-hero-detail--navigable-detail'));
  // The detail renders again once its statistics arrive; press the settled card.
  await page.waitForSelector('[role="tablist"][aria-label="Статистика героя"]');
  await page.waitForSelector('.bg-hero-action-card', { visible: true });
  await page.click('.bg-hero-action-card');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.bg-hero-media-lightbox')).opacity === '1');
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  const opacities = await page.evaluate(() => new Promise(resolve => {
    const samples = [];
    let goneFor = 0;
    const sample = () => {
      const lightbox = document.querySelector('.bg-hero-media-lightbox');
      samples.push(lightbox ? Number(getComputedStyle(lightbox).opacity) : null);
      goneFor = lightbox ? 0 : goneFor + 1;
      if (goneFor < 5 && samples.length < 300) requestAnimationFrame(sample);
      else resolve(samples);
    };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    requestAnimationFrame(sample);
  }));
  const bodyLocked = await page.evaluate(() => document.body.style.position);
  await page.close();
  return { opacities, bodyLocked };
}

test('the hero media lightbox fades out before it unmounts', async () => {
  const { opacities, bodyLocked } = await heroLightboxClose({ reducedMotion: false });
  const fading = opacities.filter(opacity => opacity !== null && opacity > 0.02 && opacity < 0.98);
  assert.ok(fading.length >= 1, `the lightbox must fade out instead of vanishing: ${opacities.join(', ')}`);
  const shown = opacities.filter(opacity => opacity !== null);
  assert.ok(shown.every((opacity, index) => index === 0 || opacity <= shown[index - 1] + 0.001), `the fade must only fall: ${shown.join(', ')}`);
  assert.ok(shown.at(-1) < 0.05, `the lightbox unmounts once faded out: ${shown.join(', ')}`);
  assert.equal(bodyLocked, '', 'the page scroll lock is released');
});

test('under reduced motion the hero media lightbox closes at once', async () => {
  const { opacities } = await heroLightboxClose({ reducedMotion: true });
  const closedAt = opacities.indexOf(null);
  assert.ok(closedAt >= 0 && closedAt <= 3, `the lightbox must close within a few frames: ${opacities.join(', ')}`);
});
