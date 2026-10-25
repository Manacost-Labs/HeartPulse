import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
// STREAMERS_SCREENSHOT_DIR=<папка> сохраняет снимки страниц на 1440 и 412 px;
// STREAMERS_HS_DATA_API=<origin> читает живой hs-data-api вместо фикстуры.
const screenshots = process.env.STREAMERS_SCREENSHOT_DIR;
const liveApi = process.env.STREAMERS_HS_DATA_API;
const slug = process.env.STREAMERS_SLUG || 'nohandsgamer';

async function pageState(page) {
  await page.evaluate(axe);
  return page.evaluate(async () => ({
    h1: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
    overflow: document.documentElement.scrollWidth > innerWidth,
    small: [...document.querySelectorAll('.streamers-chip, .streamers-copy, .streamers-link, .streamers-select select')]
      .filter(node => node.getBoundingClientRect().height < 42).map(node => node.textContent || node.getAttribute('aria-label')),
    violations: (await axe.run(document.querySelector('main'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      .violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })),
  }));
}

test('the streamers pages render live streams, streamer cards and one streamer with filters', { timeout: 300000 }, async () => {
  const pilot = await startPublicCardPilot({ pagesEnabled: true, backendEnv: liveApi ? { HS_DATA_API_BASE_URL: liveApi } : {} });
  let browser;
  try {
    const api = await fetch(`${pilot.origin}/api/streamers`);
    assert.equal(api.status, 200);
    assert.match(api.headers.get('cache-control') ?? '', /max-age=60/);
    assert.equal((await fetch(`${pilot.origin}/api/streamers/nobody`)).status, 404);

    await (await fetch(`${pilot.origin}/streamers/`)).text();
    const document = await fetch(`${pilot.origin}/streamers/`);
    assert.equal(document.status, 200);
    const html = await document.text();
    assert.match(html, /<h1[^>]*>Стримеры<\/h1>/);
    assert.match(html, /Сейчас в эфире/, 'live streams are in the server HTML');
    assert.match(html, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/streamers\/"/);
    assert.doesNotMatch(html, /<meta name="robots" content="noindex/);
    assert.match(html, /href="\/streamers\/"/, 'the menu links the page');
    const missing = await fetch(`${pilot.origin}/streamers/nobody/`);
    assert.equal(missing.status, 404);
    const detail = await fetch(`${pilot.origin}/streamers/${slug}/`);
    assert.equal(detail.status, 200);
    assert.match(await detail.text(), /<meta name="robots" content="noindex, follow"\/>/);

    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (screenshots) mkdirSync(screenshots, { recursive: true });
    for (const [width, height] of [[1440, 900], [412, 915]]) {
      await page.setViewport({ width, height, isMobile: width < 600, hasTouch: width < 600 });
      for (const [name, path, ready] of [['streamers', '/streamers/', '.streamers-card'], ['streamer', `/streamers/${slug}/`, '.streamers-decks--full .streamers-deck']]) {
        await page.goto(`${pilot.origin}${path}`, { waitUntil: 'networkidle2' });
        await page.waitForSelector(ready);
        const state = await pageState(page);
        assert.equal(state.h1.length, 1, `${name}: one h1`);
        assert.equal(state.overflow, false, `${name}: no horizontal overflow at ${width}px`);
        assert.deepEqual(state.small, [], `${name}: touch targets at ${width}px`);
        assert.deepEqual(state.violations, [], `${name}: axe at ${width}px`);
        if (screenshots) await page.screenshot({ path: join(screenshots, `${name}-${width}.png`), fullPage: true });
      }
    }

    await page.goto(`${pilot.origin}/streamers/${slug}/`, { waitUntil: 'networkidle2' });
    const before = await page.$$eval('.streamers-decks--full .streamers-deck', nodes => nodes.length);
    const [wild] = await page.$$('xpath/.//button[contains(., "Вольный")]');
    if (wild) {
      await wild.click();
      await page.waitForFunction(() => [...document.querySelectorAll('.streamers-chip[aria-pressed="true"]')]
        .some(node => node.textContent === 'Вольный') && !document.querySelector('[aria-busy="true"]'));
      const formats = await page.$$eval('.streamers-decks--full .streamers-deck__name small', nodes => nodes.map(node => node.textContent ?? ''));
      assert.ok(formats.length > 0 && formats.every(text => text.startsWith('Вольный')), 'the Wild filter shows only Wild decks');
    }
    assert.ok(before > 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await pilot.close();
  }
});
