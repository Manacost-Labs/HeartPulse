import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
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

    await t.test('the catalog warms only the filter option a visitor points at', () => withPage(runtime, { width: 1280, height: 900 }, async page => {
      const listRequests = [];
      page.on('request', request => {
        if (new URL(request.url()).pathname === '/api/constructed-cards') listRequests.push(new URL(request.url()).searchParams);
      });
      await page.goto(`${runtime.origin}/standard/cards/`, { waitUntil: 'networkidle0' });
      await new Promise(resolve => setTimeout(resolve, 3500));
      assert.deepEqual(listRequests.map(String), [], 'an anonymous visit reads the server-rendered catalog and warms nothing');

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

    await t.test('the gallery hovers without card requests and the table brings its renderer', () => withPage(runtime, { width: 1440, height: 900 }, async page => {
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
      await page.waitForSelector('.constructed-cards__table .constructed-cards__data-deck-card .hsrdv');
      assert.equal(new URL(page.url()).searchParams.get('view'), 'table');
      assert.equal(await page.$eval('.constructed-cards__data-deck-card .hsrdv', element => getComputedStyle(element).getPropertyValue('--hsrdv-tile-height').trim()), '40px',
        'the catalog overrides keep winning over the lazily loaded renderer stylesheet');

      await page.click('.constructed-cards__view button:nth-child(1)');
      await page.waitForSelector('.constructed-cards__gallery');
      assert.equal(await page.$('.constructed-cards__table'), null);
    }));
  } finally {
    await runtime.close();
  }
});
