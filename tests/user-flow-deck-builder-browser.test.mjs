import assert from 'node:assert/strict';
import test from 'node:test';
import { decode } from '@firestone-hs/deckstrings';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';
import {
  allowClipboard, clickByRole, clipboardText, findByRole, isDisabled, launchUserBrowser, role, waitForFocus,
} from './helpers/browserUserView.mjs';

// Пятнадцать обычных карт мага из фикстуры: первая страница каталога по мане.
const DECK = ['1', '10', '100', '1000', '1001', '1002', '1003', '1004', '1005', '1006', '1007', '1008', '1009', '101', '1010']
  .map(number => `Публичная карта ${number}`);

test('a guest fills a deck to 30 cards, hits the copy and size limits, removes a card and copies the deck code', { timeout: 180_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  try {
    browser = await launchUserBrowser();
    await allowClipboard(browser, runtime.origin);
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${runtime.origin}/standard/deck-builder/`, { waitUntil: 'domcontentloaded' });
    await findByRole(page, 'heading', 'Конструктор колод');
    const deck = await findByRole(page, 'complementary', 'Ваша колода');
    await page.waitForSelector(`${role('region', 'Карты')} ::-p-text(3000 в коллекции)`);
    assert.equal(await isDisabled(page, 'button', 'Код колоды'), true, 'an empty deck has no code');

    for (const card of DECK) {
      await clickByRole(page, 'button', `Добавить: ${card}`);
      await clickByRole(page, 'button', `Добавить: ${card}, в колоде 1`);
      await findByRole(page, 'button', `Добавить: ${card}, в колоде 2`);
    }
    assert.equal(await isDisabled(page, 'button', 'Добавить: Публичная карта 1, в колоде 2'), true, 'a common card stops at two copies');
    await deck.waitForSelector('::-p-text(Все карты на месте)');
    assert.match(await deck.evaluate(node => node.innerText), /30\s*\/\s*30/);
    assert.equal(await isDisabled(page, 'button', 'Добавить: Публичная карта 1011'), true, 'a full deck takes no 31st card');

    await clickByRole(page, 'button', 'Управление картой: Публичная карта 1');
    await clickByRole(page, 'button', 'Убрать: Публичная карта 1');
    await deck.waitForSelector('::-p-text(Свободных мест: 1)');
    assert.equal(await isDisabled(page, 'button', 'Добавить: Публичная карта 1011'), false, 'a freed slot takes a card again');
    await clickByRole(page, 'button', 'Добавить: Публичная карта 1011');
    await deck.waitForSelector('::-p-text(Все карты на месте)');

    await clickByRole(page, 'button', 'Код колоды');
    const dialog = await findByRole(page, 'dialog', 'Код колоды');
    await waitForFocus(page, 'button', 'Закрыть код колоды');
    await clickByRole(page, 'button', 'Скопировать код');
    const code = await clipboardText(page);
    assert.equal(code, await dialog.$eval('textarea', field => field.value), 'the copied code is the one shown');
    assert.deepEqual(decode(code), {
      cards: [[12345, 1], [20009, 2], [20099, 2], [20100, 2], [20999, 2], [21000, 2], [21001, 2], [21002, 2], [21003, 2],
        [21004, 2], [21005, 2], [21006, 2], [21007, 2], [21008, 2], [21009, 2], [21010, 1]],
      heroes: [637], format: 2, sideboards: undefined,
    });

    await page.keyboard.press('Escape');
    await page.waitForSelector(role('dialog', 'Код колоды'), { hidden: true });
    await waitForFocus(page, 'button', 'Код колоды');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
