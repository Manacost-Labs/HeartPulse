import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// PageTour and ModalSurface make `#root` inert while their dialog is open, so
// keyboard and screen-reader users cannot reach the page behind it.
test('an open page tour isolates the Next.js page content behind it', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${runtime.origin}/classes/`, { waitUntil: 'networkidle2' });
    await page.click('.global-faq-button');
    await page.waitForSelector('.global-help-menu__item.is-tour', { visible: true, timeout: 10_000 });
    await page.click('.global-help-menu__item.is-tour');
    await page.waitForSelector('.page-tour__dialog', { visible: true, timeout: 10_000 });

    assert.equal(await page.$eval('main', main => Boolean(main.closest('[inert]'))), true,
      'page content must be inert while the tour dialog is open');
    assert.equal(await page.$eval('.page-tour__dialog', dialog => Boolean(dialog.closest('[inert]'))), false,
      'the tour dialog itself must stay interactive');

    await page.keyboard.press('Escape');
    await page.waitForSelector('.page-tour__dialog', { hidden: true, timeout: 10_000 });
    assert.equal(await page.$eval('main', main => Boolean(main.closest('[inert]'))), false,
      'page content must become interactive again after the tour closes');
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
