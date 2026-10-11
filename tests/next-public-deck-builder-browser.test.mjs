import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer';
import { decode } from '@firestone-hs/deckstrings';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const cards = [
  { card_id: 'CS2_029', dbf: 315, class: 'MAGE', name: { ru: 'Огненный шар' }, mana_cost: 4, rarity: 'COMMON' },
  { card_id: 'BE_259', dbf: 129851, class: 'MAGE', name: { ru: 'Изисет' }, mana_cost: 7, rarity: 'LEGENDARY' },
  { card_id: 'CS2_120', dbf: 1368, class: 'NEUTRAL', name: { ru: 'Речной кроколиск' }, mana_cost: 2, rarity: 'COMMON' },
].map(card => ({ ...card, images: { card: `https://api.kolodahearthstone.com/uploads/${card.card_id}.png`,
  tile: `https://api.kolodahearthstone.com/uploads/card-tiles/${card.card_id}.png` } }));
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1WQAAAAASUVORK5CYII=', 'base64');
const axe = readFileSync(import.meta.resolve('axe-core').replace('file://', ''), 'utf8');

test('guest builder keeps selection across filters and mobile panels, confirms reset and downloads Deckview images', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  const downloads = mkdtempSync(join(tmpdir(), 'public-deck-builder-'));
  let browser;
  try {
    const guest = await fetch(`${runtime.origin}/standard/deck-builder/`);
    assert.equal(guest.status, 200);
    assert.match(await guest.text(), /Конструктор колод/);
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    const errors = []; const queries = []; const renders = []; let renderFails = true;
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (['error', 'warn'].includes(message.type())) errors.push(message.text()); });
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/constructed-cards') {
        queries.push(Object.fromEntries(url.searchParams));
        const query = url.searchParams.get('query') ?? '';
        if (query === 'slow') await delay(600);
        const result = query === 'slow' ? [{ ...cards[0], name: { ru: 'Устаревший ответ' } }]
          : cards.filter(card => card.name.ru.toLowerCase().includes(query.toLowerCase()));
        await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ cards: result,
          pagination: { total: result.length, totalPages: 1 } }) }).catch(() => {});
      } else if (url.pathname === '/api/deck/render') {
        renders.push(JSON.parse(request.postData()));
        await request.respond({ status: 200, contentType: 'application/json',
          body: JSON.stringify(renderFails ? { ok: false, error: 'Fixture failure' }
            : { ok: true, ready: true, imageUrl: 'https://api.blizzcore.ru/static/generated/fixture.png' }) });
      } else if (url.pathname.startsWith('/api/public-resource/deckview/')) {
        await request.respond({ status: 200, contentType: 'image/png', body: image });
      } else if (url.pathname.startsWith('/api/public-resource/db/')) {
        const tile = url.pathname.includes('/card-tiles/');
        await request.respond({ status: 200, contentType: 'image/svg+xml',
          body: `<svg xmlns="http://www.w3.org/2000/svg" width="${tile ? 320 : 180}" height="${tile ? 64 : 250}"><rect width="100%" height="100%" fill="#715022"/></svg>` });
      } else await request.continue();
    });
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${runtime.origin}/standard/deck-builder/`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.hp-builder-card');
    assert.equal(await page.$('.arena-paywall'), null);
    await page.click('button[aria-label="Добавить: Огненный шар"]');
    await page.click('button[aria-label="Добавить: Огненный шар, в колоде 1"]');
    assert.equal(await page.$eval('button[aria-label="Добавить: Огненный шар, в колоде 2"]', node => node.disabled), true);
    await page.click('button[aria-label="Добавить: Изисет"]');
    assert.equal(await page.$eval('button[aria-label="Добавить: Изисет, в колоде 1"]', node => node.disabled), true);
    assert.equal(await page.$eval('[aria-label="Карт в колоде: 3 из 30"]', node => node.textContent), '3/30');
    assert.match(await page.$eval('.hp-builder-tile img', node => node.src), /\/api\/public-resource\/db\/uploads\/card-tiles\//);
    await page.type('input[aria-label="Поиск карт"]', 'slow');
    await page.waitForFunction(() => document.querySelector('.hp-builder-skeletons') !== null);
    await delay(300);
    await page.focus('input[aria-label="Поиск карт"]');
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.type('input[aria-label="Поиск карт"]', 'кроколиск');
    await page.waitForSelector('button[aria-label="Добавить: Речной кроколиск"]').catch(async error => {
      throw new Error(`${error.message}; input=${await page.$eval('input[aria-label="Поиск карт"]', node => node.value)}; queries=${JSON.stringify(queries)}`);
    });
    await delay(700);
    assert.equal(await page.$('button[aria-label*="Устаревший ответ"]'), null);
    assert.equal(await page.$$('.hp-builder-row').then(rows => rows.length), 2);
    await page.select('.hp-builder-context label:first-child select', 'WARRIOR');
    await page.waitForSelector('.hp-builder-reset');
    await page.click('.hp-builder-reset button:last-child');
    assert.equal(await page.$eval('.hp-builder-context label:first-child select', node => node.value), 'MAGE');
    await page.click('.hp-builder-save');
    await page.waitForSelector('.hp-builder-feedback.is-error');
    assert.equal(readdirSync(downloads).length, 0);
    renderFails = false;
    await page.click('.hp-builder-save');
    await page.waitForFunction(() => document.querySelector('.hp-builder-feedback')?.textContent.includes('сохранена'));
    for (let i = 0; i < 40 && !readdirSync(downloads).some(file => file.endsWith('.png')); i++) await delay(50);
    assert.deepEqual(readFileSync(join(downloads, 'Моя колода.png')), image);
    const decoded = decode(renders.at(-1).deckCode);
    assert.deepEqual(decoded.heroes, [637]);
    assert.equal(decoded.format, 2);
    assert.deepEqual(decoded.cards, [[315, 2], [129851, 1]]);
    for (const width of [768, 390, 320]) {
      await page.setViewport({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
      if (width < 768) {
        await page.click('.hp-builder-mobile-switch button:last-child');
        assert.equal(await page.$eval('.hp-builder-deck', node => getComputedStyle(node).display), 'flex');
        await page.click('button[aria-label="Убрать: Огненный шар"]');
        await page.click('.hp-builder-mobile-switch button:first-child');
        assert.equal(await page.$eval('.hp-builder-gallery', node => getComputedStyle(node).display), 'block');
      }
    }
    await page.evaluate(axe);
    const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
    assert.deepEqual(violations, []);
    await page.select('.hp-builder-context label:nth-child(2) select', 'wild');
    await page.click('.hp-builder-reset button:first-of-type');
    await page.waitForFunction(() => document.querySelector('.hp-builder-context label:nth-child(2) select').value === 'wild');
    assert.equal(await page.$$('.hp-builder-row').then(rows => rows.length), 0);
    assert.ok(queries.some(query => query.deckClass === 'MAGE' && query.format === 'standard'));
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
    rmSync(downloads, { recursive: true, force: true });
  }
});
