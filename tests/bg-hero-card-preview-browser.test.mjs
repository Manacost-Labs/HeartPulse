import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { openStory, startStorybookStatic } from './helpers/storybookStatic.mjs';

const chromiumPath = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for the hero card preview test');

// The final-board names of the hero «Составы» tab open a card preview on
// hover. The preview read the trigger's position inside a state updater; when
// a second pointer event arrived before React rendered, the updater ran after
// React had cleared `currentTarget` and the whole hero page fell into its
// error screen. Pointer enter, leave and enter in one task reproduce that.
const storybook = await startStorybookStatic();
const browser = await launchBrowser({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // React reports a render error to the console rather than as an uncaught page error.
  page.on('console', message => { if (message.type() === 'error' && /^\w*Error:/.test(message.text())) errors.push(message.text()); });
  await page.setViewport({ width: 1440, height: 900 });
  // The static Storybook has no card API; every card image answers with one pixel so the board keeps its <img>s.
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/public-resource/')) void request.respond({ status: 200, contentType: 'image/png', body: pixel });
    else void request.continue();
  });
  await openStory(page, storybook.storyUrl('battlegrounds-analytics--compositions'));
  await page.waitForSelector('.bg-hero-final .bg-hero-card-name');

  await page.evaluate(() => {
    const trigger = document.querySelector('.bg-hero-final .bg-hero-card-name');
    const pointer = type => new PointerEvent(type, { bubbles: true, relatedTarget: document.body, pointerType: 'mouse' });
    trigger.dispatchEvent(pointer('pointerover'));
    trigger.dispatchEvent(pointer('pointerout'));
    trigger.dispatchEvent(pointer('pointerover'));
  });
  // React renders continuous pointer updates on a later task; let that render happen.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve))));
  assert.deepEqual(errors, [], 'repeated hovers over a final-board name must not throw');
  await page.waitForSelector('[role="tooltip"].anchored-image-preview', { timeout: 5_000 });

  // The final board is one set of normal cards; a star marks each golden minion.
  const lineup = await page.$$eval('.bg-hero-lineup img', images => images.map(image => image.getAttribute('src')));
  assert.ok(lineup.length > 0, 'the story renders the final board');
  assert.deepEqual(lineup.filter(source => /golden|framed|_G\.png/.test(source ?? '')), [], 'no golden or framed art on the final board');
  assert.ok(await page.$('.bg-hero-lineup__golden'), 'golden minions keep their star marker');
} finally {
  await browser.close();
  await storybook.close();
}
