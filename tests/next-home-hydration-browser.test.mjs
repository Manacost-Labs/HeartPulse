import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// The server-rendered "latest articles" section hydrates once its lazy chunk
// arrives. The account check finishing first must not replace that HTML with
// the loading placeholder, which on slow connections flickered the section
// away for as long as the chunk took.
test('the Next.js home keeps its server-rendered articles while their chunk loads', async () => {
  const chunks = join('apps/public-web/.next/static/chunks');
  const articlesChunk = readdirSync(chunks, { recursive: true })
    .filter(name => name.endsWith('.js') && readFileSync(join(chunks, name), 'utf8').includes('home-latest-articles__board'));
  assert.equal(articlesChunk.length, 1, 'one chunk renders the latest articles section');
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    let releaseChunk;
    const chunkHeld = new Promise(resolve => {
      page.on('request', request => {
        if (new URL(request.url()).pathname !== `/_next/static/chunks/${articlesChunk[0]}`) {
          request.continue();
          return;
        }
        releaseChunk = () => request.continue();
        resolve();
      });
    });
    await page.setRequestInterception(true);
    const accountChecked = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/me');
    await page.goto(`${runtime.origin}/`, { waitUntil: 'domcontentloaded' });
    await Promise.all([chunkHeld, accountChecked]);
    await page.waitForFunction(() => document.querySelector('.arena-sidebar-profile')?.textContent.includes('Войти'));
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));
    assert.equal(await page.$('#root .home-latest-articles') !== null, true,
      'the section stays while its chunk is still loading');
    releaseChunk();
    await page.waitForSelector('#root .home-latest-articles', { visible: true });
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
