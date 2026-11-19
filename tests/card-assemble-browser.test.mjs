import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startStorybookStatic } from './helpers/storybookStatic.mjs';

const chromiumPath = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for the card Assemble browser test');

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

// «Сборка» on the page of an Assemble card: the base ribbon (with a search for a large
// pool), the best builds, and «Мне предложили». Card art goes through the site's
// public-resource route; the stub answers it with a pixel.
const storybook = await startStorybookStatic();
let browser;
try {
  browser = await launchBrowser({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/public-resource/')) {
      void request.respond({ status: 200, contentType: 'image/gif', body: PIXEL });
      return;
    }
    void request.continue();
  });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const text = selector => page.$eval(selector, node => node.innerText);

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(storybook.storyUrl('card-detail-assemble--f-3-tch-3-r'), { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-card-assemble] .assemble-row');
  const summary = await text('.assemble-summary');
  assert.match(summary, /Пул 38 существ/);
  assert.match(summary, /средний винрейт после сборки 51,2%/);
  assert.match(summary, /лучшая база — /);
  assert.equal(await page.$$eval('ul[aria-label^="Существа, которых игра"] button', items => items.length), 24);
  assert.equal(await page.$$eval('ol[aria-label="Лучшие сборки"] > li', rows => rows.length), 10);
  const sectionText = await text('[data-card-assemble]');
  assert.match(sectionText, /Показать все · 68/);

  // The donor half is gold-marked, the base half stays in ink.
  const colours = await page.$eval('.assemble-row .assemble-text', paragraph => ({
    base: getComputedStyle(paragraph.querySelector('.is-base')).color,
    donor: getComputedStyle(paragraph.querySelector('.is-donor')).color,
  }));
  assert.notEqual(colours.base, colours.donor);

  // The rest of the builds opens in place.
  await page.evaluate(() => [...document.querySelectorAll('[data-card-assemble] .card-choices__more')].find(button => button.textContent.startsWith('Показать все ·'))?.click());
  await page.waitForFunction(() => document.querySelectorAll('ol[aria-label="Лучшие сборки"] > li').length > 10);
  assert.equal(await page.$$eval('ol[aria-label="Лучшие сборки"] > li', rows => rows.length), 68);

  // Another base loads its own donors.
  const before = await text('.assemble-base__name');
  await page.click('ul[aria-label^="Существа, которых игра"] li:nth-child(3) button');
  await page.waitForFunction(previous => document.querySelector('.assemble-base__name')?.textContent !== previous, {}, before);
  await page.waitForSelector('ol[aria-label="Лучшие сборки"] > li');

  // «Мне предложили»: two donors, four builds, one glowing best choice.
  await page.evaluate(() => [...document.querySelectorAll('.assemble-tabs button')].find(button => button.textContent === 'Мне предложили')?.click());
  await page.waitForSelector('ul[aria-label="Существа, которых могла предложить игра"] button');
  await page.click('ul[aria-label="Существа, которых могла предложить игра"] li:nth-child(1) button');
  assert.equal(await page.$$eval('.assemble-offer ol > li', rows => rows.length), 0);
  await page.click('ul[aria-label="Существа, которых могла предложить игра"] li:nth-child(2) button');
  await page.waitForSelector('.assemble-offer ol > li.is-best');
  assert.equal(await page.$$eval('.assemble-offer ol > li', rows => rows.length), 4);
  assert.equal(await page.$$eval('.assemble-offer .assemble-row__best', labels => labels.length), 1);
  assert.match(await text('.assemble-row__best'), /^Лучший/);
  // Taking a chosen donor off the slot hides the answer.
  await page.click('.assemble-slot.is-filled');
  assert.equal(await page.$$eval('.assemble-offer ol > li', rows => rows.length), 0);

  // A large pool: first 24 and a search that finds a creature by name.
  await page.goto(storybook.storyUrl('card-detail-assemble--shadow-creator'), { waitUntil: 'networkidle0' });
  await page.waitForSelector('.assemble-search input');
  assert.match(await text('.assemble-summary'), /Пул 165 существ/);
  assert.equal(await page.$$eval('ul[aria-label^="Существа, которых игра"] button', items => items.length), 24);
  await page.type('.assemble-search input', 'медведь');
  const found = await page.$$eval('ul[aria-label^="Существа, которых игра"] .assemble-picker__name', names => names.map(name => name.textContent));
  assert.ok(found.length > 0 && found.length < 24 && found.every(name => /медведь/i.test(name)), `search found ${found.join(', ')}`);
  await page.$eval('.assemble-search input', input => { input.value = ''; });
  await page.type('.assemble-search input', 'яяяяя');
  assert.match(await text('[data-card-assemble]'), /никого не нашли/);

  // Nothing overflows at a phone width or at 150% zoom (a 960px viewport).
  for (const width of [390, 960]) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    for (const story of ['f-3-tch-3-r', 'raj', 'shadow-creator']) {
      await page.goto(storybook.storyUrl(`card-detail-assemble--${story}`), { waitUntil: 'networkidle0' });
      await page.waitForSelector('[data-card-assemble] .assemble-row');
      assert.ok(await overflow() <= 0, `${story} overflows a ${width}px screen by ${await overflow()}px`);
    }
  }

  // A card the data source does not know shows no section, and no data says so.
  await page.goto(storybook.storyUrl('card-detail-assemble--missing'), { waitUntil: 'networkidle0' });
  assert.equal(await page.$('[data-card-assemble]'), null);
  await page.goto(storybook.storyUrl('card-detail-assemble--not-enough-data'), { waitUntil: 'networkidle0' });
  assert.match(await text('[data-card-assemble]'), /Мало данных/);
  assert.deepEqual(runtimeErrors, []);
} finally {
  await browser?.close();
  await storybook.close();
}
