import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';
import { findByRole, mainText } from './helpers/browserUserView.mjs';

// Traditional-mode analytics require the Boosty «Алмаз» tier, so their guest
// paywall must name that tier, as the single-page shell did.
test('Next traditional-mode pages ask guests for the Diamond tier', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    for (const path of ['/standard/matchups/', '/standard/vicious-gold/']) {
      const page = await browser.newPage();
      await page.goto(`${runtime.origin}${path}`, { waitUntil: 'networkidle2' });
      await findByRole(page, 'link', 'Войти в профиль')
        .catch(() => assert.fail(`${path} must offer a guest to sign in`));
      assert.match(await mainText(page), /Доступ откроется через Boosty уровня «Алмаз» или выше/, `${path} must name the Diamond tier`);
      await findByRole(page, 'link', 'Оформить на Boosty Уровень «Алмаз» и выше')
        .catch(() => assert.fail(`${path} must sell the Diamond tier, not the Arena one`));
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
