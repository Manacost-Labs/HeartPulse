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
    let largePool = false;
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (['error', 'warn'].includes(message.type())) errors.push(message.text()); });
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/constructed-cards') {
        queries.push(Object.fromEntries(url.searchParams));
        const query = url.searchParams.get('query') ?? '';
        if (query === 'slow') await delay(600);
        const result = largePool ? [...Array.from({ length: 20 }, (_, index) => ({ ...cards[0],
          card_id: `CARD_${index}`, dbf: 300 + index, name: { ru: `Карта ${index}` } })),
          { ...cards[2], card_id: 'REV_018', dbf: 79767, rarity: 'LEGENDARY', name: { ru: 'Принц Ренатал' } }]
          : query === 'slow' ? [{ ...cards[0], name: { ru: 'Устаревший ответ' } }]
          : cards.filter(card => card.name.ru.toLowerCase().includes(query.toLowerCase()));
        await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ cards: result,
          facets: { sets: ['CORE'], types: ['MINION', 'SPELL'], mechanics: ['TAUNT'], minionTypes: ['BEAST'], spellSchools: ['FIRE'] },
          mechanicTranslations: { TAUNT: 'Провокация' },
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
    await page.click('button[aria-label="Мана: 4"]');
    await page.waitForFunction(() => document.querySelector('button[aria-label="Мана: 4"]').getAttribute('aria-pressed') === 'true');
    await page.select('.hp-builder-filter-toolbar > label select', 'CORE');
    await page.select('.hp-builder-sort select', 'set');
    await page.click('button[aria-label="Порядок: по возрастанию"]');
    await page.click('.hp-builder-extra-filters summary');
    await page.select('.hp-builder-extra-filters label:nth-child(3) select', 'TAUNT');
    await page.waitForFunction(() => !document.querySelector('.hp-builder-skeletons'));
    await delay(300);
    assert.ok(queries.some(query => query.mana === '4' && query.set === 'CORE' && query.sort === 'set'
      && query.direction === 'desc' && query.mechanic === 'TAUNT'));
    await Promise.all([
      page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === '/api/constructed-cards' && url.searchParams.get('sort') === 'mana'
          && !url.searchParams.has('mana') && !url.searchParams.has('set') && !url.searchParams.has('mechanic');
      }),
      page.click('.hp-builder-clear-filters'),
    ]);
    await page.waitForSelector('button[aria-label="Добавить: Огненный шар"]');
    await page.click('.hp-builder-extra-filters summary');
    assert.equal(await page.$eval('button[aria-label="Любая мана"]', node => node.getAttribute('aria-pressed')), 'true');
    await page.click('button[aria-label="Добавить: Огненный шар"]');
    await page.click('button[aria-label="Добавить: Огненный шар, в колоде 1"]');
    assert.equal(await page.$eval('button[aria-label="Добавить: Огненный шар, в колоде 2"]', node => node.disabled), true);
    await page.click('button[aria-label="Добавить: Изисет"]');
    assert.equal(await page.$eval('button[aria-label="Добавить: Изисет, в колоде 1"]', node => node.disabled), true);
    assert.equal(await page.$eval('[aria-label="Карт в колоде: 3 из 30"]', node => node.textContent), '3/30');
    assert.match(await page.$eval('.hp-builder-tile img', node => node.src), /\/api\/public-resource\/db\/uploads\/card-tiles\//);
    assert.equal(await page.evaluate(() => Math.abs(document.querySelector('.hp-builder-tile').getBoundingClientRect().width
      - document.querySelector('.hp-builder-row').getBoundingClientRect().width) < 1), true);
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
    await page.click('.hp-builder-secondary-actions button:first-child');
    await page.setViewport({ width: 320, height: 720 });
    assert.equal(await page.$eval('.hp-builder-code-dialog', node => node.checkVisibility()), true,
      'open code stays visible when desktop collection becomes the phone panel');
    await page.keyboard.press('Escape');
    await page.setViewport({ width: 1440, height: 900 });
    for (const width of [768, 390, 320]) {
      await page.setViewport({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
      if (width < 768) {
        await page.click('.hp-builder-mobile-switch button:last-child');
        assert.equal(await page.$eval('.hp-builder-deck', node => node.checkVisibility()), true);
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
    largePool = true;
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('button[aria-label="Добавить: Карта 0"]');
    for (let index = 0; index < 15; index++) {
      await page.click(`button[aria-label="Добавить: Карта ${index}"]`);
      await page.click(`button[aria-label="Добавить: Карта ${index}, в колоде 1"]`);
    }
    await page.click('.hp-builder-mobile-switch button:last-child');
    assert.equal(await page.evaluate(() => {
      const list = document.querySelector('.hp-builder-deck-list');
      const deck = document.querySelector('.hp-builder-deck');
      const save = document.querySelector('.hp-builder-save');
      return list.scrollHeight <= list.clientHeight + 1
        && getComputedStyle(deck).maxHeight === 'none'
        && save.getBoundingClientRect().bottom <= deck.getBoundingClientRect().bottom;
    }), true, 'full phone deck grows to fit all rows with actions after the list');
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewport({ width, height: 720 });
      const layout = await page.evaluate(() => {
        const list = document.querySelector('.hp-builder-deck-list');
        const rows = [...list.children];
        return { height: list.clientHeight, rowHeight: rows[0].getBoundingClientRect().height,
          allRowsFit: rows.at(-1).getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom,
          natural: list.scrollHeight <= list.clientHeight + 1,
          ordered: rows.every((row, index) => !index || row.offsetTop > rows[index - 1].offsetTop),
          overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.ok(layout.height >= layout.rowHeight * 3, `at least three full tiles visible at ${width}: ${JSON.stringify(layout)}`);
      assert.equal(layout.ordered, true, 'selected cards run down the list');
      assert.equal(layout.allRowsFit && layout.natural, true, `all cards fit without nested scrolling at ${width}`);
      assert.equal(layout.overflow, false);
      await page.click('.hp-builder-secondary-actions button:first-child');
      await page.waitForSelector('.hp-builder-code-dialog[open]');
      assert.equal(await page.evaluate(() => {
        const dialog = document.querySelector('.hp-builder-code-dialog').getBoundingClientRect();
        const field = document.querySelector('.hp-builder-code-dialog textarea').getBoundingClientRect();
        return dialog.left >= 0 && dialog.right <= innerWidth && dialog.top >= 0 && dialog.bottom <= innerHeight
          && field.left >= dialog.left && field.right <= dialog.right && field.bottom <= dialog.bottom;
      }), true, `deck code stays on screen at ${width}`);
      await page.keyboard.press('Escape');
    }
    await page.click('.hp-builder-mobile-switch button:first-child');
    await page.click('button[aria-label="Добавить: Принц Ренатал"]');
    for (let index = 15; index < 20; index++) {
      await page.click(`button[aria-label="Добавить: Карта ${index}"]`);
      if (index < 19) await page.click(`button[aria-label="Добавить: Карта ${index}, в колоде 1"]`);
    }
    await page.click('.hp-builder-mobile-switch button:last-child');
    assert.ok(await page.$('[aria-label="Карт в колоде: 40 из 40"]'));
    await page.click('button[aria-label="Управление картой: Принц Ренатал"]');
    await page.click('button[aria-label="Убрать: Принц Ренатал"]');
    assert.ok(await page.$('[aria-label="Карт в колоде: 39 из 30"]'));
    assert.equal(await page.$eval('.hp-builder-save', button => button.disabled), true);
    assert.equal(await page.$eval('.hp-builder-secondary-actions button:first-child', button => button.disabled), true);
    assert.ok(queries.some(query => query.deckClass === 'MAGE' && query.format === 'standard'));
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
    rmSync(downloads, { recursive: true, force: true });
  }
});

test('runes gate Death Knight cards and tourists expose only the permitted guest set', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    const queries = [];
    const errors = [];
    const runeCard = { ...cards[0], card_id: 'DK_CARD', dbf: 78338, class: 'DEATHKNIGHT', name: { ru: 'Чары крови' } };
    const tourist = { ...cards[0], card_id: 'VAC_424', dbf: 107187, rarity: 'LEGENDARY', card_set: 'ISLAND_VACATION',
      name: { ru: 'Райла' }, text: { ru: 'Турист-паладин' } };
    const guest = { ...cards[0], card_id: 'VAC_435', dbf: 105679, class: 'PALADIN', card_set: 'ISLAND_VACATION', name: { ru: 'Гостевой заклинатель' } };
    const chain = { ...guest, card_id: 'VAC_507', dbf: 105682, name: { ru: 'Линесса' }, text: { ru: 'Турист-разбойник' } };
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/public-resource/hsjson-api/v1/latest/enUS/cards.collectible.json') {
        await request.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([
          { id: 'DK_CARD', runeCost: { blood: 2 } },
          { id: 'VAC_424', set: 'ISLAND_VACATION', text: '<b>Paladin Tourist</b>' },
          { id: 'VAC_507', set: 'ISLAND_VACATION', text: '<b>Rogue Tourist</b>' },
        ]) });
      } else if (url.pathname === '/api/constructed-cards') {
        queries.push(Object.fromEntries(url.searchParams));
        const pool = url.searchParams.get('deckClass') === 'DEATHKNIGHT' ? [runeCard, cards[2]]
          : url.searchParams.get('deckClass') === 'PALADIN' ? [guest, chain, { ...guest, card_id: 'CORE_OTHER', dbf: 12, card_set: 'CORE', name: { ru: 'Другой набор' } }]
          : [tourist, cards[2]];
        await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ cards: pool, facets: { sets: url.searchParams.get('query') ? [] : ['CORE'] },
          pagination: { total: pool.length, totalPages: 1 } }) });
      } else if (url.pathname.startsWith('/api/public-resource/db/')) {
        await request.respond({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="64"><rect width="320" height="64" fill="#715022"/></svg>' });
      } else await request.continue();
    });
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${runtime.origin}/standard/deck-builder/`, { waitUntil: 'networkidle2' });
    await page.select('.hp-builder-context label:first-child select', 'DEATHKNIGHT');
    await page.waitForSelector('button[aria-label="Добавить: Чары крови"]');
    await page.waitForFunction(() => !document.querySelector('.hp-builder-legality [role="status"]'));
    assert.equal(await page.$eval('button[aria-label="Добавить: Чары крови"]', button => button.disabled), true);
    await page.select('.hp-builder-legality label:first-of-type select', '3');
    assert.equal(await page.$eval('.hp-builder-legality label:nth-of-type(2) select', field => field.value), '0');
    await page.click('button[aria-label="Добавить: Чары крови"]');
    assert.equal(await page.$eval('.hp-builder-save', button => button.disabled), false);
    await page.select('.hp-builder-legality label:nth-of-type(2) select', '2');
    assert.equal(await page.$eval('.hp-builder-save', button => button.disabled), true);
    await page.click('button[aria-label="Управление картой: Чары крови"]');
    await page.click('button[aria-label="Убрать: Чары крови"]');
    await page.select('.hp-builder-context label:first-child select', 'MAGE');
    await page.waitForSelector('button[aria-label="Добавить: Райла"]');
    await page.click('button[aria-label="Добавить: Райла"]');
    await page.waitForFunction(() => document.querySelector('option[value="tourist"]'));
    await page.click('.hp-builder-extra-filters summary');
    await page.select('.hp-builder-extra-filters label:last-child select', 'tourist');
    await page.waitForSelector('button[aria-label="Добавить: Гостевой заклинатель"]');
    assert.equal(await page.$('button[aria-label="Добавить: Другой набор"]'), null);
    assert.equal(await page.$eval('button[aria-label="Добавить: Линесса"]', button => button.disabled), true);
    assert.equal(await page.$eval('.hp-builder-filter-toolbar > label select', field => field.disabled), true);
    await page.click('button[aria-label="Добавить: Гостевой заклинатель"]');
    assert.equal(await page.$eval('.hp-builder-save', button => button.disabled), false);
    await page.click('button[aria-label="Управление картой: Райла"]');
    await page.click('button[aria-label="Убрать: Райла"]');
    assert.equal(await page.$eval('.hp-builder-save', button => button.disabled), true);
    assert.ok(queries.some(query => query.deckClass === 'PALADIN' && query.class === 'PALADIN' && query.set === 'ISLAND_VACATION'));
    await page.setViewport({ width: 320, height: 740 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});

test('Zilliax modules and ETC band are encoded as sideboards, enforce restrictions and can be edited on phones', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    const errors = [];
    const renders = [];
    let configFails = true;
    const owners = [
      { ...cards[2], card_id: 'ETC_080', dbf: 90749, name: { ru: 'E.T.C., менеджер группы' }, rarity: 'LEGENDARY' },
      { ...cards[2], card_id: 'TOY_330', dbf: 102983, name: { ru: 'Зиллиакс Делюкс 3000' }, rarity: 'LEGENDARY', mana_cost: 0 },
    ];
    const pool = [...cards, ...owners, { ...cards[0], card_id: 'CS2_024', dbf: 662, name: { ru: 'Ледяная стрела' } }];
    const modules = Array.from({ length: 8 }, (_, index) => ({ ...cards[2], card_id: `TOY_330t${92 + index}`,
      dbf: 104944 + index, name: { ru: `Модуль ${index}` }, mana_cost: index + 1, attack: 1, health: 2 }));
    const art = [0, 1].map(index => ({ ...cards[2], card_id: `TOY_330t${5 + index}`, dbf: 110440 + index, mana_cost: 0 }));
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/constructed-cards') {
        await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ cards: pool, facets: { sets: url.searchParams.get('query') ? [] : ['CORE'] },
          pagination: { total: pool.length, totalPages: 1 } }) });
      } else if (url.pathname === '/api/constructed-cards/ETC_080') {
        await request.respond({ status: configFails ? 503 : 200, contentType: 'application/json', body: JSON.stringify({ card: {
          ...owners[0], wiki: { generated_card_pools: [{ pool: "Cards banned from E.T.C.'s band", card_ids: ['ETC_080', 'TOY_330', 'REV_018'] }] },
        } }) });
      } else if (url.pathname === '/api/constructed-cards/TOY_330') {
        await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ card: {
          ...owners[1], related_cards_localized: [{ cards: [...modules, ...art] }],
        } }) });
      } else if (url.pathname === '/api/deck/render') {
        renders.push(JSON.parse(request.postData()));
        await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true,
          ready: true, imageUrl: 'https://api.blizzcore.ru/static/generated/fixture.png' }) });
      } else if (url.pathname.startsWith('/api/public-resource/deckview/')) {
        await request.respond({ status: 200, contentType: 'image/png', body: image });
      } else if (url.pathname.startsWith('/api/public-resource/db/')) {
        await request.respond({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="64"><rect width="320" height="64" fill="#715022"/></svg>' });
      } else await request.continue();
    });
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${runtime.origin}/standard/deck-builder/`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('button[aria-label="Добавить: E.T.C., менеджер группы"]');
    await page.click('button[aria-label="Добавить: Огненный шар"]');
    await page.click('button[aria-label="Добавить: E.T.C., менеджер группы"]');
    assert.equal(await page.$eval('.hp-builder-save', button => button.disabled), true);
    await page.waitForSelector('.hp-builder-filter-toolbar > label select option[value="CORE"]');
    await page.select('.hp-builder-filter-toolbar > label select', 'CORE');
    await page.type('input[aria-label="Поиск карт"]', 'основная');
    await page.click('button[aria-label="Настроить: E.T.C., менеджер группы"]');
    await page.waitForSelector('.hp-builder-configuration [role="alert"]');
    configFails = false;
    await page.click('.hp-builder-configuration [role="alert"] button');
    await page.waitForSelector('button[aria-label="Добавить в E.T.C.: Огненный шар"]');
    assert.equal(await page.$eval('.hp-builder-configuration input[type=search]', field => field.value), '');
    await page.type('.hp-builder-configuration input[type=search]', 'группа');
    await page.waitForSelector('button[aria-label="Добавить в E.T.C.: Зиллиакс Делюкс 3000"]');
    assert.equal(await page.$eval('button[aria-label="Добавить в E.T.C.: Зиллиакс Делюкс 3000"]', button => button.disabled), true);
    await page.click('button[aria-label="Добавить в E.T.C.: Огненный шар"]');
    assert.equal(await page.$eval('button[aria-label="Добавить в E.T.C.: Огненный шар, в группе 1"]', button => button.disabled), true);
    await page.click('button[aria-label="Добавить в E.T.C.: Речной кроколиск"]');
    await page.click('button[aria-label="Добавить в E.T.C.: Ледяная стрела"]');
    assert.equal(await page.$eval('[aria-label="Карт в колоде: 2 из 30"]', node => node.textContent), '2/30');
    await page.click('.hp-builder-configuration-heading button');
    await page.waitForSelector('button[aria-label="Добавить: Огненный шар, в колоде 1"]');
    assert.equal(await page.$eval('button[aria-label="Добавить: Огненный шар, в колоде 1"]', button => button.disabled), true);
    assert.equal(await page.$eval('input[aria-label="Поиск карт"]', field => field.value), 'основная');
    assert.equal(await page.$eval('.hp-builder-filter-toolbar > label select', field => field.value), 'CORE');
    await page.click('button[aria-label="Настроить: E.T.C., менеджер группы"]');
    await page.waitForSelector('.hp-builder-configuration input[type=search]');
    assert.equal(await page.$eval('.hp-builder-configuration input[type=search]', field => field.value), 'группа');
    await page.keyboard.press('Escape');
    await page.waitForSelector('button[aria-label="Добавить: Зиллиакс Делюкс 3000"]');
    await page.click('button[aria-label="Добавить: Зиллиакс Делюкс 3000"]');
    await page.setViewport({ width: 390, height: 844 });
    await page.click('.hp-builder-mobile-switch button:last-child');
    await page.click('button[aria-label="Настроить: Зиллиакс Делюкс 3000"]');
    await page.waitForSelector('button[aria-label="Модуль: Модуль 0"]');
    assert.equal(await page.$eval('.hp-builder', node => node.dataset.panel), 'deck');
    await page.click('button[aria-label="Модуль: Модуль 0"]');
    await page.click('button[aria-label="Модуль: Модуль 7"]');
    assert.equal(await page.$eval('button[aria-label="Модуль: Модуль 2"]', button => button.disabled), true);
    await page.click('button[aria-label="Облик Зиллиакса: 2"]');
    assert.equal(await page.$eval('button[aria-label="Облик Зиллиакса: 2"]', node => node.getAttribute('aria-pressed')), 'true');
    assert.equal(await page.$eval('.hp-builder-config-result', node => node.textContent.includes('9 маны')), true);
    await page.addScriptTag({ content: axe });
    const violations = await page.evaluate(async () => (await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    })).violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })));
    assert.deepEqual(violations, [], 'module dialog is accessible on phones');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('.hp-builder-configuration')), true, 'keyboard focus stays in the modal');
    await page.click('.hp-builder-configuration-heading button');
    await page.click('.hp-builder-mobile-switch button:last-child');
    assert.equal(await page.$eval('[aria-label="Карт в колоде: 3 из 30"]', node => node.textContent), '3/30');
    await page.click('.hp-builder-save');
    await page.waitForFunction(() => document.querySelector('.hp-builder-feedback')?.textContent.includes('сохранена'));
    const decoded = decode(renders.at(-1).deckCode);
    assert.deepEqual(decoded.cards, [[315, 1], [90749, 1], [102983, 1]]);
    assert.deepEqual(decoded.sideboards, [
      { keyCardDbfId: 90749, cards: [[315, 1], [662, 1], [1368, 1]] },
      { keyCardDbfId: 102983, cards: [[104944, 1], [104951, 1], [110441, 1]] },
    ]);
    await page.click('button[aria-label="Управление картой: Зиллиакс Делюкс 3000"]');
    await page.click('button[aria-label="Убрать: Зиллиакс Делюкс 3000"]');
    await page.click('.hp-builder-secondary-actions button:first-child');
    assert.equal(decode(await page.$eval('.hp-builder-code-dialog textarea', field => field.value)).sideboards.length, 1);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
