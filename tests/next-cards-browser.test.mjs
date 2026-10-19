import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const chromiumPath = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome'].find(candidate => candidate && existsSync(candidate));
const CARD_PATH = '/standard/cards/standard/blizzard%3A12345/';

// A 0.1 s silent mono WAV: enough for the browser to start playback.
function silentWav() {
  const samples = 800;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + samples * 2, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
}

async function withPage(runtime, viewport, fn) {
  const browser = await puppeteer.launch({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    return await fn(page);
  } finally {
    await browser.close();
  }
}

test('catalog first-row image selection works before hydration and defers mobile rows', { timeout: 120_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  const thumbnail = readFileSync('public/arena-logo-icon.webp');
  const withImages = async (page, requests) => {
    await page.setRequestInterception(true);
    page.on('request', async request => {
      if (new URL(request.url()).pathname.startsWith('/api/card-image/')) {
        requests.push(request.url());
        await request.respond({ status: 200, contentType: 'image/webp', body: thumbnail });
      } else await request.continue();
    });
  };
  try {
    for (const [width, expected] of [[640, 2], [641, 4], [900, 4], [901, 5], [1240, 5], [1241, 6]]) {
      await withPage(runtime, { width, height: 844 }, async page => {
        const requests = [];
        await withImages(page, requests);
        await page.setJavaScriptEnabled(false);
        await page.goto(`${runtime.origin}/standard/cards/`, { waitUntil: 'networkidle0' });
        assert.equal(requests.length, expected, `at ${width}px only the matching first row loads before JavaScript`);
        assert.equal(await page.$$eval('.constructed-cards__gallery-image[fetchpriority="high"]', images => images.length), 0,
          'the LCP banner has priority over first-row thumbnails');
      });
    }
    await withPage(runtime, { width: 390, height: 844, isMobile: true }, async page => {
      const requests = [];
      const exceptions = [];
      page.on('pageerror', error => exceptions.push(error.message));
      await withImages(page, requests);
      await page.goto(`${runtime.origin}/standard/cards/`, { waitUntil: 'networkidle0' });
      assert.equal(requests.length, 2, 'hydration must not start the four desktop-only images on a phone');
      await page.$eval('.constructed-cards__gallery-card:last-child', card => card.scrollIntoView());
      await page.waitForFunction(() => {
        const image = document.querySelector('.constructed-cards__gallery-card:last-child img');
        return image?.naturalWidth > 1 && !image.dataset.cardImageSrc;
      });
      await page.setViewport({ width: 1440, height: 900, isMobile: true });
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForFunction(() => [...document.querySelectorAll('.constructed-cards__gallery img')].slice(0, 6)
        .every(image => image.naturalWidth > 1 && !image.currentSrc.startsWith('data:')));
      assert.deepEqual(exceptions, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    });
  } finally { await runtime.close(); }
});

test('card pages load their heavy parts only when a visitor asks for them', { timeout: 120_000 }, async t => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  try {
    await t.test('voice lines download on play, not with the page', () => withPage(runtime, { width: 1280, height: 900 }, async page => {
      const voiceRequests = [];
      await page.setRequestInterception(true);
      page.on('request', async request => {
        const url = new URL(request.url());
        if (/\.wav$/.test(url.pathname)) {
          voiceRequests.push(url.pathname);
          await request.respond({ status: 200, contentType: 'audio/wav', body: silentWav() });
          return;
        }
        if (url.pathname.startsWith('/api/constructed-cards/blizzard')) {
          const payload = await (await fetch(runtime.origin + url.pathname + url.search)).json();
          payload.card.wiki = { ...payload.card.wiki, sounds: [
            { heading: 'Play', clips: [
              { file_url: 'https://hearthstone.wiki.gg/images/VO_QA_Play_01.wav', description: 'Вперёд!' },
              { file_url: 'https://hearthstone.wiki.gg/images/VO_QA_Play_02.wav', description: 'За Азерот!' },
            ] },
            { heading: 'Death', clips: [{ file_url: 'https://hearthstone.wiki.gg/images/VO_QA_Death_01.wav', description: 'Нет…' }] },
          ] };
          await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
          return;
        }
        await request.continue();
      });
      await page.goto(runtime.origin + CARD_PATH, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.constructed-card-detail__sounds audio');
      await new Promise(resolve => setTimeout(resolve, 1000));
      assert.deepEqual(await page.$$eval('.constructed-card-detail__sounds audio', audios => audios.map(audio => audio.preload)),
        ['none', 'none', 'none']);
      assert.deepEqual(voiceRequests, [], 'about 0.3 MB per clip must not download before the visitor presses play');

      const played = page.waitForRequest(request => request.url().endsWith('/VO_QA_Play_01.wav'), { timeout: 10_000 });
      await page.$eval('.constructed-card-detail__sounds audio', audio => { audio.muted = true; void audio.play().catch(() => undefined); });
      await played;
    }));

    await t.test('a late statistics warning does not move the card hero', () => withPage(runtime, { width: 1350, height: 940 }, async page => {
      let release;
      const held = new Promise(resolve => { release = resolve; });
      await page.setRequestInterception(true);
      page.on('request', async request => {
        const url = new URL(request.url());
        if (url.pathname.startsWith('/api/constructed-cards/blizzard')) {
          const payload = await (await fetch(runtime.origin + url.pathname + url.search)).json();
          payload.warning = 'Статистика карт временно недоступна.';
          await held;
          await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
        } else await request.continue();
      });
      try {
        await page.goto(runtime.origin + CARD_PATH, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.constructed-card-detail__hero');
        await new Promise(resolve => setTimeout(resolve, 500));
        const before = await page.$eval('.constructed-card-detail__hero', node => node.getBoundingClientRect().top);
        release();
        await page.waitForSelector('.constructed-card-detail__data-warning');
        const after = await page.$eval('.constructed-card-detail__hero', node => node.getBoundingClientRect().top);
        assert.ok(Math.abs(after - before) < 1, `a late warning moved the hero by ${after - before}px`);
      } finally { release(); }
    }));

    // A phone stacks the art above the facts. An unsized image grows from 0 to
    // about 430 px when it arrives and pushes the variants and facts down
    // (production CLS 0.29), so its box must exist before the bytes do.
    await t.test('the card art reserves its box before the image arrives on a phone', () => withPage(runtime, { width: 390, height: 844, isMobile: true }, async page => {
      await page.evaluateOnNewDocument(() => {
        window.__layoutShifts = [];
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) window.__layoutShifts.push(entry.value);
        }).observe({ type: 'layout-shift', buffered: true });
      });
      let releaseArt;
      const artHeld = new Promise(resolve => { releaseArt = resolve; });
      await page.setRequestInterception(true);
      page.on('request', async request => {
        if (/\/api\/card-image\/12345\/full\./.test(request.url())) await artHeld;
        await request.continue();
      });
      const art = '.constructed-card-detail__visual-button img';
      await page.goto(runtime.origin + CARD_PATH, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(art);
      await new Promise(resolve => setTimeout(resolve, 500));
      const pending = await page.$eval(art, image => ({ loaded: image.naturalWidth > 0, height: image.getBoundingClientRect().height }));
      assert.equal(pending.loaded, false, 'the fixture must still hold the card art');
      releaseArt();
      await page.waitForFunction(selector => document.querySelector(selector).naturalWidth > 0, {}, art);
      await new Promise(resolve => setTimeout(resolve, 300));
      const loadedHeight = await page.$eval(art, image => image.getBoundingClientRect().height);
      assert.ok(pending.height > 200, `the art box is ${pending.height}px tall before its image arrives`);
      assert.ok(Math.abs(loadedHeight - pending.height) < 1, `the art box changed from ${pending.height}px to ${loadedHeight}px`);
      const shift = await page.evaluate(() => window.__layoutShifts.reduce((sum, value) => sum + value, 0));
      assert.ok(shift < 0.01, `layout shift while the art loads was ${shift}`);
    }));

    await t.test('the catalog warms only the filter option a visitor points at', () => withPage(runtime, { width: 1280, height: 900 }, async page => {
      const listRequests = [];
      page.on('request', request => {
        if (new URL(request.url()).pathname === '/api/constructed-cards') listRequests.push(new URL(request.url()).searchParams);
      });
      await page.goto(`${runtime.origin}/standard/cards/`, { waitUntil: 'networkidle0' });
      await new Promise(resolve => setTimeout(resolve, 3500));
      assert.deepEqual(listRequests.map(String), [], 'an anonymous visit reads the server-rendered catalog and warms nothing');

      await page.click('.constructed-cards__advanced-toggle');
      assert.equal(await page.$eval('.constructed-cards__advanced-toggle', button => button.getAttribute('aria-expanded')), 'true');
      await page.click('.constructed-cards__rank-filter .constructed-cards__filter-trigger');
      const option = await page.waitForSelector('.constructed-cards__rank-filter [role="option"][aria-selected="false"]');
      const box = await option.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
      await new Promise(resolve => setTimeout(resolve, 600));
      assert.equal(listRequests.length, 1, 'resting on an option warms exactly that slice');
      const warmedRank = listRequests[0].get('rank');
      assert.notEqual(warmedRank, 'legend');
      await option.click();
      await page.waitForFunction(rank => new URL(location.href).searchParams.get('rank') === rank, {}, warmedRank);
      await new Promise(resolve => setTimeout(resolve, 500));
      assert.equal(listRequests.length, 1, 'choosing the warmed option reuses the in-flight request');
    }));

    await t.test('gallery hovers and catalog tiles avoid the deck renderer and card-detail requests', () => withPage(runtime, { width: 1440, height: 900 }, async page => {
      const detailRequests = [];
      page.on('request', request => {
        if (/^\/api\/constructed-cards\/./.test(new URL(request.url()).pathname)) detailRequests.push(request.url());
      });
      await page.goto(`${runtime.origin}/standard/cards/`, { waitUntil: 'networkidle0' });
      assert.equal(await page.evaluate(() => typeof window.HSReplayDeckView), 'undefined',
        'the gallery view must not download the HSReplay deck renderer');
      assert.equal(await page.evaluate(() => [...document.styleSheets].some(sheet => {
        try { return [...sheet.cssRules].some(rule => rule.cssText.startsWith('.hsrdv')); } catch { return false; }
      })), false, 'nor its stylesheet');

      for (const link of (await page.$$('.constructed-cards__gallery-card-link')).slice(0, 4)) {
        await link.hover();
        await page.waitForSelector('.constructed-cards__tooltip');
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      await page.mouse.move(5, 5);
      await page.waitForSelector('.constructed-cards__tooltip', { hidden: true });
      assert.deepEqual(detailRequests, [], 'a card page is a new document: hovering must not fetch card details');

      await page.click('.constructed-cards__view button:nth-child(2)');
      assert.equal(await page.$eval('.constructed-cards__view button:nth-child(2)', button => button.getAttribute('aria-pressed')), 'true');
      await page.waitForSelector('.constructed-cards__table .constructed-catalog-tile');
      assert.equal(new URL(page.url()).searchParams.get('view'), 'table');
      assert.equal(await page.evaluate(() => typeof window.HSReplayDeckView), 'undefined',
        'the table uses catalog tiles without downloading the deck renderer');
      assert.equal(await page.$('.constructed-cards__table .hsrdv'), null);
      assert.ok(await page.$eval('.constructed-catalog-tile', element => element.getBoundingClientRect().height >= 44),
        'the catalog tile stays readable in the table');
      assert.deepEqual(detailRequests, [], 'switching to catalog tiles must not fetch card details');

      await page.click('.constructed-cards__view button:nth-child(1)');
      await page.waitForSelector('.constructed-cards__gallery');
      assert.equal(await page.$('.constructed-cards__table'), null);
    }));

    // The hover glow is a blurred plate behind the card art. It must follow the
    // image, which is capped (190 px at 640 px and below, 230 px above), not the
    // grid cell, or a wide cell puts the whole tile on an opaque coloured box.
    for (const width of [600, 1000, 1440]) {
      await t.test(`the hover glow stays behind the card art at ${width} px`, () => withPage(runtime, { width, height: 900 }, async page => {
        await page.goto(`${runtime.origin}/standard/cards/`, { waitUntil: 'networkidle0' });
        const geometry = await page.$eval('.constructed-cards__gallery-card', card => {
          const cardBox = card.getBoundingClientRect();
          const image = card.querySelector('.constructed-cards__gallery-card-link > img').getBoundingClientRect();
          const plate = getComputedStyle(card, '::before');
          const plateWidth = parseFloat(plate.width);
          const plateHeight = parseFloat(plate.height);
          const left = cardBox.left + parseFloat(plate.left) + parseFloat(plate.marginLeft);
          const top = cardBox.top + parseFloat(plate.top) + parseFloat(plate.marginTop);
          // The hover state scales the plate by 1.04 around its centre.
          const grow = 0.02;
          return {
            image: { left: image.left, top: image.top, right: image.right, bottom: image.bottom },
            plate: {
              left: left - plateWidth * grow, top: top - plateHeight * grow,
              right: left + plateWidth * (1 + grow), bottom: top + plateHeight * (1 + grow),
            },
          };
        });
        const { image, plate } = geometry;
        assert.ok(plate.left >= image.left - 0.5 && plate.right <= image.right + 0.5
          && plate.top >= image.top - 0.5 && plate.bottom <= image.bottom + 0.5,
        `glow plate ${JSON.stringify(plate)} must sit inside the card image ${JSON.stringify(image)}`);
        assert.ok(plate.right - plate.left >= (image.right - image.left) * 0.75,
          'the plate still spans most of the card so its blurred rim shows as a halo');
      }));
    }
  } finally {
    await runtime.close();
  }
});
