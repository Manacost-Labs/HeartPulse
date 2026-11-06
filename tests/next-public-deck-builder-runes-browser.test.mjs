import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';
import { role } from './helpers/browserUserView.mjs';
import { cards, image } from './helpers/publicDeckBuilderData.mjs';

test('runes gate Death Knight cards and tourists expose only the permitted guest set', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
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
