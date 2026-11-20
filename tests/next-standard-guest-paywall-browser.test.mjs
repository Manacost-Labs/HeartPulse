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
      // The matrix page is open (the general slice); its locked filters bring the offer on a press.
      if (path === '/standard/matchups/') {
        // The press needs hydration: press again until the offer is up.
        const lock = '::-p-aria([name="Рейтинг (фильтр): по подписке. Узнать, как открыть"][role="button"])';
        const offerUp = () => page.evaluate(() => document.body.innerText.includes('Уже подписаны? Войти'));
        for (let attempt = 0; attempt < 20 && !(await offerUp()); attempt += 1) {
          await (await page.waitForSelector(lock)).click().catch(() => undefined);
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        const offer = await page.evaluate(() => document.body.innerText);
        assert.match(offer, /Тариф «Алмаз»|ТАРИФ «АЛМАЗ»/i, 'the offer names the Diamond tier');
        assert.match(offer, /Войти/, 'the offer lets a guest sign in');
        await page.close();
        continue;
      }
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
