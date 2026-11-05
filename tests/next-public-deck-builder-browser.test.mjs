import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { decode } from '@firestone-hs/deckstrings';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';
import { clickByRole, findByRole, role, waitForPressed } from './helpers/browserUserView.mjs';

import { cards, image, axe } from './helpers/publicDeckBuilderData.mjs';

/** Clears the card search the way a keyboard user does. */
async function replaceSearch(page) {
  await page.focus('input[aria-label="Поиск карт"]');
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
}

test('guest builder keeps selection across filters and mobile panels, confirms reset and downloads Deckview images', async context => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  const downloads = mkdtempSync(join(tmpdir(), 'public-deck-builder-'));
  let browser;
  try {
    const guest = await fetch(`${runtime.origin}/standard/deck-builder/`);
    assert.equal(guest.status, 200);
    assert.match(await guest.text(), /Конструктор колод/);
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    const errors = []; const queries = []; const renders = []; let renderFails = true;
    let largePool = false;
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      // The existing lazy shell emits this preload warning when its support surface appears.
      if (message.type() === 'warn' && /^The resource http:\/\/127\.0\.0\.1:\d+\/_next\/static\/css\/[a-f0-9]+\.css was preloaded using link preload but not used within a few seconds from the window's load event\./.test(message.text())) {
        context.diagnostic(`Existing shell CSS preload warning: ${message.text()}`);
      } else if (['error', 'warn'].includes(message.type())) errors.push(message.text());
    });
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/constructed-cards') {
        queries.push(Object.fromEntries(url.searchParams));
        const query = url.searchParams.get('query') ?? '';
        if (query === 'slow' || query === 'paged') await delay(query === 'slow' ? 600 : 300);
        const result = largePool ? [...Array.from({ length: 20 }, (_, index) => ({ ...cards[0],
          card_id: `CARD_${index}`, dbf: 300 + index, name: { ru: `Карта ${index}` } })),
          { ...cards[2], card_id: 'REV_018', dbf: 79767, rarity: 'LEGENDARY', name: { ru: 'Принц Ренатал' } }]
          : query === 'slow' ? [{ ...cards[0], name: { ru: 'Устаревший ответ' } }]
          : query === 'paged' ? cards
          : cards.filter(card => card.name.ru.toLowerCase().includes(query.toLowerCase()));
        await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ cards: result,
          facets: { sets: ['CORE'], types: ['MINION', 'SPELL'], mechanics: ['TAUNT'], minionTypes: ['BEAST'], spellSchools: ['FIRE'] },
          mechanicTranslations: { TAUNT: 'Провокация' },
          pagination: query === 'paged' ? { total: 60, totalPages: 3 } : { total: result.length, totalPages: 1 } }) }).catch(() => {});
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
    await page.waitForFunction(() => document.querySelector('.hp-builder-card-grid')?.getAttribute('aria-busy') === 'true');
    assert.equal(await page.$('.hp-builder-skeletons'), null);
    assert.ok(await page.$('button[aria-label="Добавить: Речной кроколиск"]'));
    assert.equal(await page.$eval('button[aria-label="Добавить: Речной кроколиск"]', node => node.disabled), true);
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
    // Paging from the keyboard keeps focus on the button, also on the last page.
    await replaceSearch(page);
    await page.type('input[aria-label="Поиск карт"]', 'paged');
    await page.waitForSelector('.hp-builder-pagination button:last-child');
    await page.focus('.hp-builder-pagination button:last-child');
    for (const pageNumber of ['2', '3']) {
      // Right after the press the counter already shows the new page while the
      // grid is not yet busy: wait for that page's answer, or the next press
      // lands while it loads and is ignored.
      await Promise.all([
        page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === '/api/constructed-cards' && url.searchParams.get('query') === 'paged'
            && url.searchParams.get('page') === pageNumber;
        }),
        page.keyboard.press('Enter'),
      ]);
      await page.waitForFunction(number => document.querySelector('.hp-builder-pagination span')?.textContent === `${number} / 3`
        && document.querySelector('.hp-builder-card-grid')?.getAttribute('aria-busy') === 'false', {}, pageNumber);
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Далее', `focus after page ${pageNumber}`);
    }
    assert.equal(await page.$eval('.hp-builder-pagination button:last-child', node => node.getAttribute('aria-disabled')), 'true');
    await page.keyboard.press('Enter');
    await delay(400);
    assert.equal(await page.$eval('.hp-builder-pagination span', node => node.textContent), '3 / 3');
    await replaceSearch(page);
    await page.type('input[aria-label="Поиск карт"]', 'кроколиск');
    await page.waitForFunction(() => !document.querySelector('.hp-builder-pagination')
      && document.querySelector('button[aria-label^="Добавить: Речной кроколиск"]'));
    await page.select('.hp-builder-context label:first-child select', 'WARRIOR');
    await clickByRole(page, 'button', 'Оставить колоду');
    assert.equal(await page.$eval('.hp-builder-context label:first-child select', node => node.value), 'MAGE');
    await clickByRole(page, 'button', 'Сохранить картинку');
    await page.waitForSelector(`${role('complementary', 'Ваша колода')} [role="alert"]`, { visible: true });
    assert.equal(readdirSync(downloads).length, 0);
    renderFails = false;
    await clickByRole(page, 'button', 'Сохранить картинку');
    await page.waitForSelector(`${role('complementary', 'Ваша колода')} [role="status"] ::-p-text(сохранена)`, { visible: true });
    for (let i = 0; i < 40 && !readdirSync(downloads).some(file => file.endsWith('.png')); i++) await delay(50);
    assert.deepEqual(readFileSync(join(downloads, 'Моя колода.png')), image);
    const decoded = decode(renders.at(-1).deckCode);
    assert.deepEqual(decoded.heroes, [637]);
    assert.equal(decoded.format, 2);
    assert.deepEqual(decoded.cards, [[315, 2], [129851, 1]]);
    await clickByRole(page, 'button', 'Код колоды');
    await page.setViewport({ width: 320, height: 720 });
    await findByRole(page, 'dialog', 'Код колоды', 2_000)
      .catch(() => assert.fail('open code stays visible when desktop collection becomes the phone panel'));
    await page.keyboard.press('Escape');
    await page.setViewport({ width: 1440, height: 900 });
    await page.keyboard.down('Control');
    await page.keyboard.press('End');
    await page.keyboard.up('Control');
    await page.waitForSelector('.support-prompt');
    assert.equal(await page.$eval('.support-prompt', node => getComputedStyle(node).position), 'static');
    assert.equal(await page.evaluate(() => document.querySelector('.support-prompt').getBoundingClientRect().top
      >= document.querySelector('#main-content').getBoundingClientRect().bottom), true,
    'the delayed support invitation stays below the workbench instead of covering deck cards');
    for (const width of [768, 390, 320]) {
      await page.setViewport({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
      if (width < 768) {
        await page.click(`${role('group', 'Панель конструктора')} ::-p-text(Колода ·)`);
        await findByRole(page, 'complementary', 'Ваша колода');
        await page.click('button[aria-label="Убрать: Огненный шар"]');
        await page.click(`${role('group', 'Панель конструктора')} ${role('button', 'Карты')}`);
        await waitForPressed(page, 'Карты');
        await findByRole(page, 'region', 'Карты');
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
    assert.ok(await page.$('button[aria-label="Добавить: Карта 14"] img[data-gallery-src]'),
      'distant full card renders wait until the user approaches them');
    for (let index = 0; index < 15; index++) {
      await page.click(`button[aria-label="Добавить: Карта ${index}"]`);
      await page.click(`button[aria-label="Добавить: Карта ${index}, в колоде 1"]`);
    }
    await page.waitForFunction(() => !document.querySelector('button[aria-label="Добавить: Карта 14, в колоде 2"] img').hasAttribute('data-gallery-src'));
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
