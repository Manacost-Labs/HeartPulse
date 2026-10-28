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
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for the HSGuru archetype stats test');

// The archetype page's HSGuru slice section on a real answer of 25.10.2026:
// the collected Legend · Bans card slice, a slice still being collected (the
// older Legend · week analysis fills it under its own label) and a phone width.
const storybook = await startStorybookStatic();
const story = name => storybook.storyUrl(`archetype-detail-hsguru-slice-stats--${name}`);

let browser;
try {
  browser = await launchBrowser({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  await openStory(page, story('collected'));
  await page.waitForSelector('.hsguru-slice__summary');
  const collected = await page.evaluate(() => ({
    summary: document.querySelector('.hsguru-slice__summary')?.textContent,
    filters: [...document.querySelectorAll('.hsguru-slice select')].map(select => select.selectedOptions[0]?.textContent),
    phases: [...document.querySelectorAll('.constructed-card-stats__table th')].map(cell => cell.textContent?.trim()),
    eyebrows: [...document.querySelectorAll('.constructed-analysis-panel .archetypes-eyebrow')].map(node => node.textContent?.trim()),
    rows: document.querySelectorAll('.constructed-card-stats__table tbody tr').length,
  }));
  assert.match(collected.summary ?? '', /^HSGuru · 49\s117 игр · обновлено /);
  assert.deepEqual(collected.filters, ['Баны', 'Легенда', 'Любая очерёдность', 'Любой соперник']);
  assert.deepEqual(collected.phases.slice(0, 5), ['Карта', 'Муллиган', 'Добор', 'Не пришла', 'Оставлена']);
  assert.deepEqual(collected.eyebrows, ['HSGuru · Легенда · Неделя', 'HSGuru · Легенда · Баны'],
    'class matchups of the slice are not collected yet, so the week slice fills them under its own label');
  assert.equal(collected.rows, 12);

  await page.select('.hsguru-slice__field:nth-child(3) select', 'on_coin');
  await page.waitForSelector('.hsguru-collecting');
  const pending = await page.evaluate(() => ({
    notice: document.querySelector('.hsguru-collecting')?.textContent,
    picks: [...document.querySelectorAll('.hsguru-collecting__picks button')].map(button => button.textContent),
    cards: document.querySelector('.constructed-card-stats .archetypes-eyebrow')?.textContent?.trim(),
  }));
  assert.match(pending.notice ?? '', /Срез «Легенда · Баны · С монеткой» ещё собирается/);
  assert.match(pending.notice ?? '', /собрано 520 из 8\s720 срезов \(5%\)/);
  assert.equal(pending.picks[0], 'Легенда · Баны');
  assert.equal(pending.cards, 'HSGuru · Легенда · Неделя');
  await page.click('.hsguru-collecting__picks button');
  await page.waitForSelector('.hsguru-collecting', { hidden: true });

  await openStory(page, story('nothing-collected'));
  await page.waitForSelector('.constructed-analysis-empty');
  const empty = await page.$$eval('.constructed-analysis-empty', nodes => nodes.map(node => node.textContent));
  assert.deepEqual(empty, ['Матчапы по классам для этого среза ещё собираются.', 'Статистика карт для этого среза ещё собирается.']);

  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await openStory(page, story('collected'));
  await page.waitForSelector('.hsguru-slice__summary');
  const phone = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    columns: getComputedStyle(document.querySelector('.hsguru-slice__filters')).gridTemplateColumns.split(' ').length,
    targets: [...document.querySelectorAll('.hsguru-slice__field')].map(field => field.getBoundingClientRect().height),
  }));
  assert.ok(phone.overflow <= 0, `the phone page scrolls sideways by ${phone.overflow}px`);
  assert.equal(phone.columns, 2);
  assert.ok(phone.targets.every(height => height >= 42), `filters are at least 42px tall: ${phone.targets}`);
  assert.deepEqual(runtimeErrors, []);
} finally {
  await browser?.close();
  await storybook.close();
}
