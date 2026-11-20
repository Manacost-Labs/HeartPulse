import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { openStory, startStorybookStatic } from './helpers/storybookStatic.mjs';

const chromiumPath = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for the card preview image test');

// Hover previews of full cards asked for their picture only once they showed
// and left an empty frame while a cold picture travelled. The preview now asks
// as soon as the pointer arrives and shows a card-shaped placeholder meanwhile.
// The current render comes first: the card image cache is not refreshed after
// balance patches, so it is only the fallback (#574: a preview showed a
// card's text from before the patch).
const EDGE_IMAGE = '/api/card-image/BE_790/full.webp';
const RENDER_IMAGE = '/api/public-resource/hsjson/v1/render/latest/ruRU/512x/BE_790.png';
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const storybook = await startStorybookStatic();
const browser = await launchBrowser({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox'] });

/** Answers card pictures as `respond(path)` decides; returns the paths asked for and when. */
async function openWithImages(url, respond, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const requests = [];
  await page.setRequestInterception(true);
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) { void request.continue(); return; }
    requests.push({ path, at: Date.now() });
    void respond(path).then(answer => request.respond(answer)).catch(() => undefined);
  });
  await openStory(page, url);
  await page.waitForSelector('#storybook-root button');
  return { page, requests };
}

const image = { status: 200, contentType: 'image/png', body: pixel };
const missing = { status: 404, contentType: 'application/json', body: '{"error":"not found"}' };

try {
  // 1. A slow card picture: requested before the preview shows, placeholder meanwhile, then the picture.
  {
    let release;
    const released = new Promise(resolve => { release = resolve; });
    const { page, requests } = await openWithImages(storybook.storyUrl('features-card-preview-image--hover'),
      async path => (path === RENDER_IMAGE ? released.then(() => image) : missing));
    await page.evaluate(() => {
      new MutationObserver((_, observer) => {
        if (!document.querySelector('[role="tooltip"]')) return;
        window.tooltipShownAt = performance.timeOrigin + performance.now();
        observer.disconnect();
      }).observe(document.body, { childList: true, subtree: true });
    });
    await page.hover('#storybook-root button');
    const tooltip = await page.waitForSelector('[role="tooltip"]');
    assert.equal(await tooltip.evaluate(element => element.getAttribute('aria-label')), "Полная карта Зер'онту");

    const loading = await page.evaluate(() => {
      const media = document.querySelector('[role="tooltip"] [aria-busy]');
      return {
        busy: media?.getAttribute('aria-busy'),
        placeholder: media ? getComputedStyle(media, '::before').content : 'none',
        text: document.querySelector('[role="tooltip"]')?.textContent ?? '',
        shownAt: window.tooltipShownAt,
      };
    });
    assert.equal(loading.busy, 'true', 'the preview is busy while the picture is on its way');
    assert.notEqual(loading.placeholder, 'none', 'a card-shaped placeholder fills the empty frame');
    assert.match(loading.text, /Загрузка изображения…/);
    assert.equal(requests[0]?.path, RENDER_IMAGE, 'the preview asks for the current render first');
    assert.ok(requests[0].at <= loading.shownAt, 'the picture is requested when the pointer arrives, not after the preview shows');
    assert.deepEqual(requests.filter(request => request.path === EDGE_IMAGE), [], 'the card image, which may predate a patch, is not asked while the render loads');

    release();
    await page.waitForSelector('[role="tooltip"][data-preview-state="loaded"]');
    const loaded = await page.$eval('[role="tooltip"] img', element => ({
      alt: element.getAttribute('alt'),
      path: new URL(element.currentSrc).pathname,
      width: element.naturalWidth,
    }));
    assert.deepEqual(loaded, { alt: "Зер'онту", path: RENDER_IMAGE, width: 1 });
    await page.close();
  }

  // 2. The render is unavailable: the preview falls back to the card image.
  {
    const { page } = await openWithImages(storybook.storyUrl('features-card-preview-image--hover'),
      async path => (path === EDGE_IMAGE ? image : missing));
    await page.hover('#storybook-root button');
    await page.waitForSelector('[role="tooltip"][data-preview-state="loaded"]');
    assert.equal(await page.$eval('[role="tooltip"] img', element => new URL(element.currentSrc).pathname), EDGE_IMAGE);
    await page.close();
  }

  // 3. The phone sheet (the full-card lightbox on touch screens) shows the picture the same way,
  //    with a card-shaped placeholder while a slow picture is on its way.
  {
    let release;
    const released = new Promise(resolve => { release = resolve; });
    const { page } = await openWithImages(storybook.storyUrl('features-card-preview-image--sheet'),
      async path => (path === RENDER_IMAGE ? released.then(() => image) : missing), { width: 390, height: 844 });
    await page.click('#storybook-root button');
    const dialog = await page.waitForSelector('[role="dialog"]');
    await page.waitForFunction(() => document.querySelector('[role="dialog"] img[alt]')?.getAttribute('src')?.includes('/hsjson/'));
    const waiting = await dialog.evaluate(element => {
      const picture = element.querySelector('img[alt]');
      const box = picture.getBoundingClientRect();
      return { busy: picture.closest('[aria-busy]')?.getAttribute('aria-busy'), height: box.height > 100, filled: getComputedStyle(picture).backgroundImage !== 'none' };
    });
    assert.deepEqual(waiting, { busy: 'true', height: true, filled: true }, 'the sheet shows a card-shaped placeholder, not an empty frame');
    release();
    await page.waitForFunction(() => {
      const picture = document.querySelector('[role="dialog"] img[alt]');
      return picture instanceof HTMLImageElement && picture.complete && picture.naturalWidth > 0;
    });
    assert.equal(await dialog.$eval('img[alt]', element => new URL(element.currentSrc).pathname), RENDER_IMAGE);
    assert.equal(await dialog.$('[role="alert"]'), null, 'no error text once a picture loaded');
    assert.equal(await dialog.$eval('figure', element => element.getAttribute('aria-busy')), 'false');
    await page.close();
  }

  // 4. Both pictures missing: the preview says so instead of staying empty.
  {
    const { page } = await openWithImages(storybook.storyUrl('features-card-preview-image--hover'), async () => missing);
    await page.hover('#storybook-root button');
    await page.waitForSelector('[role="tooltip"][data-preview-state="error"]');
    assert.match(await page.$eval('[role="tooltip"]', element => element.textContent ?? ''), /Изображение временно недоступно/);
    await page.close();
  }
} finally {
  await browser.close();
  await storybook.close();
}
