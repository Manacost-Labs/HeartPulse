import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { TimeoutError } from 'puppeteer';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
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

// A press the page may not have handled yet is repeated until its visible effect shows. Server HTML is
// clickable before React has hydrated it, and on a busy runner a press can also land while the page is
// still moving; the locator waits for the target to hold still, the effect decides whether it worked.
const PRESS_EFFECT_MS = 4000;
const PRESS_ATTEMPTS = 5;
async function pressUntil(page, target, effect, ...args) {
  for (let attempt = 1; ; attempt += 1) {
    await page.locator(target).click();
    try {
      await page.waitForFunction(effect, { timeout: PRESS_EFFECT_MS }, ...args);
      return;
    } catch (error) {
      if (!(error instanceof TimeoutError) || attempt === PRESS_ATTEMPTS) throw error;
    }
  }
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

    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Chrome cancels in-flight requests with ERR_NETWORK_CHANGED whenever the host's network interfaces change
    // (containers starting on a busy machine); that is the host, not a page error.
    page.on('console', message => {
      if (message.type() === 'error' && message.text() !== 'Failed to load resource: net::ERR_NETWORK_CHANGED') errors.push(message.text());
    });
    // Picking a candidate scrolls its card into view; the smooth scroll keeps the page moving for seconds on a busy runner.
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
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

    assert.equal((await names(page)).length, 17, 'every nerf candidate of the run');
    assert.equal((await names(page))[0], 'Ритуал призыва', 'nerfs by confidence');
    assert.equal(await page.$eval('.radar-candidate [role="meter"]', node => node.getAttribute('aria-valuenow')), '62');
    assert.equal(await page.$eval('.radar-candidate .radar-confidence__head .radar-muted', node => node.textContent), 'средняя · −8',
      'level and change since the last run, muted');
    assert.deepEqual(await page.$$eval('.radar-top .radar-top__name', nodes => nodes.map(node => node.textContent)),
      ['Ритуал призыва', 'Зоолок', 'Ритуал К\'Туна'], 'three top candidates on top');
    assert.equal(await page.$eval('.radar-summary', node => [...node.querySelectorAll('.radar-more > summary')].map(item => item.textContent).join('|')),
      'Подробнее|С прошлого прогона', 'the rest of the summary waits behind two toggles');
    assert.match(await page.$eval('#radar-panel > .radar-list > li:first-child .radar-candidate__change', node => node.textContent ?? ''),
      /^Вероятная правкаСтоимость 2 → 3 · 55%$/, 'one likely-change line');
    assert.equal(await page.$('.radar-candidate__head svg, .radar-candidate__why svg, .radar-candidate__change svg, .radar-stat'), null, 'no icons or badges in the cards');
    assert.match(await page.$eval('#radar-trust-title', node => node.closest('section')?.textContent ?? ''),
      /8 прошлых патчах[\s\S]*Нерфы[\s\S]*в первых 5: 11 из 22/, 'radar accuracy from the backtest');
    assert.deepEqual(await page.evaluate(() => [document.querySelectorAll('[lang="en"]').length, document.querySelectorAll('.radar-sources').length]),
      [0, 0], 'no English captions and no sources block');
    assert.equal(await page.evaluate(() => document.body.textContent?.includes('Снежная буря')), false, 'Blizzard stays Blizzard');
    const first = '#radar-panel > .radar-list > li:first-child .radar-candidate';
    assert.equal(await page.$eval(`${first} .radar-part`, node => node.checkVisibility()), false, 'details wait behind «Подробнее»');
    await page.locator(`${first} .radar-candidate__more > summary`).click();
    const opened = await page.$eval(first, node => ({
      parts: [...node.querySelectorAll('.radar-part > h4')].map(title => title.textContent),
      facts: [...node.querySelectorAll('.radar-fact dt')].map(term => term.textContent),
      why: node.querySelectorAll('.radar-part:nth-of-type(2) li').length,
      before: [...node.querySelectorAll('.radar-part:nth-of-type(3) li')].map(item => item.textContent),
      posts: node.querySelectorAll('.radar-post').length,
      full: node.querySelector('.radar-candidate__full > summary')?.textContent,
      tables: node.querySelectorAll('table').length,
    }));
    assert.deepEqual(opened.parts, ['Цифры', 'Почему', 'Как раньше', 'Сообщество'], 'four sections of one structure');
    assert.deepEqual(opened.facts, ['Винрейт', 'Популярность', 'Сыграна'], 'numbers as chips');
    assert.ok(opened.why > 0 && opened.why <= 3, 'at most three reasons');
    assert.equal(opened.before[0], 'Прозорливый дракозмей · нерф в патче 35.2.2 — Атака: 6 → 5', 'a precedent in one line');
    assert.ok(opened.posts > 0 && opened.posts <= 3, 'at most three posts');
    assert.deepEqual([opened.full, opened.tables], ['Полный разбор', 0], 'everything else behind one toggle, no tables');
    await page.locator(`${first} .radar-candidate__full > summary`).click();
    assert.match(await page.$eval(`${first} .radar-candidate__full`, node => node.textContent ?? ''),
      /Варианты правки\.[\s\S]*55%[\s\S]*Уверенность по прогонам\. 75 → 70 → 62[\s\S]*По периодам/, 'the full breakdown');
    assert.deepEqual(await page.$eval(`${first} .radar-post`, node => [node.getAttribute('target'), node.querySelector('.radar-post__text'),
      node.querySelector('.radar-post__open')?.textContent]), ['_blank', null, 'Открыть обсуждение ↗'],
    'an untranslated post shows no English text, only a link to the discussion');
    assert.equal(await page.$eval('.radar-candidate__identity', node => node.getAttribute('href')), '/standard/cards/standard/BE_085/');
    assert.equal(await page.$eval('.radar-candidate[data-kind="archetype"] .radar-candidate__identity', node => node.getAttribute('href')),
      '/standard/archetypes/standard/zoolock/', 'HSGuru archetype names become site slugs');
    assert.equal(await page.$eval('.radar-post', node => node.getAttribute('rel')), 'noopener noreferrer nofollow ugc');
    await pressUntil(page, '.radar-top li:nth-child(2) button',
      () => document.querySelector('#radar-nerfs-archetype-standard-Zoolock details')?.open === true);
    assert.match(await page.$eval('#radar-patterns-title', node => node.closest('section')?.textContent ?? ''),
      /разобрано 52 балансных патча[\s\S]*Нерфы приходят к сильным и популярным колодам/, 'Blizzard patterns from the run history');

    await pressUntil(page, '#radar-tab-buffs', () => document.querySelector('#radar-tab-buffs')?.getAttribute('aria-selected') === 'true');
    assert.equal(new URL(page.url()).hash, '#buffs');
    assert.deepEqual((await names(page)).slice(0, 2), ['Друид', 'Оживитель железа']);
    assert.equal(await page.$eval('.radar-candidate[data-kind="class"] .radar-candidate__identity', node => node.tagName), 'DIV',
      'a class has no page to link');

    const buffs = (await names(page)).length;
    await page.select('.radar-select', 'mage');
    await page.waitForFunction(total => {
      const shown = document.querySelectorAll('#radar-panel .radar-candidate').length;
      return shown > 0 && shown < total;
    }, {}, buffs);
    await page.select('.radar-select', 'all');
    // The strictest confidence filter leaves no buff candidates: the panel says so and offers to reset the filters.
    await pressUntil(page, '.radar-chips[aria-label="Уверенность"] button::-p-text(от 75)',
      () => document.querySelector('#radar-panel')?.textContent?.includes('Под выбранные фильтры кандидатов нет.') === true);
    assert.equal(await page.$eval('.radar-chips[aria-label="Уверенность"] button[aria-pressed="true"]', node => node.textContent), 'от 75');
    assert.equal((await names(page)).length, 0, 'no candidate is left under the filters');
    await pressUntil(page, '#radar-panel button::-p-text(Сбросить фильтры)',
      total => document.querySelectorAll('#radar-panel .radar-candidate').length === total, buffs);
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
