import assert from 'node:assert/strict';
import test from 'node:test';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';
import { CONTROL_WARRIOR_DECK_CODE, metaExternalRoutes } from './helpers/browserMetaFixture.mjs';
import {
  allowClipboard, clickByRole, clipboardText, findByRole, launchUserBrowser, mainText, role, typeByRole, waitForPath, waitForPressed,
} from './helpers/browserUserView.mjs';

// Подписчик на локальном стенде: настоящие Next, Express и SQLite, внешний
// hs-data-api — фикстура меты и архетипов.
async function subscriberPage(runtime, browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const [name, value] = runtime.cookie.split('=');
  await page.setCookie({ name, value, url: runtime.origin });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return { page, errors };
}

/** Заголовки карточек архетипов в списке с этим именем. */
function metaArchetypeHeadings(page, listName) {
  return page.$$eval(`${role('region', listName)} h2`, headings => headings.map(heading => heading.textContent));
}

test('a subscriber goes from the home page through the meta tier list to an archetype and copies its deck code', { timeout: 180_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, externalRoutes: metaExternalRoutes });
  let browser;
  try {
    runtime.grant();
    browser = await launchUserBrowser();
    await allowClipboard(browser, runtime.origin);
    const { page, errors } = await subscriberPage(runtime, browser);
    await page.goto(`${runtime.origin}/`, { waitUntil: 'domcontentloaded' });

    await findByRole(page, 'region', 'Лучшие колоды недели');
    await clickByRole(page, 'link', 'Вся мета');
    await waitForPath(page, '/standard/meta/');
    await findByRole(page, 'heading', 'Мета');

    await clickByRole(page, 'button', 'Тиры');
    await waitForPressed(page, 'Тиры');
    const tierA = await findByRole(page, 'region', 'Тир A');
    await (await tierA.waitForSelector('a ::-p-text(Контроль Воин)')).click();
    await waitForPath(page, '/standard/archetypes/standard/control-warrior/');
    await findByRole(page, 'heading', 'Контроль Воин');
    await findByRole(page, 'region', 'Сборки архетипа');
    assert.match(await mainText(page), /^1 сборка$/m, 'one build is counted in the singular');

    await clickByRole(page, 'button', 'Скопировать код колоды: сборка 1');
    await findByRole(page, 'button', 'Код скопирован: сборка 1');
    assert.equal(await clipboardText(page), CONTROL_WARRIOR_DECK_CODE, 'the deck code is ready to paste into Hearthstone');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});

test('a subscriber narrows the meta by rank and name, opens the archetype and filters the catalog by class', { timeout: 180_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, externalRoutes: metaExternalRoutes });
  let browser;
  try {
    runtime.grant();
    browser = await launchUserBrowser();
    const { page, errors } = await subscriberPage(runtime, browser);
    await page.goto(`${runtime.origin}/standard/meta/`, { waitUntil: 'domcontentloaded' });
    await findByRole(page, 'region', 'Архетипы: Стандарт, Алмаз — Легенда');
    await findByRole(page, 'heading', 'Большой Друид');
    assert.deepEqual(await metaArchetypeHeadings(page, 'Архетипы: Стандарт, Алмаз — Легенда'),
      ['Жрец на воровстве', 'Контроль Воин', 'Агро Охотник', 'Большой Друид']);

    await clickByRole(page, 'button', 'Легенда');
    await findByRole(page, 'region', 'Архетипы: Стандарт, Легенда');
    await waitForPressed(page, 'Легенда');
    await typeByRole(page, 'textbox', 'Поиск архетипа', 'Воин');
    await page.waitForSelector(role('heading', 'Жрец на воровстве'), { hidden: true });
    assert.deepEqual(await metaArchetypeHeadings(page, 'Архетипы: Стандарт, Легенда'), ['Контроль Воин']);

    await clickByRole(page, 'link', 'Открыть страницу архетипа: Контроль Воин');
    await waitForPath(page, '/standard/archetypes/standard/control-warrior/');
    await findByRole(page, 'heading', 'Контроль Воин');
    await page.click(`${role('navigation', 'Навигационная цепочка')} ${role('link', 'Архетипы')}`);
    await waitForPath(page, '/standard/archetypes/');
    // «4 архетипа», не «4 архетипов».
    await page.waitForSelector(`${role('region', 'Архетипы: Стандарт')} ::-p-text(4 архетипа)`, { visible: true });

    await clickByRole(page, 'button', 'Воин: 1 архетип');
    await waitForPressed(page, 'Воин: 1 архетип');
    await page.waitForSelector(role('heading', 'Жрец на воровстве'), { hidden: true });
    assert.deepEqual(await metaArchetypeHeadings(page, 'Архетипы: Стандарт'), ['Контроль Воин']);
    await clickByRole(page, 'link', 'Открыть страницу архетипа: Контроль Воин');
    await waitForPath(page, '/standard/archetypes/standard/control-warrior/');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
