import assert from 'node:assert/strict';
import test from 'node:test';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';
import {
  clickByRole, findByRole, launchUserBrowser, role, typeByRole, waitForFocus, waitForPath, waitForRoleGone,
} from './helpers/browserUserView.mjs';

test('a guest finds a card by name, opens it, views the art full size and closes it back to the art button', { timeout: 180_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  try {
    browser = await launchUserBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${runtime.origin}/standard/cards/`, { waitUntil: 'domcontentloaded' });
    await findByRole(page, 'heading', 'Карты');

    await typeByRole(page, 'searchbox', 'Поиск карт', 'карта 2999');
    await page.waitForSelector(`${role('region', 'Фильтры библиотеки карт')} ::-p-text(Найдено: 1)`);
    await page.waitForFunction(() => new URLSearchParams(location.search).get('query') === 'карта 2999');
    await waitForRoleGone(page, 'link', 'Скачать карту «Публичная карта 1» в полном качестве');
    await findByRole(page, 'link', 'Скачать карту «Публичная карта 2999» в полном качестве');

    await page.click('main a ::-p-text(Публичная карта 2999)');
    await waitForPath(page, '/standard/cards/standard/CARD_QA_2999/');
    await findByRole(page, 'heading', 'Публичная карта 2999');

    await clickByRole(page, 'button', 'Открыть Публичная карта 2999 в полном размере');
    await findByRole(page, 'dialog', 'Обычная карта');
    await waitForFocus(page, 'button', 'Закрыть');
    await page.keyboard.press('Escape');
    await waitForRoleGone(page, 'dialog', 'Обычная карта');
    await waitForFocus(page, 'button', 'Открыть Публичная карта 2999 в полном размере');

    await clickByRole(page, 'button', 'Назад к картам');
    await waitForPath(page, '/standard/cards/standard/');
    await findByRole(page, 'link', 'Скачать карту «Публичная карта 2999» в полном качестве');
    assert.equal(await page.$eval(role('searchbox', 'Поиск карт'), field => field.value), 'карта 2999', 'the search survives the way back');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
