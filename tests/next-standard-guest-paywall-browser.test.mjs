import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';
import { findByRole } from './helpers/browserUserView.mjs';

// Traditional-mode analytics require the Boosty «Алмаз» tier, so their guest
// paywall must name that tier, as the single-page shell did.
// The vS dataset as hs-data-api serves it: the real Express projects the open frame of the report from it.
const viciousDataset = () => ({ data: { url: 'https://www.vicioussyndicate.com/data-reaper-live/', structured: {
  format: 'Standard', games: 1000,
  class_distribution: [{ class: 'Mage', frequency: '20%' }],
  deck_distribution: [{ deck: 'Protoss Mage', class: 'Mage', frequency: '5%' }],
  tier_list: [{ rank_bracket: 'All ranks', decks: [{ deck: 'Protoss Mage', winrate: '52%', rank: 1 }] }],
} } });

test('Next traditional-mode pages ask guests for the Diamond tier', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true,
    externalRoutes: { '/datasets/vicious_syndicate_live_beta': viciousDataset } });
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
        for (let attempt = 0; attempt < 20 && !(await page.$('#standard-matchups-paywall')); attempt += 1) {
          await page.click('[data-locked-filter]');
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        const offer = await page.$eval('#standard-matchups-paywall', node => node.textContent);
        assert.match(offer, /Тариф «Алмаз»|ТАРИФ «АЛМАЗ»/i, 'the offer names the Diamond tier');
        assert.match(offer, /Войти/, 'the offer lets a guest sign in');
        await page.close();
        continue;
      }
      // The Vicious Gold report is open as a frame (#656): a lock in place of a paid value brings the Standard offer.
      for (let attempt = 0; attempt < 20 && !(await page.$('[data-testid="arena-paid-offer"]')); attempt += 1) {
        await page.click('button[aria-label^="Лидер Power Tier: по подписке"]');
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      await findByRole(page, 'link', 'Уже подписаны? Войти')
        .catch(() => assert.fail(`${path} must offer a guest to sign in`));
      await findByRole(page, 'link', 'Оформить на Boosty Уровень «Алмаз» и выше')
        .catch(() => assert.fail(`${path} must sell the Diamond tier, not the Arena one`));
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
