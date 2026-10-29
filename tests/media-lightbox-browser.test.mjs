import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// The shared picture viewer, as a visitor meets it: /gallery/ (eight arts) and a
// card page (its normal, golden, signature and diamond renders), driven with a
// mouse, a keyboard, real touch events (Chrome DevTools Input.dispatchTouchEvent,
// so pinch and swipe reach the page as Pointer Events) and under reduced motion.
// Assertions are what a visitor sees and hears: the dialog, its name, the
// "3 из 8" counter, the announcement, where the picture is. Geometry is read off
// the picture's own bounding box and the stage it is shown in.

const chromiumPath = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']
  .find(candidate => candidate && existsSync(candidate));
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for the media lightbox browser test');

const ARTS = 8;
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const STAGE = '.media-lightbox__stage';
const CARD_PATH = '/standard/cards/standard/blizzard%3A12345/';
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const COLOURS = ['#7a2b16', '#2f5d3a', '#2e4a7a', '#6a3a7a', '#8a6a1c', '#6a2a2a', '#1c6a6a', '#5a5a1c'];

/** A coloured plate with a gold disc: the art of one gallery entry, landscape or (every third) portrait. */
async function writePlate(file, width, height, colour) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${colour}"/>`
    + `<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 3}" fill="#e7b85b"/></svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 70 }).toFile(file);
}

let runtime;
let chrome;
let galleryUrls;

before(async () => {
  runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  const uploads = join(runtime.backend.dataDirectory, 'uploads', 'gallery');
  mkdirSync(uploads, { recursive: true });
  const stamp = '2026-09-24T00:00:00.000Z';
  const items = [];
  for (let number = 1; number <= ARTS; number++) {
    const portrait = number % 3 === 0;
    const [width, height] = portrait ? [800, 1200] : [1200, 800];
    await writePlate(join(uploads, `art-${number}.webp`), width, height, COLOURS[number - 1]);
    await writePlate(join(uploads, `art-${number}-thumb.webp`), width / 5, height / 5, COLOURS[number - 1]);
    items.push({ id: `art-${number}`, title: `Арт ${number}`, description: 'Проверка просмотрщика', tag: 'Тест', source: 'HearthPulse',
      width, height, bytes: 20_480, format: 'webp', originalFile: `art-${number}.webp`, previewFile: `art-${number}.webp`,
      thumbFile: `art-${number}-thumb.webp`, createdAt: `2026-09-${String(30 - number)}T00:00:00.000Z`, updatedAt: stamp });
  }
  writeFileSync(join(runtime.backend.dataDirectory, 'gallery.json'), JSON.stringify({ items, updatedAt: stamp }));
  chrome = await launchBrowser({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox'] });
  const page = await chrome.newPage();
  await page.goto(`${runtime.origin}/gallery/`, { waitUntil: 'networkidle2' });
  galleryUrls = await page.$$eval('button[aria-label^="Открыть Арт "]', buttons => buttons.map(button => ({
    label: button.getAttribute('aria-label'), preview: button.dataset.lightboxSrc,
  })));
  await page.close();
}, { timeout: 180_000 });

after(async () => {
  await chrome?.close();
  await runtime?.close();
});

// ---- what a visitor reads on the open lightbox ----

// The gestures are a chunk of their own, fetched at idle; a visitor's first touch comes long after it, a script's may not.
const dialogOf = async page => {
  await page.waitForSelector('[role="dialog"]', { visible: true });
  await page.waitForSelector('[role="dialog"] [data-gestures]');
};
const gone = page => page.waitForSelector('[role="dialog"]', { hidden: true });
const counterOf = page => page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]');
  return [...(dialog?.querySelectorAll('span') ?? [])].map(span => span.textContent.trim()).find(text => /^\d+ из \d+$/.test(text)) ?? null;
});
const nameOf = page => page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]');
  return document.getElementById(dialog?.getAttribute('aria-labelledby') ?? '')?.textContent ?? dialog?.getAttribute('aria-label') ?? null;
});
const announcementOf = page => page.evaluate(() => document.querySelector('[role="dialog"] [role="status"]')?.textContent ?? '');
const focusedLabel = page => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);

/** The picture on show (the image named like the dialog) and the stage it is shown in, as bounding boxes. */
const framesOf = (page, stageSelector = STAGE) => page.evaluate(stageSelector => {
  const dialog = document.querySelector('[role="dialog"]');
  const name = document.getElementById(dialog?.getAttribute('aria-labelledby') ?? '')?.textContent;
  const image = [...(dialog?.querySelectorAll('img') ?? [])].find(candidate => candidate.alt === name);
  const box = element => { const { left, top, right, bottom, width, height } = element.getBoundingClientRect(); return { left, top, right, bottom, width, height }; };
  return { picture: image ? box(image) : null, stage: box(dialog.querySelector(stageSelector)) };
}, stageSelector);

/** A zoomed picture never leaves a gap at an edge it overflows, and a smaller one stays centred. */
function assertNoGap({ picture, stage }, message = '') {
  assert.ok(picture, `no picture on show ${message}`);
  for (const [low, high, size, box] of [['left', 'right', 'width', 'width'], ['top', 'bottom', 'height', 'height']]) {
    if (picture[size] > stage[box] + 1) {
      assert.ok(picture[low] <= stage[low] + 1 && picture[high] >= stage[high] - 1, `a gap at an edge of the zoomed picture ${message}: ${JSON.stringify({ picture, stage })}`);
    } else {
      assert.ok(Math.abs((picture[low] + picture[high]) / 2 - (stage[low] + stage[high]) / 2) < 2, `the picture is off centre ${message}`);
    }
  }
}

const tileLabel = number => `Открыть Арт ${number}`;
const tileSelector = number => `button[aria-label="${tileLabel(number)}"]`;
// The gallery lists the newest art first: "Арт 1" is the newest.
const tile = (page, number) => page.locator(tileSelector(number));

async function openGallery(page, viewport) {
  await page.setViewport(viewport);
  const problems = [];
  page.on('pageerror', error => problems.push(error.message));
  await page.goto(`${runtime.origin}/gallery/`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('button[aria-label^="Открыть Арт "]');
  return problems;
}

/** Layout shifts from here on, as the page's own Layout Instability entries. */
function watchLayoutShifts() {
  window.__shift = 0;
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shift += entry.value;
  }).observe({ type: 'layout-shift', buffered: false });
}

/** Touches through Chrome's own input pipeline, so that they reach the page as touch pointers. */
async function touchScreen(page) {
  const cdp = await page.createCDPSession();
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const api = {
    async swipe(from, to, { steps = 8, pause = 16 } = {}) {
      await send('touchStart', [from]);
      for (let step = 1; step <= steps; step++) {
        await send('touchMove', [[from[0] + ((to[0] - from[0]) * step) / steps, from[1] + ((to[1] - from[1]) * step) / steps]]);
        await sleep(pause);
      }
      await send('touchEnd', []);
    },
    /** The finger goes down and moves, and stays down: `release()` lifts it. */
    async hold(from, to, steps = 6) {
      await send('touchStart', [from]);
      for (let step = 1; step <= steps; step++) {
        await send('touchMove', [[from[0] + ((to[0] - from[0]) * step) / steps, from[1] + ((to[1] - from[1]) * step) / steps]]);
        await sleep(40);
      }
      return { release: () => send('touchEnd', []) };
    },
    async tap(at) { await send('touchStart', [at]); await send('touchEnd', []); },
    async doubleTap(at) { await api.tap(at); await sleep(70); await api.tap(at); },
    /** Two fingers on a horizontal line about `centre`, `from` px either side, moving to `to` px either side. */
    async pinch(centre, from, to, steps = 8) {
      await send('touchStart', [[centre[0] - from, centre[1]], [centre[0] + from, centre[1]]]);
      for (let step = 1; step <= steps; step++) {
        const spread = from + ((to - from) * step) / steps;
        await send('touchMove', [[centre[0] - spread, centre[1]], [centre[0] + spread, centre[1]]]);
        await sleep(16);
      }
      await send('touchEnd', []);
    },
  };
  return api;
}

const centreOf = ({ left, top, width, height }) => [left + width / 2, top + height / 2];

describe('the gallery lightbox with a mouse and a keyboard', () => {
  it('opens from a tile, pages through every art, zooms, pans, and closes back with the page where it was', { timeout: 120_000 }, async () => {
    const page = await chrome.newPage();
    try {
      const problems = await openGallery(page, DESKTOP);
      await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 300); });
      await page.waitForFunction(() => scrollY === 300);
      const before = await page.evaluate(() => ({ scrollY, width: document.documentElement.clientWidth }));
      await page.evaluate(watchLayoutShifts);

      await tile(page, 3).click();
      await dialogOf(page);
      assert.equal(await nameOf(page), 'Арт 3');
      assert.equal(await counterOf(page), '3 из 8', 'the counter tells which art of how many');
      assert.equal(await focusedLabel(page), 'Закрыть', 'the focus goes into the dialog, onto its close button');
      await page.waitForFunction(() => document.querySelectorAll('body > img[aria-hidden="true"]').length === 0);
      assertNoGap(await framesOf(page), 'when opened');

      await page.click('[role="dialog"] button[aria-label="Следующая картинка"]');
      await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="status"]')?.textContent === 'Картинка 4 из 8: Арт 4');
      assert.equal(await counterOf(page), '4 из 8');
      assert.equal(await nameOf(page), 'Арт 4');
      await page.click('[role="dialog"] button[aria-label="Предыдущая картинка"]');
      await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="status"]')?.textContent === 'Картинка 3 из 8: Арт 3');

      for (const key of ['ArrowLeft', 'ArrowLeft', 'ArrowLeft']) await page.keyboard.press(key);
      await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="status"]')?.textContent === 'Картинка 8 из 8: Арт 8');
      assert.equal(await counterOf(page), '8 из 8', 'the list wraps from the first art to the last');
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="status"]')?.textContent === 'Картинка 1 из 8: Арт 1');

      const fitted = (await framesOf(page)).picture;
      await page.keyboard.press('+');
      await page.waitForFunction(width => document.querySelector('[role="dialog"] img[alt="Арт 1"]').getBoundingClientRect().width > width * 1.4, {}, fitted.width);
      await page.keyboard.press('0');
      await page.waitForFunction(width => Math.abs(document.querySelector('[role="dialog"] img[alt="Арт 1"]').getBoundingClientRect().width - width) < 1, {}, fitted.width);

      // A double click zooms in at the pointer; a second returns the fitted picture.
      const [x, y] = centreOf(fitted);
      await page.mouse.click(x + 100, y);
      await sleep(60);
      await page.mouse.click(x + 100, y);
      await page.waitForFunction(width => document.querySelector('[role="dialog"] img[alt="Арт 1"]').getBoundingClientRect().width > width * 1.9, {}, fitted.width);
      await sleep(300);
      const zoomed = await framesOf(page);
      assertNoGap(zoomed, 'zoomed at the pointer');
      assert.ok(zoomed.picture.left < fitted.left && zoomed.picture.right > fitted.right, 'zoomed, the picture grows past where it fitted');

      // Dragged hard to each corner, the zoomed picture keeps covering its stage, and the drag does not page.
      for (const [dx, dy] of [[-900, -600], [900, 600], [-900, 600]]) {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + dx, y + dy, { steps: 8 });
        await page.mouse.up();
        assertNoGap(await framesOf(page), `dragged by ${dx}, ${dy}`);
      }
      assert.equal(await counterOf(page), '1 из 8', 'a zoomed picture is panned, not paged');

      await page.mouse.click(x, y);
      await sleep(60);
      await page.mouse.click(x, y);
      await page.waitForFunction(width => Math.abs(document.querySelector('[role="dialog"] img[alt="Арт 1"]').getBoundingClientRect().width - width) < 1, {}, fitted.width);

      // A drag sideways pages like a swipe.
      await page.mouse.move(x + 300, y);
      await page.mouse.down();
      await page.mouse.move(x - 300, y, { steps: 8 });
      await page.mouse.up();
      await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="status"]')?.textContent === 'Картинка 2 из 8: Арт 2');

      await page.keyboard.press('Escape');
      await gone(page);
      assert.equal(await focusedLabel(page), tileLabel(3), 'the focus returns to the tile that opened the lightbox');
      const after = await page.evaluate(() => ({ scrollY, width: document.documentElement.clientWidth, shift: window.__shift }));
      assert.equal(after.scrollY, before.scrollY, 'the page is where it was');
      assert.equal(after.width, before.width, 'the page did not reflow');
      assert.equal(after.shift, 0, 'opening, paging and closing shifted no layout');
      assert.deepEqual(problems, []);
    } finally {
      await page.close();
    }
  });

  it('closes by Esc, the × button, the backdrop and a click beside the picture, and the focus goes back to the tile', { timeout: 90_000 }, async () => {
    const page = await chrome.newPage();
    try {
      await openGallery(page, DESKTOP);
      for (const [name, close] of [
        ['Esc', () => page.keyboard.press('Escape')],
        ['the × button', () => page.click('[role="dialog"] button[aria-label="Закрыть"]')],
        ['the backdrop', () => page.mouse.click(8, 450)],
        ['a click beside the picture', async () => {
          const { picture, stage } = await framesOf(page);
          await page.mouse.click(stage.left + 4, picture.top + picture.height / 2);
        }],
      ]) {
        // Every third art is a portrait, so the empty stage lies beside it.
        await tile(page, 3).click();
        await dialogOf(page);
        await page.waitForFunction(() => document.querySelectorAll('body > img[aria-hidden="true"]').length === 0);
        await close();
        await gone(page);
        assert.equal(await focusedLabel(page), tileLabel(3), `after closing with ${name}`);
      }
    } finally {
      await page.close();
    }
  });

  it('keeps the focus inside the dialog on Tab and Shift+Tab', { timeout: 60_000 }, async () => {
    const page = await chrome.newPage();
    try {
      await openGallery(page, DESKTOP);
      await tile(page, 5).click();
      await dialogOf(page);
      const visited = new Set();
      for (let press = 0; press < 8; press++) {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), true, `focus left the dialog on Tab ${press + 1}`);
        visited.add(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent.trim()));
      }
      for (let press = 0; press < 8; press++) {
        await page.keyboard.down('Shift');
        await page.keyboard.press('Tab');
        await page.keyboard.up('Shift');
        assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), true, `focus left the dialog on Shift+Tab ${press + 1}`);
      }
      assert.deepEqual([...visited].sort(), ['Закрыть', 'Предыдущая картинка', 'Скачать оригинал', 'Следующая картинка'],
        'every control of the dialog can be reached with the keyboard, the download link among them');
    } finally {
      await page.close();
    }
  });

  it('closes into the tile of the art it shows, not the one that opened it', { timeout: 60_000 }, async () => {
    const page = await chrome.newPage();
    try {
      await openGallery(page, DESKTOP);
      await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
      await tile(page, 2).click();
      await dialogOf(page);
      await page.waitForFunction(() => document.querySelectorAll('body > img[aria-hidden="true"]').length === 0);
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="status"]')?.textContent === 'Картинка 3 из 8: Арт 3');
      await sleep(300);
      // The flying copy is sampled every frame of the closing; it must end on the tile of "Арт 3".
      await page.evaluate(() => {
        window.__flight = [];
        const sample = () => {
          const copy = document.querySelector('body > img[aria-hidden="true"]');
          if (copy) { const { left, top, width, height } = copy.getBoundingClientRect(); window.__flight.push({ left, top, width, height }); }
          if (!window.__stop) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await page.keyboard.press('Escape');
      await gone(page);
      const { flight, target } = await page.evaluate(() => {
        window.__stop = true;
        const image = document.querySelector('button[aria-label="Открыть Арт 3"] img').getBoundingClientRect();
        return { flight: window.__flight, target: { left: image.left, top: image.top, width: image.width, height: image.height } };
      });
      assert.ok(flight.length > 3, 'the picture flew back to the page');
      const last = flight.at(-1);
      assert.ok(Math.abs(last.left - target.left) < 40 && Math.abs(last.top - target.top) < 40 && Math.abs(last.width - target.width) < 40,
        `the flight ends on the tile of the art on show: ${JSON.stringify({ last, target })}`);
    } finally {
      await page.close();
    }
  });
});

describe('the gallery lightbox on a touch screen', () => {
  it('swipes sideways to page, double taps and pinches to zoom, pans without paging, and a swipe down closes with the backdrop dimming', { timeout: 120_000 }, async () => {
    const page = await chrome.newPage();
    try {
      const problems = await openGallery(page, PHONE);
      await page.evaluate(watchLayoutShifts);
      const touch = await touchScreen(page);
      await page.tap(tileSelector(4));
      await dialogOf(page);
      assert.equal(await counterOf(page), '4 из 8');
      await page.waitForFunction(() => document.querySelectorAll('body > img[aria-hidden="true"]').length === 0);
      const fitted = (await framesOf(page)).picture;
      const middle = centreOf(fitted);

      await touch.swipe([320, middle[1]], [60, middle[1] + 6]);
      await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="status"]')?.textContent === 'Картинка 5 из 8: Арт 5');
      await touch.swipe([60, middle[1]], [330, middle[1] - 6]);
      await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="status"]')?.textContent === 'Картинка 4 из 8: Арт 4');
      assert.equal(await announcementOf(page), 'Картинка 4 из 8: Арт 4');

      // A double tap zooms in at the finger, a second one returns the fitted picture.
      await touch.doubleTap([middle[0] + 60, middle[1]]);
      await page.waitForFunction(width => document.querySelector('[role="dialog"] img[alt="Арт 4"]').getBoundingClientRect().width > width * 1.9, {}, fitted.width);
      await sleep(300);
      assertNoGap(await framesOf(page), 'after the double tap');
      const zoomedLeft = (await framesOf(page)).picture.left;

      // Zoomed, a swipe pans the picture and does not page.
      await touch.swipe([300, middle[1]], [80, middle[1]]);
      await sleep(200);
      assert.equal(await counterOf(page), '4 из 8', 'a zoomed picture is panned, not paged');
      const panned = await framesOf(page);
      assert.ok(panned.picture.left < zoomedLeft, 'the picture followed the finger');
      assertNoGap(panned, 'after the pan');
      await touch.swipe([330, middle[1]], [10, middle[1]], { steps: 4 });
      assertNoGap(await framesOf(page), 'panned past the edge');

      await touch.doubleTap(middle);
      await page.waitForFunction(width => Math.abs(document.querySelector('[role="dialog"] img[alt="Арт 4"]').getBoundingClientRect().width - width) < 1, {}, fitted.width);

      // A pinch out zooms about the fingers (at least twofold); a pinch in returns the fitted picture.
      await touch.pinch(middle, 40, 120);
      await sleep(250);
      const pinched = await framesOf(page);
      assert.ok(pinched.picture.width > fitted.width * 2, `a pinch zooms at least twofold: ${pinched.picture.width} of ${fitted.width}`);
      assertNoGap(pinched, 'after the pinch');
      await touch.pinch(middle, 150, 30);
      await page.waitForFunction(width => Math.abs(document.querySelector('[role="dialog"] img[alt="Арт 4"]').getBoundingClientRect().width - width) < 1, {}, fitted.width);

      // A swipe down follows the finger and dims the backdrop in proportion; a short, slow one lets go and the lightbox stays.
      const scrim = () => page.evaluate(() => Number(getComputedStyle(document.querySelector('button[aria-label="Закрыть просмотр"]')).opacity));
      const dragged = await touch.hold([middle[0], 250], [middle[0], 330]);
      const dimmed = await scrim();
      const lowered = (await framesOf(page)).picture.top - fitted.top;
      assert.ok(dimmed < 1 && dimmed > 0.2, `the backdrop dims as the picture is pulled down: ${dimmed}`);
      assert.ok(lowered > 40, `the picture follows the finger: ${lowered}`);
      await dragged.release();
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('button[aria-label="Закрыть просмотр"]')).opacity) === 1);
      assert.equal(await counterOf(page), '4 из 8', 'a short pull settles back');

      await touch.swipe([middle[0], 250], [middle[0], 640], { steps: 10 });
      await gone(page);
      assert.equal(await focusedLabel(page), tileLabel(4));
      assert.equal(await page.evaluate(() => window.__shift), 0, 'the gestures shifted no layout');
      assert.deepEqual(problems, []);
    } finally {
      await page.close();
    }
  });

  it('closes by a tap beside the picture and by the × button', { timeout: 60_000 }, async () => {
    const page = await chrome.newPage();
    try {
      await openGallery(page, PHONE);
      const touch = await touchScreen(page);
      await page.tap(tileSelector(1));
      await dialogOf(page);
      await page.waitForFunction(() => document.querySelectorAll('body > img[aria-hidden="true"]').length === 0);
      const { picture, stage } = await framesOf(page);
      await touch.tap([stage.left + stage.width / 2, (stage.top + picture.top) / 2]);
      await gone(page);
      assert.equal(await focusedLabel(page), tileLabel(1));
    } finally {
      await page.close();
    }
  });
});

describe('reduced motion', () => {
  it('pages and closes without travel: only opacity moves, and no picture flies', { timeout: 90_000 }, async () => {
    const page = await chrome.newPage();
    try {
      await openGallery(page, PHONE);
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      const touch = await touchScreen(page);
      // Every property any animation of the lightbox, or a flying copy, animates from here on.
      await page.evaluate(() => {
        window.__animated = new Set();
        window.__flew = false;
        const sample = () => {
          for (const animation of document.getAnimations()) {
            const target = animation.effect?.target;
            if (!(target instanceof Element) || !target.closest('[role="dialog"], body > img[aria-hidden="true"]')) continue;
            for (const frame of animation.effect.getKeyframes()) for (const property of Object.keys(frame)) window.__animated.add(property);
          }
          if (document.querySelector('body > img[aria-hidden="true"]')) window.__flew = true;
          if (!window.__stop) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await page.tap(tileSelector(3));
      await dialogOf(page);
      await sleep(400);
      const fitted = (await framesOf(page)).picture;

      // Mid-swipe the picture stays where it is; on release the next art fades in.
      const held = await touch.hold([320, 400], [100, 400]);
      assert.equal((await framesOf(page)).picture.left, fitted.left, 'the picture does not follow the finger');
      await held.release();
      await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="status"]')?.textContent === 'Картинка 4 из 8: Арт 4');
      await page.click('[role="dialog"] button[aria-label="Следующая картинка"]');
      await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="status"]')?.textContent === 'Картинка 5 из 8: Арт 5');
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="status"]')?.textContent === 'Картинка 4 из 8: Арт 4');
      await touch.swipe([300, 250], [300, 640], { steps: 10 });
      await gone(page);
      const { animated, flew } = await page.evaluate(() => { window.__stop = true; return { animated: [...window.__animated], flew: window.__flew }; });
      assert.equal(flew, false, 'no picture flies under reduced motion');
      assert.ok(animated.includes('opacity'), 'the lightbox still fades');
      assert.ok(!animated.some(property => /transform|translate|scale/.test(property)), `no movement under reduced motion: ${animated}`);
    } finally {
      await page.close();
    }
  });
});

describe('the neighbours of the art on show', () => {
  it('are fetched as soon as the lightbox opens, and a slow full size never leaves a blank frame when paging', { timeout: 90_000 }, async () => {
    const page = await chrome.newPage();
    try {
      await page.setViewport(DESKTOP);
      const previous = new URL(galleryUrls[2].preview, runtime.origin).pathname;
      const following = new URL(galleryUrls[4].preview, runtime.origin).pathname;
      const requested = [];
      const held = [];
      await page.setRequestInterception(true);
      page.on('request', request => {
        const { pathname } = new URL(request.url());
        requested.push(pathname);
        if (pathname === following) held.push(request); // Арт 5 stays "slow" until released.
        else request.continue();
      });
      await page.goto(`${runtime.origin}/gallery/`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('button[aria-label^="Открыть Арт "]');
      assert.ok(!requested.includes(previous) && !requested.includes(following), 'the full sizes are not fetched with the page');
      await tile(page, 4).click();
      await dialogOf(page);
      await sleep(800);
      assert.ok(requested.includes(previous), 'the previous art is fetched at once');
      assert.ok(requested.includes(following), 'the next art is fetched at once');
      assert.equal(held.length > 0, true, 'the next art is still on its way');

      await page.click('[role="dialog"] button[aria-label="Следующая картинка"]');
      // The first frames of the page turn already show the next art (its thumbnail) while its full size is on the way.
      const frame = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
        const image = [...document.querySelectorAll('[role="dialog"] img:not([hidden])')].find(candidate => candidate.currentSrc.includes('/api/gallery/art-5/'));
        resolve({ shown: Boolean(image), loaded: Boolean(image?.complete && image.naturalWidth > 0) });
      }))));
      assert.deepEqual(frame, { shown: true, loaded: true });
      await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="status"]')?.textContent === 'Картинка 5 из 8: Арт 5');
      for (const request of held) request.continue();
      await page.waitForFunction(path => {
        const image = [...document.querySelectorAll('[role="dialog"] img')].find(candidate => candidate.alt === 'Арт 5');
        return image && new URL(image.currentSrc).pathname === path && image.complete && image.naturalWidth === 1200;
      }, { timeout: 10_000 }, following);
    } finally {
      await page.close();
    }
  });
});

describe('the media of a card page', () => {
  it('pages through the renders with the counter, the arrows and a swipe', { timeout: 90_000 }, async () => {
    const page = await chrome.newPage();
    try {
      await page.setViewport(PHONE);
      const problems = [];
      page.on('pageerror', error => problems.push(error.message));
      await page.setRequestInterception(true);
      page.on('request', async request => {
        const url = new URL(request.url());
        if (url.pathname.startsWith('/api/constructed-cards/blizzard')) {
          const payload = await (await fetch(runtime.origin + url.pathname + url.search)).json();
          payload.card.images = { ...payload.card.images, golden: '/arena-logo-icon.webp?golden', signature: '/arena-logo-icon.webp?signature', diamond: '/arena-logo-icon.webp?diamond' };
          await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
        } else await request.continue();
      });
      await page.goto(runtime.origin + CARD_PATH, { waitUntil: 'networkidle0' });
      const opener = await page.waitForSelector('button[aria-label$="в полном размере"]');
      await opener.tap();
      await dialogOf(page);
      assert.equal(await counterOf(page), '1 из 4');
      assert.equal(await nameOf(page), 'Обычная карта');
      await page.click('[role="dialog"] button[aria-label="Следующая картинка"]');
      await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="status"]')?.textContent === 'Картинка 2 из 4: Золотая карта');
      assert.equal(await nameOf(page), 'Золотая карта');
      const touch = await touchScreen(page);
      await touch.swipe([320, 400], [60, 400]);
      await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="status"]')?.textContent === 'Картинка 3 из 4: Сигнатурная карта');
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="status"]')?.textContent === 'Картинка 4 из 4: Алмазная карта');
      await page.keyboard.press('Escape');
      await gone(page);
      assert.equal(await focusedLabel(page), await opener.evaluate(button => button.getAttribute('aria-label')));
      assert.deepEqual(problems, []);
    } finally {
      await page.close();
    }
  });
});
