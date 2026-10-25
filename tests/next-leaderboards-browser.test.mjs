import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
// LEADERBOARDS_SCREENSHOT_DIR=<папка> сохраняет снимки страницы на 1440 и 412 px.
const screenshots = process.env.LEADERBOARDS_SCREENSHOT_DIR;

async function pageState(page) {
  await page.evaluate(axe);
  return page.evaluate(async () => ({
    h1: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
    overflow: document.documentElement.scrollWidth > innerWidth,
    violations: (await axe.run(document.querySelector('main'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      .violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })),
  }));
}

const firstNames = page => page.$$eval('.leaderboards-table tbody tr td:nth-child(2)', nodes => nodes.slice(0, 3).map(node => node.textContent));

test('the leaderboards page renders the table on the server, switches modes, searches and opens a player', { timeout: 240000 }, async () => {
  const pilot = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  try {
    const api = await fetch(`${pilot.origin}/api/leaderboards/table?mode=battlegrounds&region=EU`);
    assert.equal(api.status, 200);
    assert.equal((await api.json()).rows[0].name, 'XQN');
    assert.equal((await fetch(`${pilot.origin}/api/leaderboards/table?mode=wild&region=EU`)).status, 404, 'an uncollected board is 404');

    // Первый запрос к свежему серверу грузит модули маршрута и может не уложиться в бюджет первого кадра.
    await (await fetch(`${pilot.origin}/leaderboards/`)).text();
    const document = await fetch(`${pilot.origin}/leaderboards/`);
    assert.equal(document.status, 200);
    const html = await document.text();
    assert.match(html, /<h1[^>]*>Таблицы лидеров<\/h1>/);
    assert.match(html, /TrueBench/, 'the first page of the table is in the server HTML');
    assert.match(html, /Игроков/, 'the summary is in the server HTML');
    assert.match(html, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/leaderboards\/"/);
    assert.match(html, /<title>Таблицы лидеров Hearthstone \d{4}: официальный рейтинг Blizzard \| HearthPulse<\/title>/);
    assert.match(html, /href="\/leaderboards\/"/, 'the menu links the page');
    assert.doesNotMatch(html, /noindex/, 'the page is indexable');

    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    if (screenshots) mkdirSync(screenshots, { recursive: true });
    for (const [width, height] of [[1440, 900], [412, 915]]) {
      await page.setViewport({ width, height, isMobile: width < 600, hasTouch: width < 600 });
      await page.goto(`${pilot.origin}/leaderboards/?mode=battlegrounds`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.leaderboards-table tbody tr');
      await page.waitForSelector('.leaderboards-charts svg');
      const state = await pageState(page);
      assert.deepEqual(state.h1, ['Таблицы лидеров']);
      assert.equal(state.overflow, false, `no horizontal overflow at ${width}px`);
      assert.deepEqual(state.violations, [], `axe at ${width}px`);
      const small = await page.$$eval('.leaderboards-chip, .leaderboards-select, .leaderboards-search', nodes => nodes
        .filter(node => node.getBoundingClientRect().height < 42).map(node => node.textContent));
      assert.deepEqual(small, [], `touch targets at ${width}px`);
      if (screenshots) await page.screenshot({ path: join(screenshots, `leaderboards-${width}.png`), fullPage: true });
    }

    // Взаимодействия — на ширине ноутбука; телефонные размеры проверены выше.
    await page.setViewport({ width: 1440, height: 900 });
    assert.deepEqual(await firstNames(page), ['XQN', 'Bob2', 'Bob3']);
    assert.deepEqual(await page.$$eval('.leaderboards-table thead th', nodes => nodes.map(node => node.textContent)),
      ['Место', 'Игрок', 'Рейтинг', 'За сутки'], 'a rated mode shows its rating and the day change');
    assert.deepEqual(await page.$$eval('.leaderboards-table tbody tr:nth-child(-n+3) td:last-child [aria-hidden]', nodes => nodes.map(node => node.textContent)),
      ['▲ 1', '▼ 1', 'Новый']);
    assert.match(await page.$eval('.leaderboards', node => node.textContent ?? ''), /Топ-1\u00a0000[\s\S]*Место[\s\S]*Распределение рейтинга/,
      'thresholds above the table, charts below it');

    await page.click('.leaderboards-modes button:first-child');
    await page.waitForFunction(() => document.querySelector('.leaderboards-table tbody td:nth-child(2)')?.textContent === 'TrueBench');
    assert.equal(new URL(page.url()).search, '', 'the default selection keeps the URL clean');
    assert.deepEqual(await page.$$eval('.leaderboards-table thead th', nodes => nodes.map(node => node.textContent)),
      ['Место', 'Игрок', 'За сутки'], 'Standard has no rating column');

    await page.click('.leaderboards-modes button:nth-child(3)');
    await page.waitForFunction(() => document.querySelector('.leaderboards-table tbody td:nth-child(2)')?.textContent === 'XQN');
    await page.type('.leaderboards-search input', 'bob12');
    await page.waitForFunction(() => document.querySelectorAll('.leaderboards-table tbody tr').length === 11);
    assert.match(new URL(page.url()).search, /q=bob12/, 'the search is in the URL');
    await page.focus('.leaderboards-search input');
    for (let index = 0; index < 'bob12'.length; index += 1) await page.keyboard.press('Backspace');
    await page.waitForFunction(() => document.querySelector('.leaderboards-table tbody td:nth-child(2)')?.textContent === 'XQN');

    await page.click('.leaderboards-table tbody tr:first-child .leaderboards-player-link');
    await page.waitForSelector('.leaderboards-player__current');
    assert.match(await page.$eval('.leaderboards-player', node => node.textContent ?? ''), /XQN[\s\S]*Поля сражений1 место/);
    assert.match(await page.$eval('.leaderboards-player', node => node.textContent ?? ''), /Место по дням/);
    assert.equal(await page.$$eval('.leaderboards-player__seasons tbody tr', nodes => nodes.length), 2, 'every stored season of the player');
    assert.match(new URL(page.url()).search, /player=XQN/);
    if (screenshots) await page.screenshot({ path: join(screenshots, 'leaderboards-player-412.png'), fullPage: true });
    await page.click('.leaderboards-player__close');
    await page.waitForFunction(() => !document.querySelector('.leaderboards-player'));

    await page.click('.leaderboards-pages button:nth-child(4)');
    await page.waitForFunction(() => document.querySelector('.leaderboards-table tbody td')?.textContent === '51');
    assert.match(new URL(page.url()).search, /page=2/);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await pilot.close();
  }
});
