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
