import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
// RADAR_SCREENSHOT_DIR=<папка> сохраняет снимки страницы на 1440 и 412 px.
const screenshots = process.env.RADAR_SCREENSHOT_DIR;

async function pageState(page) {
  await page.evaluate(axe);
  return page.evaluate(async () => ({
    h1: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
    overflow: document.documentElement.scrollWidth > innerWidth,
    violations: (await axe.run(document.querySelector('main'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      .violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })),
  }));
}

const names = page => page.$$eval('#radar-panel .radar-candidate h3', nodes => nodes.map(node => node.textContent));

test('the radar renders the demo forecast on the server, switches sections and filters candidates', { timeout: 240000 }, async () => {
  const pilot = await startPublicCardPilot({ pagesEnabled: true, backendEnv: { RADAR_FIXTURE: '1' } });
  let browser;
  try {
    const api = await fetch(`${pilot.origin}/api/radar`);
    assert.equal(api.status, 200);
    assert.equal(api.headers.get('cache-control'), 'no-store');
    assert.equal((await api.json()).demo, true);

    // Первый запрос к свежему серверу грузит модули маршрута и может не уложиться в бюджет первого кадра.
    await (await fetch(`${pilot.origin}/standard/radar/`)).text();
    const document = await fetch(`${pilot.origin}/standard/radar/`);
    assert.equal(document.status, 200);
    const html = await document.text();
    assert.match(html, /<h1[^>]*>Радар нерфов и баффов<\/h1>/);
    assert.match(html, /Это прогноз, а не официальная информация\./, 'the disclaimer is in the server HTML');
    assert.match(html, /Демонстрационные данные\./);
    assert.match(html, /Ритуал призыва/, 'the forecast is in the server HTML');
    assert.match(html, /<meta name="robots" content="noindex, follow"\/>/, 'demo data is never indexed');
    assert.match(html, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/standard\/radar\/"/);
    assert.match(html, /<title>Радар нерфов и баффов Hearthstone \d{4}: прогноз изменений баланса \| HearthPulse<\/title>/);
    assert.match(html, /href="\/standard\/radar\/"/, 'the menu links the page');

    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    if (screenshots) mkdirSync(screenshots, { recursive: true });
    for (const [width, height] of [[1440, 900], [412, 915]]) {
      await page.setViewport({ width, height, isMobile: width < 600, hasTouch: width < 600 });
      await page.goto(`${pilot.origin}/standard/radar/`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('#radar-panel .radar-candidate');
      const state = await pageState(page);
      assert.deepEqual(state.h1, ['Радар нерфов и баффов']);
      assert.equal(state.overflow, false, `no horizontal overflow at ${width}px`);
      assert.deepEqual(state.violations, [], `axe at ${width}px`);
      const small = await page.$$eval('.radar-tab, .radar-chip, .radar-select', nodes => nodes
        .filter(node => node.getBoundingClientRect().height < 42).map(node => node.textContent));
      assert.deepEqual(small, [], `touch targets at ${width}px`);
      if (screenshots) await page.screenshot({ path: join(screenshots, `radar-${width}.png`), fullPage: true });
    }

    assert.deepEqual((await names(page)).slice(0, 3), ['Ритуал призыва', 'Ритуал К\'Туна', 'Крестный отец Казакус'], 'nerfs first, by confidence');
    assert.equal(await page.$eval('.radar-candidate [role="meter"]', node => node.getAttribute('aria-valuenow')), '70');
    assert.match(await page.$eval('.radar-confidence__change', node => node.textContent ?? ''), /−5 с прошлого раза/);
    assert.equal(await page.$eval('.radar-candidate__identity', node => node.getAttribute('href')), '/standard/cards/standard/BE_085/');
    assert.equal(await page.$eval('.radar-candidate[data-kind="archetype"] .radar-candidate__identity', node => node.getAttribute('href')),
      '/standard/archetypes/standard/c-thun-dh/', 'HSGuru archetype names become site slugs');
    assert.equal(await page.$eval('.radar-post', node => node.getAttribute('rel')), 'noopener noreferrer nofollow ugc');
    assert.deepEqual(await page.$eval('.radar-candidate .radar-precedent', node => [
      node.dataset.direction, node.querySelector('.radar-precedent__changes')?.textContent,
      [...node.querySelectorAll('a')].map(link => link.getAttribute('href'))]),
    ['nerf', 'Стоимость 1 → 2, атака 1 → 2', ['/standard/cards/wild/JAIL_802/', '/standard/patches/?version=36.2.2']],
    'the first candidate shows the past Blizzard change it rests on');
    assert.match(await page.$eval('#radar-patterns-title', node => node.closest('section')?.textContent ?? ''),
      /разобрано 52 балансных патча[\s\S]*Нерфы приходят к сильным и популярным колодам/, 'Blizzard patterns from the run history');

    await page.click('#radar-tab-buffs');
    await page.waitForFunction(() => document.querySelector('#radar-tab-buffs')?.getAttribute('aria-selected') === 'true');
    assert.equal(new URL(page.url()).hash, '#buffs');
    assert.deepEqual(await names(page), ['Друид', 'Оживитель железа', 'Маг', 'Агент Н\'Зота']);
    assert.equal(await page.$eval('.radar-candidate[data-kind="class"] .radar-candidate__identity', node => node.tagName), 'DIV',
      'a class has no page to link');

    await page.select('.radar-select', 'mage');
    await page.waitForFunction(() => document.querySelectorAll('#radar-panel .radar-candidate').length === 1);
    await page.select('.radar-select', 'all');
    await page.click('.radar-chips[aria-label="Уверенность"] button:last-child');
    await page.waitForSelector('.radar-empty');
    assert.match(await page.$eval('.radar-empty', node => node.textContent ?? ''), /Под выбранные фильтры кандидатов нет\./);
    await page.click('.radar-empty button');
    await page.waitForFunction(() => document.querySelectorAll('#radar-panel .radar-candidate').length === 4);
    await page.focus('#radar-tab-buffs');
    await page.keyboard.press('Home');
    await page.waitForFunction(() => document.activeElement?.id === 'radar-tab-nerfs'
      && document.querySelector('#radar-tab-nerfs')?.getAttribute('aria-selected') === 'true');

    await page.evaluate(() => { window.location.hash = 'nerfs'; });
    await page.waitForFunction(() => document.querySelector('#radar-tab-nerfs')?.getAttribute('aria-selected') === 'true');
    const shared = await browser.newPage();
    shared.on('pageerror', error => errors.push(error.message));
    await shared.goto(`${pilot.origin}/standard/radar/#buffs`, { waitUntil: 'networkidle2' });
    await shared.waitForFunction(() => document.querySelector('#radar-tab-buffs')?.getAttribute('aria-selected') === 'true');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await pilot.close();
  }
});
