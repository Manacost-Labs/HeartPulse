import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const surfaceClasses = page => page.$eval('.arena-app-shell', shell => [...shell.classList]
  .filter(name => name.startsWith('arena-app-') && name !== 'arena-app-shell').sort());

test('a delayed account chunk does not reveal a footer that jumps away on load', { timeout: 45000 }, async () => {
  const chunks = join('apps/public-web/.next/static/chunks');
  const accountChunk = readdirSync(chunks, { recursive: true }).find(name => name.endsWith('.js')
    && readFileSync(join(chunks, name), 'utf8').includes('account-dashboard'));
  assert.ok(accountChunk, 'the built account view has a lazy chunk');
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    for (const width of [390, 1440]) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 1000 });
      const [name, value] = runtime.cookie.split('=');
      await page.setCookie({ name, value, url: runtime.origin });
      let held;
      const requested = new Promise(resolve => page.on('request', request => {
        if (new URL(request.url()).pathname === `/_next/static/chunks/${accountChunk}`) {
          held = request; resolve();
        } else request.continue();
      }));
      await page.setRequestInterception(true);
      await page.goto(`${runtime.origin}/?login`, { waitUntil: 'domcontentloaded' });
      await requested;
      await page.waitForSelector('.arena-content');
      const footerTop = await page.$eval('footer', footer => footer.getBoundingClientRect().top);
      assert.ok(footerTop >= 1000, `loading must keep the footer outside the initial viewport at ${width}px (top=${footerTop})`);
      await held.continue();
      await page.waitForSelector('.account-dashboard .account-header');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});

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
    await page.waitForSelector('.account-dashboard .account-header', { timeout: 15_000 });
    assert.deepEqual(await surfaceClasses(page), ['arena-app-profile']);
    assert.equal(await page.title(), 'Личный кабинет — HearthPulse');
    assert.deepEqual(await page.$$eval('h1', headings => headings.map(heading => heading.id)), ['account-title'],
      'the account name is the only page heading');

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

    // Without a subscription the access card offers the Boosty confirmation first.
    await openAccount(390);
    await page.waitForSelector('.account-access--none #account-boosty-email');
    assert.match(await page.$eval('.account-access .account-pill', pill => pill.textContent), /Доступ закрыт/);
    assert.equal(await overflows(), false);

    runtime.grant();
    for (const width of [320, 390, 1440]) {
      await openAccount(width);
      await page.waitForSelector('.account-access--active .account-access__tile');
      assert.equal(await page.$eval('.arena-content', content => getComputedStyle(content).borderTopWidth), '0px',
        'the account page must not draw the frame of a data page');
      assert.equal(await page.$eval('.arena-content', content => getComputedStyle(content).backgroundColor), 'rgba(0, 0, 0, 0)');
      assert.equal(await page.$eval('#account-settings', contacts => contacts.open), false,
        'prize contacts stay folded until the user needs them');
      await page.click('#account-settings summary');
      assert.equal(await page.$eval('#account-settings', contacts => contacts.open), true);
      assert.equal(await overflows(), false, `account overflow at ${width}px`);
      assert.ok(await page.$eval('#account-settings input:not([type="checkbox"])', input => input.getBoundingClientRect().height) >= 44);
      await page.$eval('.account-logout', logout => logout.scrollIntoView({ block: 'center' }));
      assert.equal(await page.evaluate(() => document.querySelector('#account-settings').getBoundingClientRect().bottom
        <= document.querySelector('.account-logout').getBoundingClientRect().top), true,
      'contacts must not overlap sign-out while scrolling');

      await page.$eval('.account-menu button', trigger => trigger.scrollIntoView({ block: 'center' }));
      await page.click('.account-menu button');
      const menu = await page.$eval('#account-menu-list', list => ({ left: list.getBoundingClientRect().left, right: list.getBoundingClientRect().right }));
      assert.ok(menu.left >= 0 && menu.right <= width, `the account menu stays on screen at ${width}px (${JSON.stringify(menu)})`);
      await page.keyboard.press('Escape');
      assert.equal(await page.$('#account-menu-list'), null, 'Escape closes the account menu');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Меню аккаунта',
        'Escape returns focus to the menu button');
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
