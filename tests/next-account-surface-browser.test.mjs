import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const surfaceClasses = page => page.$eval('.arena-app-shell', shell => [...shell.classList]
  .filter(name => name.startsWith('arena-app-') && name !== 'arena-app-shell').sort());

// The profile and home styles are scoped by the surface class on the shell,
// which the single-page shell set to `arena-app-profile` on account pages and
// to `arena-app-home` alone on the home page.
test('Next.js account and home pages carry their own shell surface', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const [name, value] = runtime.cookie.split('=');
    await page.setCookie({ name, value, url: runtime.origin });

    await page.goto(`${runtime.origin}/?login`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.profile-workspace .profile-hero', { timeout: 15_000 });
    assert.deepEqual(await surfaceClasses(page), ['arena-app-profile']);
    assert.match(await page.$eval('.profile-workspace .profile-hero', hero => getComputedStyle(hero).borderImageSource),
      /main-page-rail-border\.png/, 'the profile hero keeps its profile-surface frame');

    await page.goto(`${runtime.origin}/`, { waitUntil: 'networkidle2' });
    assert.deepEqual(await surfaceClasses(page), ['arena-app-home']);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});

test('the Next.js account page shows the access state and keeps contacts usable', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const [name, value] = runtime.cookie.split('=');
    await page.setCookie({ name, value, url: runtime.origin });
    const overflows = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const openAccount = async width => {
      await page.setViewport({ width, height: 1000 });
      await page.goto(`${runtime.origin}/?login`, { waitUntil: 'networkidle2' });
    };

    // Without a subscription the setup block is open and names the state.
    await openAccount(390);
    await page.waitForFunction(() => document.querySelector('.profile-subscription-management')?.open === true);
    assert.match(await page.$eval('.profile-subscription-state', state => state.textContent), /не подтверждён/);
    assert.equal(await overflows(), false);

    runtime.grant();
    for (const width of [390, 1440]) {
      await openAccount(width);
      await page.waitForSelector('.profile-subscription-panel--active');
      assert.equal(await page.$eval('.arena-content', content => getComputedStyle(content).borderTopWidth), '0px',
        'the account page must not draw the frame of a data page');
      assert.equal(await page.$eval('.arena-content', content => getComputedStyle(content).backgroundColor), 'rgba(0, 0, 0, 0)');
      assert.equal(await page.$eval('.profile-subscription-management', setup => setup.open), false,
        'a connected user sees the status before the setup steps');
      await page.click('.profile-subscription-management summary');
      assert.equal(await page.$eval('.profile-subscription-management', setup => setup.open), true);
      assert.equal(await overflows(), false, `account overflow at ${width}px`);
      assert.ok(await page.$eval('.profile-settings-form input', input => input.getBoundingClientRect().height) >= 44);
      await page.$eval('.profile-account-actions', actions => actions.scrollIntoView({ block: 'center' }));
      assert.equal(await page.evaluate(() => document.querySelector('.profile-settings-form').getBoundingClientRect().bottom
        <= document.querySelector('.profile-account-actions').getBoundingClientRect().top), true,
      'contacts must not overlap sign-out while scrolling');
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
