import assert from 'node:assert/strict';
import test from 'node:test';
import { scryptSync } from 'node:crypto';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';
import {
  clickByRole, findByRole, launchUserBrowser, role, typeByRole, waitForFocus,
} from './helpers/browserUserView.mjs';

const EMAIL = 'diamond@example.test';
const PASSWORD = 'qa-password-123';
const PAYWALL = 'Подтвердите подписку Манакоста для доступа к матчапам';

test('a guest meets the Standard paywall, signs in with a password and a mailed code, and the matchups open', { timeout: 180_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  try {
    // Подписчик «Алмаза», который ещё не вошёл на этом устройстве.
    const now = new Date().toISOString();
    runtime.backend.database.prepare('INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('diamond', EMAIL, 'Алмазный', `scrypt:qa-fixture:${scryptSync(PASSWORD, 'qa-fixture', 64).toString('hex')}`, 'user', now, now);
    runtime.backend.database.prepare('INSERT INTO manual_subscription_grants (user_id, active, entitlements_json, granted_by, granted_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)')
      .run('diamond', '{"standard":true}', 'integration-test', now, now);

    browser = await launchUserBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${runtime.origin}/standard/matchups/`, { waitUntil: 'domcontentloaded' });
    await findByRole(page, 'heading', 'Матчапы');
    const paywall = await findByRole(page, 'region', PAYWALL);
    assert.match(await paywall.evaluate(node => node.innerText), /Доступ откроется через Boosty уровня «Алмаз» или выше/);
    await findByRole(page, 'link', 'Оформить на Boosty Уровень «Алмаз» и выше');

    await clickByRole(page, 'link', 'Войти в профиль');
    await page.waitForFunction(() => location.pathname === '/' && location.search === '?login');
    await findByRole(page, 'heading', 'Вход в HearthPulse');
    await waitForFocus(page, 'textbox', 'Почта');
    await typeByRole(page, 'textbox', 'Почта', EMAIL);
    await typeByRole(page, 'textbox', 'Пароль', PASSWORD);
    await clickByRole(page, 'button', 'Получить код');
    const letter = await runtime.backend.smtp.delivery(EMAIL);
    letter.accept();
    await waitForFocus(page, 'textbox', 'Код из письма');
    await typeByRole(page, 'textbox', 'Код из письма', letter.body.match(/Ваш код входа: (\d{6})/)[1]);
    await clickByRole(page, 'button', 'Войти');
    await findByRole(page, 'heading', 'Алмазный');

    await page.goto(`${runtime.origin}/standard/matchups/`, { waitUntil: 'domcontentloaded' });
    // Кнопки формата есть только у открытых матчапов, не у проверки доступа и не у пейволла.
    await findByRole(page, 'button', 'Показать матчапы: Стандарт');
    assert.equal(await page.$(role('region', PAYWALL)), null, 'a subscriber sees no paywall');
    assert.equal(await page.$(role('link', 'Войти в профиль')), null);
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
