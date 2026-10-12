import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startStorybookStatic } from './helpers/storybookStatic.mjs';

const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');

test('compact library supports tribe selection, empty-result reset and hidden advanced selections', async () => {
  const runtime = await startStorybookStatic();
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = []; const failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => failed.push(request.url()));
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewport({ width, height: 900 });
      await page.goto(runtime.storyUrl('battlegrounds-library--compact-controls'), { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelector('.bg-library-controls [role=status]')?.textContent.includes('2 найдено'));
      await page.evaluate(axe);
      const state = await page.evaluate(async () => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        advancedOpen: document.querySelector('.bg-library-control-advanced').open,
        height: document.querySelector('.bg-library-controls').getBoundingClientRect().height,
        frame: getComputedStyle(document.querySelector('.bg-library-controls')).borderImageSource,
        tavernBadges: document.querySelectorAll('button[aria-label^="Таверна "] img').length,
        imagesLoaded: [...document.querySelectorAll('.bg-library-controls img')].every(image => image.complete && image.naturalWidth > 0),
        roundRaces: [...document.querySelectorAll('.bg-library-race-icon')].every(image => getComputedStyle(image).borderRadius === '50%'),
        violations: (await axe.run(document.querySelector('.bg-library-controls'), {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        })).violations.map(violation => violation.id),
      }));
      assert.equal(state.overflow, false, `${width}px overflow`);
      assert.equal(state.advancedOpen, false);
      assert.deepEqual(state.violations, [], `${width}px accessibility`);
      assert.match(state.frame, /main-page-rail-border\.png/);
      assert.equal(state.tavernBadges, 7);
      assert.equal(state.imagesLoaded, true, `${width}px game assets loaded`);
      assert.equal(state.roundRaces, true, `${width}px round tribe icons`);
      if (width === 1440) assert.ok(state.height < 360, `toolbar height ${state.height}`);
      const search = await page.$('input[aria-label="Поиск карт"]');
      await search.type('Нет такой карты');
      await page.waitForSelector('button::-p-text(Сбросить фильтры)');
      await page.click('button::-p-text(Сбросить фильтры)');
      assert.equal(await page.$eval('input[aria-label="Поиск карт"]', element => element.value), '');
      await page.click('.bg-library-control-advanced summary');
      await page.click('.bg-library-control-duos input');
      await page.click('.bg-library-control-advanced summary');
      await page.waitForSelector('button[aria-label="Убрать фильтр: Duo"]');
      await page.click('button[aria-label="Убрать фильтр: Duo"]');
      await page.click('button::-p-text(Аберрация)');
      await page.waitForFunction(() => document.querySelector('.bg-library-controls [role=status]')?.textContent.includes('1 найдено'));
      await page.focus('.bg-library-control-advanced summary');
      await page.keyboard.press('Enter');
      assert.equal(await page.$eval('.bg-library-control-advanced', element => element.open), true);
    }
    for (const width of [390, 1440]) {
      await page.setViewport({ width, height: 900 });
      await page.goto(runtime.storyUrl('battlegrounds-librarycontrols--compact'), { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelector('.bg-library-controls [role=status]')?.textContent.includes('273 найдено'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.$$eval('.bg-library-control-row:nth-child(2) button', nodes => nodes.length), 12);
      if (width === 390) {
        await page.focus('.bg-library-control-row:nth-child(2) button:last-child');
        const position = await page.$eval('.bg-library-control-row:nth-child(2) button:last-child', element => {
          const rect = element.getBoundingClientRect();
          const row = element.parentElement.getBoundingClientRect();
          return { left: rect.left, right: rect.right, rowLeft: row.left, rowRight: row.right };
        });
        assert.ok(position.left >= position.rowLeft && position.right <= position.rowRight, 'keyboard focus scrolls the tribe into view');
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
  } finally { await browser.close(); await runtime.close(); }
});
