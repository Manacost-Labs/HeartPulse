import assert from 'node:assert/strict';
import test from 'node:test';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';
import { AMERICA_LEADER, PAST_SEASON_LEADER, leaderboardsExternalRoutes } from './helpers/browserLeaderboardsFixture.mjs';
import {
  clickByRole, findByRole, launchUserBrowser, role, typeByRole, waitForPressed, waitForRoleGone,
} from './helpers/browserUserView.mjs';

const BOARD = 'Таблица лидеров';
const inBoard = (name, accessibleName) => `${role('region', BOARD)} ${role(name, accessibleName)}`;
const search = page => new URL(page.url()).searchParams;

test('a guest switches the leaderboard region, opens the previous season and searches a player', { timeout: 180_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, externalRoutes: leaderboardsExternalRoutes });
  let browser;
  try {
    browser = await launchUserBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${runtime.origin}/leaderboards/`, { waitUntil: 'domcontentloaded' });
    await findByRole(page, 'heading', 'Таблицы лидеров');
    await waitForPressed(page, 'Европа');
    await page.waitForSelector(inBoard('button', 'TrueBench'), { visible: true });

    await clickByRole(page, 'button', 'Америка');
    await waitForPressed(page, 'Америка');
    await page.waitForSelector(inBoard('button', AMERICA_LEADER), { visible: true });
    await waitForRoleGone(page, 'button', 'TrueBench');
    assert.equal(search(page).get('region'), 'US', 'the region is in the address to share');

    await clickByRole(page, 'button', 'Европа');
    await page.waitForSelector(inBoard('button', 'TrueBench'), { visible: true });
    await page.focus(role('combobox', 'Сезон'));
    await page.keyboard.press('ArrowDown');
    await page.waitForSelector(inBoard('button', PAST_SEASON_LEADER), { visible: true });
    assert.match(await page.$eval(role('combobox', 'Сезон'), select => select.selectedOptions[0].textContent), /^Сезон 155/);
    assert.equal(search(page).get('season'), '155');

    await typeByRole(page, 'searchbox', 'Игрок', 'Legend42');
    await page.waitForSelector(inBoard('button', 'Legend42'), { visible: true });
    await waitForRoleGone(page, 'button', PAST_SEASON_LEADER);
    assert.equal(search(page).get('q'), 'Legend42');
    assert.equal(search(page).get('season'), '155', 'the search stays in the chosen season');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
