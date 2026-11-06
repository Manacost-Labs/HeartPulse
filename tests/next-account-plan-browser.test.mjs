import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

test('the Next.js account page shows the plan and keeps settings usable', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const [name, value] = runtime.cookie.split('=');
    await page.setCookie({ name, value, url: runtime.origin });
    const overflows = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const openAccount = async width => {
      await page.setViewport({ width, height: 1000 });
      await page.goto(`${runtime.origin}/?login`, { waitUntil: 'networkidle2' });
    };

    // Without a subscription the plan section offers the Boosty confirmation first.
    await openAccount(390);
    await page.waitForSelector('.account-plan--none #account-boosty-email');
    assert.match(await page.$eval('.account-hero__pill', pill => pill.textContent), /Без подписки/);
    assert.equal(await overflows(), false);

    runtime.grant();
    for (const width of [320, 390, 1440]) {
      await openAccount(width);
      await page.waitForSelector('.account-plan--active .account-access__tile');
      assert.match(await page.$eval('.account-hero__pill', pill => pill.textContent), /Подписка активна/);
      assert.equal(await page.$eval('.arena-content', content => getComputedStyle(content).borderTopWidth), '0px',
        'the account page must not draw the frame of a data page');
      assert.equal(await page.$eval('.arena-content', content => getComputedStyle(content).backgroundColor), 'rgba(0, 0, 0, 0)');
      assert.equal(await overflows(), false, `account overflow at ${width}px`);
      assert.ok(await page.$eval('#account-settings input:not([type="checkbox"])', input => input.getBoundingClientRect().height) >= 44);
      const small = await page.$$eval('.account-dashboard :is(a.account-button, button, .account-hero__action)', controls => controls
        .filter(control => control.getClientRects().length && control.getBoundingClientRect().height < 40)
        .map(control => control.textContent.trim()));
      assert.deepEqual(small, [], `every account control is at least 40 px high at ${width}px`);
      const actions = await page.$$eval('.account-hero__action', items => items.map(item => item.getBoundingClientRect().right));
      assert.ok(actions.every(right => right <= width), `hero actions stay on screen at ${width}px`);
      assert.equal(await page.$$eval('.account-dashboard button', buttons => buttons.filter(button => button.textContent.trim() === 'Выйти').length), 1,
        'sign-out is offered once');
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
