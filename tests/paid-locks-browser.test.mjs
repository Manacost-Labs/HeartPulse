import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { openStory, startStorybookStatic } from './helpers/storybookStatic.mjs';

const chromiumPath = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']
  .find(candidate => candidate && existsSync(candidate));
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for the paid locks test');

// Locks sit in clickable rows (matchups, meta). A press opens the subscription offer
// (or the caller's callback) and must not also trigger the row.
const storybook = await startStorybookStatic();
const LOCKS = ['Винрейт', 'Игры', 'Мана (фильтр)'];
const status = page => page.$eval('output', node => node.textContent);

let browser;
try {
  browser = await launchBrowser({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));

  // The row itself is wired: a press beside the locks reaches it.
  await openStory(page, storybook.storyUrl('access-paidlocks--in-clickable-row'));
  await page.waitForSelector('::-p-text(Строка таблицы)', { visible: true });
  await page.click('::-p-text(Строка таблицы)');
  assert.match(await status(page), /Строка нажата: 1;/, 'a press on the row reaches the row');

  for (const name of LOCKS) {
    await page.click(`::-p-aria([name="${name}: по подписке. Узнать, как открыть"][role="button"])`);
    await page.waitForSelector('[role="dialog"] h2::-p-text(Платные показатели — по подписке)', { visible: true });
    assert.match(await status(page), /Строка нажата: 1;/, `${name}: the offer opens and the row does not react`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  }

  await openStory(page, storybook.storyUrl('access-paidlocks--in-clickable-row-with-on-open'));
  for (const name of LOCKS) {
    await page.click(`::-p-aria([name="${name}: по подписке. Узнать, как открыть"][role="button"])`);
  }
  assert.equal(await status(page), 'Строка нажата: 0; колбэк: 3', 'onOpen runs for each lock and the row does not react');
  assert.equal(await page.$('[role="dialog"]'), null, 'with onOpen the provider offer stays closed');

  assert.deepEqual(runtimeErrors, []);
  console.log('Paid locks browser test passed');
} finally {
  await browser?.close();
  await storybook.close();
}
