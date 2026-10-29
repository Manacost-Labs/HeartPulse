import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test, { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';
import { startStorybookStatic } from './helpers/storybookStatic.mjs';

const selector = '.traditional-mode-banner, .constructed-cards__header, .section-banner-modern';
test('traditional and Arena headers share geometry without clipping or reduced-motion animation', async () => {
  // The story renders a page header chosen by its `index` argument.
  const storybook = await startStorybookStatic();
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewport({ width, height: 1000 });
      const dimensions = [];
      for (let index = 0; index < 12; index++) {
        await page.goto(storybook.storyUrl('page-headers-consistency--meta-overview', `index:${index}`));
        await page.waitForSelector(selector);
        await page.evaluate(() => document.fonts.ready);
        const geometry = await page.$eval(selector, el => {
          const rect = el.getBoundingClientRect();
          const title = el.querySelector('h1');
          const children = [...el.querySelectorAll('h1, p, dl, .constructed-cards__beta')];
          return { width: rect.width, height: rect.height, x: rect.x, y: rect.y, font: getComputedStyle(title).fontSize, color: getComputedStyle(title).color,
            gap: document.querySelector('[data-header-content]').getBoundingClientRect().top - rect.bottom,
            // The canvas document also holds Storybook's own hidden headings.
            h1: document.querySelectorAll('#storybook-root h1').length,
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            artwork: getComputedStyle(el, '::before').backgroundImage,
            artworkOpacity: getComputedStyle(el, '::before').opacity,
            artworkBlend: getComputedStyle(el, '::before').mixBlendMode,
            clipped: children.some(child => { const r = child.getBoundingClientRect(); return r.left < rect.left || r.right > rect.right + 1 || r.bottom > rect.bottom + 1; }),
          };
        });
        assert.equal(geometry.h1, 1);
        assert.equal(geometry.color, 'rgb(255, 242, 202)', `${width}px case ${index}: route skin must preserve readable banner text`);
        assert.ok(Math.abs(geometry.gap - 16) <= 1, `${width}px case ${index}: expected 16px content gap, got ${geometry.gap}`);
        assert.equal(geometry.overflow, false, `${width}px case ${index}: page overflow`);
        assert.match(geometry.artwork, /profile-hero-hth/, `${width}px case ${index}: shared artwork must be visible`);
        assert.equal(geometry.artworkOpacity, '1', 'legacy editorial opacity must not darken the shared illustration');
        assert.equal(geometry.artworkBlend, 'normal');
        assert.equal(geometry.clipped, false, `${width}px case ${index}: header content clipped`);
        dimensions.push(geometry);
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        assert.equal(await page.$eval(selector, el => el.getAnimations({ subtree: true }).filter(a => a.effect.getComputedTiming().duration > 1).length), 0);
        await page.emulateMediaFeatures([]);
        await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
        assert.equal(await page.$eval(selector, el => {
          const title = el.querySelector('h1');
          return title.scrollWidth > title.clientWidth + 1
            || title.getBoundingClientRect().bottom > el.getBoundingClientRect().bottom + 1
            || document.documentElement.scrollWidth > innerWidth + 1;
        }), false, `${width}px case ${index}: enlarged title must remain visible`);
        await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
      }
      for (const key of ['width', 'x', 'y']) {
        const values = dimensions.map(d => d[key]);
        assert.ok(Math.max(...values) - Math.min(...values) <= 1, `${width}px ${key}: ${values.join(', ')}`);
      }
      const artworkHeights = dimensions.map(d => d.height);
      assert.ok(Math.max(...artworkHeights) - Math.min(...artworkHeights) <= 1,
        `${width}px artwork heights: ${artworkHeights.join(', ')}`);
      assert.equal(new Set(dimensions.map(d => d.font)).size, 1, `${width}px: heading scale differs`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await storybook.close();
  }
});

// A rubber-band bounce, a scroll lock that did not let go, or a page that has
// not painted yet all show what lies behind the page. That was pale blue
// (#eef4fb) against a parchment page and a red rail: a light band above the
// search header on macOS, below the footer on every phone. The browser paints
// one flat colour there: the red of the rails the page begins and ends with.
const RAIL_RED = [116, 26, 26];
const BOUNCE = 40;
const ARTS = 12;

describe('the colour behind the page', () => {
  let runtime;
  let chrome;

  before(async () => {
    runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
    // Enough tall tiles to scroll the page by 600 px and still have the footer below.
    mkdirSync(join(runtime.backend.dataDirectory, 'uploads', 'gallery'), { recursive: true });
    copyFileSync(resolve('public/arena-logo-icon.webp'), join(runtime.backend.dataDirectory, 'uploads', 'gallery', 'art.webp'));
    const stamp = '2026-09-24T00:00:00.000Z';
    writeFileSync(join(runtime.backend.dataDirectory, 'gallery.json'), JSON.stringify({
      items: Array.from({ length: ARTS }, (_, index) => ({ id: `art-${index + 1}`, title: `Арт ${index + 1}`, description: 'Проверка фона',
        tag: 'Тест', source: 'HearthPulse', width: 128, height: 128, bytes: 2048, format: 'webp', originalFile: 'art.webp',
        previewFile: 'art.webp', thumbFile: 'art.webp', createdAt: stamp, updatedAt: stamp })),
      updatedAt: stamp,
    }));
    chrome = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  }, { timeout: 120000 });

  after(async () => {
    await chrome?.close();
    await runtime?.close();
  });

  /**
   * The colour behind the page at the top or the bottom edge. A transform on
   * <html> moves the page and leaves the canvas where it is, which is what the
   * browser's own bounce reveals; the pixel is read from a real screenshot.
   */
  async function colorBehindPage(page, edge) {
    // Lazy tiles lengthen the page as they load: stay at the edge until its length holds still for half a second.
    await page.evaluate(edge => new Promise(resolve => {
      let steady = 0;
      let length = 0;
      const settle = () => {
        const bottom = document.documentElement.scrollHeight - innerHeight;
        scrollTo(0, edge === 'top' ? 0 : bottom);
        const atEdge = Math.abs(scrollY - (edge === 'top' ? 0 : bottom)) < 1;
        steady = atEdge && document.documentElement.scrollHeight === length ? steady + 1 : 0;
        length = document.documentElement.scrollHeight;
        if (steady >= 30) resolve(); else requestAnimationFrame(settle);
      };
      settle();
    }), edge);
    const { width, scrolled, height } = await page.evaluate(() => ({ width: innerWidth, scrolled: scrollY, height: innerHeight }));
    // Fixed furniture (the skip link, the support prompt) moves with the page and can sit in the strip: it is not the canvas.
    await page.evaluate(offset => {
      for (const element of document.querySelectorAll('body *')) if (getComputedStyle(element).position === 'fixed') element.style.visibility = 'hidden';
      document.documentElement.style.transform = `translateY(${offset}px)`;
    }, edge === 'top' ? BOUNCE : -BOUNCE);
    // A screenshot clip is in page coordinates: the strip is the first or the last BOUNCE pixels of the window.
    const png = await page.screenshot({ clip: { x: Math.round(width / 2), y: scrolled + (edge === 'top' ? 0 : height - BOUNCE), width: 8, height: BOUNCE } });
    await page.evaluate(() => {
      document.documentElement.style.transform = '';
      for (const element of document.querySelectorAll('body *')) element.style.removeProperty('visibility');
    });
    const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return [...data.subarray(0, 3)];
  }

  for (const [name, viewport, header] of [
    ['desktop', { width: 1440, height: 900 }, '.global-utility-header'],
    ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }, '.arena-mobile-topbar'],
  ]) {
    it(`on the ${name} gallery a closed lightbox leaves the header at the top and a bounce shows the red rail`, { timeout: 90000 }, async () => {
      const page = await chrome.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.setViewport(viewport);
        await page.goto(`${runtime.origin}/gallery/`, { waitUntil: 'networkidle2' });
        await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 600); });
        await page.waitForFunction(() => scrollY === 600);
        // A tile in view, so that pressing it does not move the page.
        const tile = await page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Открыть Арт "]')]
          .find(button => button.getBoundingClientRect().top > 0 && button.getBoundingClientRect().bottom < innerHeight)?.ariaLabel);
        assert.ok(tile, 'a gallery tile is on screen at 600 px');
        await page.locator(`button[aria-label="${tile}"]`).click();
        await page.waitForSelector('[role="dialog"]', { visible: true });
        assert.equal(await page.evaluate(() => document.body.style.getPropertyValue('--page-scroll-lock-offset')), '600px',
          'the open lightbox holds the page where it was');
        await page.keyboard.press('Escape');
        await page.waitForSelector('[role="dialog"]', { hidden: true });
        await page.waitForFunction(() => document.body.style.position === '');

        assert.deepEqual(await page.evaluate(header => ({
          scrollY: scrollY,
          headerTop: document.querySelector(header).getBoundingClientRect().top,
          offset: document.body.style.getPropertyValue('--page-scroll-lock-offset'),
        }), header), { scrollY: 600, headerTop: 0, offset: '' }, 'the page returns to its reading position with the header on the window edge');

        assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgb(116, 26, 26)',
          'the canvas behind the page is the red of the site rails, not a pale colour');
        assert.deepEqual(await colorBehindPage(page, 'top'), RAIL_RED, 'a bounce above the header shows the red rail');
        assert.deepEqual(await colorBehindPage(page, 'bottom'), RAIL_RED, 'a bounce below the footer shows the red rail');
        assert.deepEqual(errors, []);
      } finally {
        await page.close();
      }
    });
  }

  it('the browser chrome takes the colour of the red rail at the top of a phone page', { timeout: 60000 }, async () => {
    const page = await chrome.newPage();
    try {
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      await page.goto(`${runtime.origin}/gallery/`, { waitUntil: 'networkidle2' });
      assert.deepEqual(await page.evaluate(() => ({
        themeColor: [...document.querySelectorAll('meta[name="theme-color"]')].map(meta => meta.content),
        topBar: getComputedStyle(document.querySelector('.arena-mobile-topbar')).backgroundColor,
      })), { themeColor: ['#741a1a'], topBar: 'rgb(116, 26, 26)' });
    } finally {
      await page.close();
    }
  });
});
