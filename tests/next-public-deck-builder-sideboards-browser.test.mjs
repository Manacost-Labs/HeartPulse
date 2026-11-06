import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';
import { decode } from '@firestone-hs/deckstrings';
import { clickByRole, role } from './helpers/browserUserView.mjs';
import { cards, image, axe } from './helpers/publicDeckBuilderData.mjs';

test('Zilliax modules and ETC band are encoded as sideboards, enforce restrictions and can be edited on phones', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
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
    await page.waitForFunction(() => {
      const card = document.querySelector('button[aria-label="Добавить в E.T.C.: Огненный шар"]');
      return card && !card.disabled;
    });
    assert.equal(await page.$eval('.hp-builder-configuration input[type=search]', field => field.value), '');
    const bandGrid = await page.$('.hp-builder-configuration .hp-builder-card-grid');
    await page.type('.hp-builder-configuration input[type=search]', 'группа');
    assert.equal(await bandGrid.evaluate(node => node.isConnected), true);
    await page.waitForFunction(() => document.querySelector('.hp-builder-configuration-body [aria-busy]').getAttribute('aria-busy') === 'false');
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
    await page.waitForFunction(() => {
      const card = document.querySelector('button[aria-label="Добавить: Зиллиакс Делюкс 3000"]');
      return card && !card.disabled;
    });
    await page.click('button[aria-label="Добавить: Зиллиакс Делюкс 3000"]');
    await page.setViewport({ width: 390, height: 844 });
    await page.click(`${role('group', 'Панель конструктора')} ::-p-text(Колода ·)`);
    await page.click('button[aria-label="Настроить: Зиллиакс Делюкс 3000"]');
    await page.waitForSelector('button[aria-label="Модуль: Модуль 0"]');
    // The open configuration hides the page from the accessibility tree, so the switch is read by its ARIA state.
    assert.match(await page.$eval('[role="group"][aria-label="Панель конструктора"] [aria-pressed="true"]', button => button.textContent),
      /^Колода · /, 'the phone stays on the deck panel');
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
    await clickByRole(page, 'button', 'Сохранить картинку');
    await page.waitForSelector(`${role('complementary', 'Ваша колода')} [role="status"] ::-p-text(сохранена)`, { visible: true });
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
