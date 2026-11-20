import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startMetaReportStand } from './helpers/metaReportStand.mjs';

// A reader opens the archive, follows a report and pages between the weeks on a phone (390 px)
// and a desktop (1440 px): the report reads without horizontal scrolling of the page, its tables
// stay inside their box, the links lead to the neighbouring weeks, and nothing throws.

test('the archive and the weekly reports read at 390 and 1440 px and link the weeks to each other', async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const stand = await startMetaReportStand();
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const width of [390, 1440]) {
      await page.setViewport({ width, height: 900 });
      await page.goto(`${stand.origin}/reports/meta/`, { waitUntil: 'networkidle2' });
      assert.equal(await page.$eval('h1', node => node.textContent), 'Мета-отчёты Hearthstone по неделям');
      await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.$eval('a[href="/reports/meta/2026-11-30/"]', link => link.click())]);
      assert.equal(new URL(page.url()).pathname, '/reports/meta/2026-11-30/');

      const state = await page.evaluate(() => ({
        heading: document.querySelector('h1')?.textContent,
        sections: [...document.querySelectorAll('main h2')].map(node => node.textContent),
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        tablesInside: [...document.querySelectorAll('main table')].every(table => {
          const box = table.parentElement.getBoundingClientRect();
          return box.left >= 0 && box.right <= innerWidth;
        }),
        firstRow: document.querySelector('main tbody tr')?.innerText.replace(/\s+/g, ' ').trim(),
      }));
      assert.deepEqual(state, {
        heading: 'Мета Hearthstone на 30 ноября 2026: еженедельный отчёт',
        sections: ['Стандарт: Алмаз — Легенда', 'Матчапы самых популярных архетипов', 'Арена: классы по проценту побед',
          'Поля сражений: лучшие герои', 'Патч недели'],
        pageOverflow: false,
        tablesInside: true,
        firstRow: '1 Йогг Воин 60,2% +1,1 п.п. 3,0% +0,1 п.п. 8 100 +2 100 за неделю',
      }, `report at ${width}px`);

      await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.$eval('a[rel="next"]', link => link.click())]);
      assert.equal(new URL(page.url()).pathname, '/reports/meta/2026-12-07/');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `next week at ${width}px`);
      await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.$eval('a[rel="prev"]', link => link.click())]);
      assert.equal(new URL(page.url()).pathname, '/reports/meta/2026-11-30/');
    }
    assert.deepEqual(errors, [], 'the pages run without errors');
  } finally {
    await browser?.close();
    await stand.close();
  }
});
