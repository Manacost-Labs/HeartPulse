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
  // The pool of F3TCH3R depends on the class: without one «Мне предложили» asks for it.
  assert.equal(await page.$$eval('ul[aria-label="Класс игрока"] button', buttons => buttons.length), 11);
  await page.evaluate(() => [...document.querySelectorAll('.assemble-tabs button')].find(button => button.textContent === 'Мне предложили')?.click());
  assert.match(await text('.assemble-offer'), /выберите свой класс/);
  assert.equal(await page.$('ul[aria-label="Существа, которых могла предложить игра"]'), null);
  await page.evaluate(() => [...document.querySelectorAll('ul[aria-label="Класс игрока"] button')].find(button => button.textContent === 'Маг')?.click());
  await page.waitForSelector('ul[aria-label="Существа, которых могла предложить игра"] button');
  await page.click('ul[aria-label="Существа, которых могла предложить игра"] li:nth-child(1) button');
  assert.equal(await page.$$eval('.assemble-offer ol > li', rows => rows.length), 0);
  await page.click('ul[aria-label="Существа, которых могла предложить игра"] li:nth-child(2) button');
  await page.waitForSelector('.assemble-offer ol > li.is-best');
  assert.equal(await page.$$eval('.assemble-offer ol > li', rows => rows.length), 4);
  assert.equal(await page.$$eval('.assemble-offer .assemble-row__best', labels => labels.length), 1);
  assert.match(await text('.assemble-row__best'), /^Лучший/);
  // A screen reader hears the answer: the live region names the best build.
  assert.match(await page.$eval('.assemble-offer [role="status"]', node => node.textContent), /^Лучший выбор: .+, берём (эффект|условие), винрейт \d+,\d%\.$/);
  // The picker folds away, the builds stay under the slots; «Изменить выбор» brings it back.
  assert.equal(await page.$('ul[aria-label="Существа, которых могла предложить игра"]'), null);
  await page.evaluate(() => [...document.querySelectorAll('.assemble-edit')][0]?.click());
  await page.waitForSelector('ul[aria-label="Существа, которых могла предложить игра"]');
  assert.equal(await page.$$eval('.assemble-offer ol > li', rows => rows.length), 0);
  await page.click('ul[aria-label="Существа, которых могла предложить игра"] li:nth-child(3) button');
  await page.waitForSelector('.assemble-offer ol > li.is-best');
  // Taking a chosen donor off the slot hides the answer.
  await page.click('.assemble-slot.is-filled');
  assert.equal(await page.$$eval('.assemble-offer ol > li', rows => rows.length), 0);

  // Donors that never met the base are in the pool, last, labelled, and have texts without percentages.
  await page.goto(storybook.storyUrl('card-detail-assemble--f-3-tch-3-r'), { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-card-assemble] .assemble-row');
  await page.evaluate(() => [...document.querySelectorAll('ul[aria-label="Класс игрока"] button')].find(button => button.textContent === 'Маг')?.click());
  await page.evaluate(() => [...document.querySelectorAll('.assemble-tabs button')].find(button => button.textContent === 'Мне предложили')?.click());
  const donorList = 'ul[aria-label="Существа, которых могла предложить игра"]';
  await page.waitForSelector(`${donorList} button`);
  await page.evaluate(() => [...document.querySelectorAll('.assemble-picker .card-choices__more')].find(button => button.textContent.startsWith('Показать всех'))?.click());
  const classes = await page.$$eval(`${donorList} button`, buttons => buttons.length);
  assert.ok(classes > 24, `the whole pool of a Mage is offered, got ${classes}`);
  const noStatsAt = await page.$$eval(`${donorList} button`, buttons => buttons.map(button => button.classList.contains('is-nodata')));
  assert.equal(noStatsAt.at(-1), true);
  assert.ok(noStatsAt.indexOf(true) > 0 && noStatsAt.slice(noStatsAt.indexOf(true)).every(Boolean), 'donors without statistics come last');
  assert.match(await page.$eval(`${donorList} button.is-nodata`, button => button.textContent), /не встречался в играх/);
  // One donor with statistics and one without: four texts, two of them without percentages, the best among the others.
  await page.click(`${donorList} li:nth-child(1) button`);
  await page.evaluate(() => { const items = document.querySelectorAll('ul[aria-label="Существа, которых могла предложить игра"] li button'); items[items.length - 1].click(); });
  await page.waitForSelector('.assemble-offer ol > li.is-best');
  assert.equal(await page.$$eval('.assemble-offer ol > li', rows => rows.length), 4);
  assert.equal(await page.$$eval('.assemble-offer .assemble-row__nodata', cells => cells.length), 2);
  assert.equal(await page.$$eval('.assemble-offer li.is-best .assemble-row__nodata', cells => cells.length), 0);
  assert.match(await page.$eval('.assemble-offer [role="status"]', node => node.textContent), /^Лучший выбор: .+ У «.+» нет статистики/);
  // Both without statistics: four texts and no best choice, said in words and to a screen reader.
  await page.click('.assemble-slot.is-filled');
  await page.click('.assemble-slot.is-filled');
  await page.waitForSelector(`${donorList} button`);
  await page.evaluate(() => [...document.querySelectorAll('.assemble-picker .card-choices__more')].find(button => button.textContent.startsWith('Показать всех'))?.click());
  await page.evaluate(() => { const items = document.querySelectorAll('ul[aria-label="Существа, которых могла предложить игра"] li button'); items[items.length - 1].click(); });
  await page.evaluate(() => { const items = document.querySelectorAll('ul[aria-label="Существа, которых могла предложить игра"] li button'); items[items.length - 2].click(); });
  await page.waitForSelector('.assemble-offer ol > li');
  assert.equal(await page.$$eval('.assemble-offer ol > li', rows => rows.length), 4);
  assert.equal(await page.$('.assemble-offer li.is-best'), null);
  assert.match(await text('.assemble-offer'), /Лучшего выбора нет/);
  assert.match(await page.$eval('.assemble-offer [role="status"]', node => node.textContent), /Лучшего выбора нет/);
  // Changing the class moves the screen to a base that class can roll, and clears the chosen donors.
  await page.goto(storybook.storyUrl('card-detail-assemble--f-3-tch-3-r'), { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-card-assemble] .assemble-row');
  const bases = await page.evaluate(async () => (await (await fetch('/api/card-assemble/standard/BE_044?base=top')).json()).bases.map(base => [base.card.name, base.card.cardClass, base.offerRate]));
  const firstOf = classes => bases.filter(base => classes.includes(base[1])).sort((a, b) => b[2] - a[2])[0][0];
  const mageBase = bases.filter(base => base[1] === 'MAGE').sort((a, b) => b[2] - a[2])[0][0];
  const clickClass = label => page.evaluate(name => [...document.querySelectorAll('ul[aria-label="Класс игрока"] button')].find(button => button.textContent === name)?.click(), label);
  const baseName = () => page.$eval('.assemble-base__name', node => node.textContent);
  await clickClass('Маг');
  await page.evaluate(name => [...document.querySelectorAll('ul[aria-label^="Существа, которых игра"] button')].find(button => button.textContent.includes(name))?.click(), mageBase);
  await page.waitForFunction(name => document.querySelector('.assemble-base__name')?.textContent === name, {}, mageBase);
  await page.waitForSelector('ol[aria-label="Лучшие сборки"] > li');
  await page.evaluate(() => [...document.querySelectorAll('.assemble-tabs button')].find(button => button.textContent === 'Мне предложили')?.click());
  await page.waitForSelector('ul[aria-label="Существа, которых могла предложить игра"] button');
  await page.click('ul[aria-label="Существа, которых могла предложить игра"] li:nth-child(1) button');
  assert.equal(await page.$$eval('.assemble-slot.is-filled', slots => slots.length), 1);
  const rogueBase = firstOf(['ROGUE', 'NEUTRAL']);
  await clickClass('Разбойник');
  await page.waitForFunction(name => document.querySelector('.assemble-base__name')?.textContent === name, {}, rogueBase);
  assert.notEqual(await baseName(), mageBase);
  assert.equal(await page.$$eval('.assemble-slot.is-filled', slots => slots.length), 0, 'the chosen donors are cleared with the class');
  const ribbon = await page.$$eval('ul[aria-label^="Существа, которых игра"] .assemble-picker__name', names => names.map(name => name.textContent));
  assert.ok(!ribbon.includes(mageBase), 'a Mage base is not in a Rogue ribbon');
  assert.ok(ribbon.includes(await baseName()), 'the shown base is in the ribbon');

  // A failed pool check falls back to the donors with statistics, without the class choice.
  await page.goto(storybook.storyUrl('card-detail-assemble--pool-mismatch'), { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-card-assemble] .assemble-row');
  assert.equal(await page.$('ul[aria-label="Класс игрока"]'), null);
  await page.evaluate(() => [...document.querySelectorAll('.assemble-tabs button')].find(button => button.textContent === 'Мне предложили')?.click());
  await page.waitForSelector(`${donorList} button`);
  assert.equal(await page.$(`${donorList} button.is-nodata`), null);
  // A class card has no class choice either; its pool is the one the API sent.
  await page.goto(storybook.storyUrl('card-detail-assemble--shadow-creator'), { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-card-assemble] .assemble-row');
  assert.equal(await page.$('ul[aria-label="Класс игрока"]'), null);

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

  // A phone gets two rows of three portraits and the four builds right under the two slots.
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto(storybook.storyUrl('card-detail-assemble--f-3-tch-3-r'), { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-card-assemble] .assemble-row');
  assert.equal(await page.$$eval('ul[aria-label^="Существа, которых игра"] button', items => items.length), 6);
  await page.evaluate(() => [...document.querySelectorAll('ul[aria-label="Класс игрока"] button')].find(button => button.textContent === 'Маг')?.click());
  await page.evaluate(() => [...document.querySelectorAll('.assemble-tabs button')].find(button => button.textContent === 'Мне предложили')?.click());
  await page.waitForSelector('ul[aria-label="Существа, которых могла предложить игра"] button');
  await page.click('ul[aria-label="Существа, которых могла предложить игра"] li:nth-child(1) button');
  await page.click('ul[aria-label="Существа, которых могла предложить игра"] li:nth-child(2) button');
  await page.waitForSelector('.assemble-offer li.is-best');
  const gap = await page.evaluate(() => document.querySelector('.assemble-offer ol').getBoundingClientRect().top - document.querySelector('.assemble-slots').getBoundingClientRect().bottom);
  assert.ok(gap < 120, `the builds start ${gap}px under the slots`);

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
  // A card the source does not collect yet is hidden, not announced as «Мало данных».
  await page.goto(storybook.storyUrl('card-detail-assemble--not-collected'), { waitUntil: 'networkidle0' });
  assert.equal(await page.$('[data-card-assemble]'), null);
  // A failed request shows an alert, and «Повторить» brings the section.
  await page.goto(storybook.storyUrl('card-detail-assemble--error-then-retry'), { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-card-assemble] [role="alert"]');
  assert.match(await text('[data-card-assemble] [role="alert"]'), /Повторить/);
  await page.evaluate(() => [...document.querySelectorAll('[role="alert"] button')].find(button => button.textContent === 'Повторить')?.click());
  await page.waitForSelector('[data-card-assemble] .assemble-row');
  assert.doesNotMatch(await text('[data-card-assemble]'), /г\.\./);
  await page.goto(storybook.storyUrl('card-detail-assemble--not-enough-data'), { waitUntil: 'networkidle0' });
  assert.match(await text('[data-card-assemble]'), /Мало данных/);
  assert.deepEqual(runtimeErrors, []);
} finally {
  await browser?.close();
  await storybook.close();
}
