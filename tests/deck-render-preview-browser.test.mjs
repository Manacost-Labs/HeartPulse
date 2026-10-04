import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { startStorybookStatic } from './helpers/storybookStatic.mjs';

const chromiumPath = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for deck render preview browser tests');

// A deck render keeps the deck's card list as its hidden fallback. The fun-decks
// page renders a dozen of them, so the tile art of those lists must load only
// once a list is shown (after a failed render), not behind the rendered image.
const storybook = await startStorybookStatic();
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const runtimeErrors = [];
  const tileRequests = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/story-deck-tile/')) {
      tileRequests.push(new URL(request.url()).pathname);
      void request.respond({
        status: 200,
        contentType: 'image/gif',
        body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'),
      });
      return;
    }
    void request.continue();
  });

  await page.goto(storybook.storyUrl('deckview-deck-render-preview--rendered-deck-with-hidden-fallback-list'), { waitUntil: 'networkidle0' });
  await page.waitForSelector('.deck-render-preview .deck-tile__art');
  assert.equal(await page.$eval('.deck-render-preview__list', list => list.hidden), true);
  assert.deepEqual(tileRequests, [], 'a hidden fallback list must not download its tile art');

  // A failed render shows the list: its art then loads as usual.
  await page.$eval('.deck-render-preview__list', list => { list.hidden = false; });
  await page.waitForFunction(() => [...document.querySelectorAll('.deck-render-preview__list .deck-tile__art')]
    .every(image => image.complete && image.naturalWidth > 0));
  assert.equal(new Set(tileRequests).size, 3);
  assert.deepEqual(runtimeErrors, []);
} finally {
  await browser?.close();
  await storybook.close();
}
