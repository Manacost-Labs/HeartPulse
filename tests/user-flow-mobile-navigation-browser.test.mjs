import assert from 'node:assert/strict';
import test from 'node:test';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';
import {
  ariaState, clickByRole, findByRole, launchUserBrowser, role, waitForFocus, waitForPath, waitForRoleGone,
} from './helpers/browserUserView.mjs';

const MENU = 'Мобильная навигация';
const inMenu = (name, accessibleName) => `${role('navigation', MENU)} ${role(name, accessibleName)}`;

test('on a 390 px phone a guest opens the menu, keeps focus inside it, closes it and moves between sections', { timeout: 180_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  try {
    browser = await launchUserBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${runtime.origin}/standard/cards/`, { waitUntil: 'domcontentloaded' });
    await findByRole(page, 'heading', 'Карты');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the page fits the phone');

    await clickByRole(page, 'button', 'Открыть меню');
    await findByRole(page, 'navigation', MENU);
    assert.equal(await ariaState(page, role('button', 'Закрыть меню'), 'aria-expanded'), 'true');
    await waitForFocus(page, 'link', 'Статьи');
    assert.equal(await ariaState(page, inMenu('link', 'Карты'), 'aria-current'), 'page', 'the menu marks the open section');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    await waitForFocus(page, 'link', 'Войти');

    await page.keyboard.press('Escape');
    await waitForRoleGone(page, 'navigation', MENU);
    await waitForFocus(page, 'button', 'Открыть меню');
    assert.equal(await ariaState(page, role('button', 'Открыть меню'), 'aria-expanded'), 'false');

    await clickByRole(page, 'button', 'Открыть меню');
    await page.click(inMenu('link', 'Мета'));
    await waitForPath(page, '/standard/meta/');
    await findByRole(page, 'heading', 'Мета');
    await waitForRoleGone(page, 'navigation', MENU);
    await clickByRole(page, 'button', 'Открыть меню');
    assert.equal(await ariaState(page, inMenu('link', 'Мета'), 'aria-current'), 'page');

    await page.click(inMenu('link', 'Войти'));
    await page.waitForFunction(() => location.pathname === '/' && location.search === '?login');
    await findByRole(page, 'heading', 'Вход в HearthPulse');
    await waitForRoleGone(page, 'navigation', MENU);
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
