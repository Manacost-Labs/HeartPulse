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

test('the leaderboards page renders the table on the server, switches modes, jumps to places, searches and opens a player', { timeout: 240000 }, async () => {
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
      const small = await page.$$eval('.leaderboards-chip, .leaderboards-select, .leaderboards-search, .leaderboards-jump, .leaderboards-summary__jump', nodes => nodes
        .filter(node => node.getBoundingClientRect().height < 42).map(node => node.textContent));
      assert.deepEqual(small, [], `touch targets at ${width}px`);
      if (screenshots) await page.screenshot({ path: join(screenshots, `leaderboards-${width}.png`), fullPage: true });
    }

    // Взаимодействия — на ширине ноутбука; телефонные размеры проверены выше.
    await page.setViewport({ width: 1440, height: 900 });
    assert.deepEqual(await firstNames(page), ['XQN', 'Bob2', 'Bob3']);
    assert.deepEqual(await page.$$eval('.leaderboards-table thead th', nodes => nodes.map(node => node.textContent)),
      ['Место', 'Игрок', 'За сутки', 'Рейтинг'], 'a rated mode shows the day change and its rating on the right');
    assert.deepEqual(await page.$$eval('.leaderboards-table tbody tr:nth-child(-n+3) .leaderboards-change [aria-hidden]', nodes => nodes.map(node => node.textContent)),
      ['↑1', '↓1', 'новый']);
    assert.deepEqual(await page.$$eval('.leaderboards-table tbody tr:nth-child(-n+3) .leaderboards-medal', nodes => nodes.map(node => node.dataset.place)),
      ['1', '2', '3'], 'the top three get medals');
    assert.match(await page.$eval('.leaderboards', node => node.textContent ?? ''), /6\u00a0543 игрока[\s\S]*топ-1\u00a0000 18\u00a0104[\s\S]*Распределение рейтинга[\s\S]*Место/,
      'one summary line and the rating histogram above the table');
    assert.equal(await page.$$eval('.leaderboards-histogram__bars span', nodes => nodes.length), 8);
    assert.deepEqual(await page.$$eval('.leaderboards-table tbody tr:nth-child(-n+5) .leaderboards-streamer', nodes => nodes.map(node => node.getAttribute('href'))),
      ['/streamers/moquaitv/', '/streamers/ramses/'], 'catalog streamers get a badge linking their page');

    await page.click('.leaderboards-summary__jump:first-of-type');
    await page.waitForFunction(() => document.querySelector('.leaderboards-table tr[data-target] td')?.textContent === '100');
    assert.equal(new URL(page.url()).searchParams.get('rank'), '100', 'a threshold jumps to its place');
    await page.type('.leaderboards-jump input', '1234');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.leaderboards-table tr[data-target] td')?.textContent === '1\u00a0234');
    assert.match(new URL(page.url()).search, /rank=1234/, 'the place is in the URL');
    // Прокрутка плавная: ждём, пока строка окажется на экране.
    await page.waitForFunction(() => {
      const box = document.querySelector('.leaderboards-table tr[data-target]')?.getBoundingClientRect();
      return Boolean(box && box.top >= 0 && box.bottom <= innerHeight);
    }, { timeout: 5000 });

    await page.click('.leaderboards-modes button:first-child');
    await page.waitForFunction(() => document.querySelector('.leaderboards-table tbody td:nth-child(2)')?.textContent === 'TrueBench');
    assert.equal(new URL(page.url()).search, '', 'the default selection keeps the URL clean');
    assert.deepEqual(await page.$$eval('.leaderboards-table thead th', nodes => nodes.map(node => node.textContent)),
      ['Место', 'Игрок', 'За сутки'], 'Standard has no rating column');

    await page.click('.leaderboards-modes button:nth-child(5)');
    await page.waitForFunction(() => document.querySelector('.leaderboards-message h2')?.textContent === 'Данные собираются');
    assert.equal(await page.$('.leaderboards-table'), null, 'a mode without seasons shows no stale table');
    if (screenshots) await page.screenshot({ path: join(screenshots, 'leaderboards-collecting-1440.png') });

    await page.click('.leaderboards-modes button:nth-child(3)');
    await page.waitForFunction(() => document.querySelector('.leaderboards-table tbody td:nth-child(2)')?.textContent === 'XQN');
    assert.equal(new URL(page.url()).searchParams.get('rank'), null, 'another table forgets the place');
    await page.type('.leaderboards-search input', 'bob651');
    await page.waitForFunction(() => document.querySelectorAll('.leaderboards-table tbody tr').length === 11);
    assert.match(new URL(page.url()).search, /q=bob651/, 'the search is in the URL');
    await page.focus('.leaderboards-search input');
    for (let index = 0; index < 'bob651'.length; index += 1) await page.keyboard.press('Backspace');
    await page.waitForFunction(() => document.querySelector('.leaderboards-table tbody td:nth-child(2)')?.textContent === 'XQN');

    await page.click('.leaderboards-table tbody tr:first-child .leaderboards-player-link');
    await page.waitForSelector('.leaderboards-player__seasons li');
    const card = await page.$eval('.leaderboards-player', node => node.textContent ?? '');
    assert.match(card, /XQN[\s\S]*Лучшее место — 1[\s\S]*Сезон 19 по дням[\s\S]*1 место · 20\u00a0104/, 'best place and the day chart of the season');
    assert.equal(await page.$$eval('.leaderboards-player__seasons li', nodes => nodes.length), 2, 'every stored season of the player');
    assert.equal(await page.$$eval('.leaderboards-spark circle', nodes => nodes.length), 2);
    assert.match(new URL(page.url()).search, /player=XQN/);
    const [cardBox, tableBox] = await Promise.all(['.leaderboards-player', '.leaderboards-table'].map(selector => page.$eval(selector, node => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right };
    })));
    assert.ok(cardBox.left >= tableBox.right, 'on a laptop the card stands beside the table');
    if (screenshots) await page.screenshot({ path: join(screenshots, 'leaderboards-player-1440.png') });

    await page.click('.leaderboards-player__head button[aria-pressed]');
    await page.waitForSelector('.leaderboards-player__head button[aria-pressed="true"]');
    await page.click('.leaderboards-player__close');
    await page.waitForFunction(() => !document.querySelector('.leaderboards-player'));
    await page.click('.leaderboards-pages button:nth-child(4)');
    await page.waitForFunction(() => document.querySelector('.leaderboards-table tbody td')?.textContent === '51');
    await page.click('.leaderboards-me');
    await page.waitForFunction(() => document.querySelector('.leaderboards-table tr[data-target] td')?.textContent?.trim() === '1');
    assert.match(new URL(page.url()).search, /rank=1&player=XQN/, '«to my name» opens my place and card');
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
