import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Задерживает ответы API, адрес которых подходит под `match`, до `release()`:
 * так в тесте получается «B ещё грузится», когда зритель уже вернулся к A.
 */
function holdRequests(page) {
  const holds = [];
  page.on('request', request => {
    const hold = holds.find(item => item.match(request.url()));
    if (hold) hold.requests.push(request);
    else void request.continue().catch(() => undefined);
  });
  return match => {
    const hold = { match, requests: [] };
    holds.push(hold);
    return {
      seen: () => waitFor(() => hold.requests.length > 0),
      release: () => {
        holds.splice(holds.indexOf(hold), 1);
        for (const request of hold.requests.splice(0)) void request.continue().catch(() => undefined);
      },
    };
  };
}

async function waitFor(predicate, timeout = 10000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error('the held request never left the page');
    await pause(25);
  }
}

/** Таблица на месте и не приглушена, первым — `name`; иначе — что видно на странице. */
async function settledOn(page, name, label) {
  try {
    await page.waitForFunction(first => {
      const table = document.querySelector('.leaderboards-table:not(.leaderboards-table--skeleton)');
      return table && !table.hasAttribute('aria-busy') && table.querySelector('tbody td:nth-child(2)')?.textContent === first;
    }, { timeout: 5000 }, name);
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.search,
      busy: document.querySelector('.leaderboards-table')?.getAttribute('aria-busy') ?? null,
      skeleton: Boolean(document.querySelector('.leaderboards-table--skeleton')),
      first: document.querySelector('.leaderboards-table tbody td:nth-child(2)')?.textContent ?? null,
    }));
    throw new Error(`${label}: ${error.message}; page: ${JSON.stringify(state)}`);
  }
}

const tableRequest = (query, absent = []) => url => url.includes('/api/leaderboards/table?')
  && query.every(part => url.includes(part)) && absent.every(part => !url.includes(part));

test('leaderboards: returning to a loaded table while another is pending shows it again; an unknown season says so', { timeout: 240000 }, async () => {
  const pilot = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 900 });
    await page.setRequestInterception(true);
    const hold = holdRequests(page);
    await page.goto(`${pilot.origin}/leaderboards/?mode=battlegrounds`, { waitUntil: 'networkidle2' });
    await settledOn(page, 'XQN', 'first paint');

    // A → B (B ещё грузится) → A: раньше страница оставалась в загрузке B навсегда.
    const standard = hold(url => url.includes('/api/leaderboards/') && url.includes('mode=standard'));
    await page.click('.leaderboards-modes button:nth-child(1)');
    await standard.seen();
    await page.click('.leaderboards-modes button:nth-child(3)');
    await settledOn(page, 'XQN', 'Battlegrounds → Standard (pending) → Battlegrounds');
    await page.waitForSelector('.leaderboards-charts svg', { timeout: 5000 });
    standard.release();
    await pause(300);
    await settledOn(page, 'XQN', 'the late Standard answer does not replace Battlegrounds');

    // Поиск набран и стёрт, пока его ответ не пришёл.
    const search = hold(tableRequest(['q=zz']));
    await page.type('.leaderboards-search input', 'zz');
    await search.seen();
    await page.focus('.leaderboards-search input');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await settledOn(page, 'XQN', 'search typed and cleared while pending');
    search.release();

    // Страница 2 ещё грузится, а зритель переходит к месту на первой.
    const second = hold(tableRequest(['page=2'], ['q=']));
    await page.click('.leaderboards-pages button:nth-child(4)');
    await second.seen();
    await page.type('.leaderboards-jump input', '5');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.leaderboards-table:not([aria-busy]) tr[data-target] td')?.textContent === '5', { timeout: 5000 });
    second.release();

    // Карточка игрока: другой игрок ещё грузится, а зритель вернулся к первому.
    await page.click('.leaderboards-table tbody tr:first-child td:last-child');
    await page.waitForSelector('.leaderboards-player__seasons li');
    const other = hold(url => url.includes('/api/leaderboards/player?') && url.includes('name=Bob2'));
    await page.click('.leaderboards-table tbody tr:nth-child(2) td:last-child');
    await other.seen();
    await page.click('.leaderboards-table tbody tr:first-child td:last-child');
    await page.waitForSelector('.leaderboards-player__seasons li', { timeout: 5000 });
    other.release();
    await page.click('.leaderboards-player__close');

    for (const [mode, first] of [['battlegrounds', 'XQN'], ['standard', 'TrueBench']]) {
      const current = mode === 'standard' ? '' : `?mode=${mode}`;
      // Сезона нет среди сохранённых: честное сообщение без «Повторить» и ссылка на текущий сезон.
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(`${pilot.origin}/leaderboards/?mode=${mode}&season=999999`, { waitUntil: 'networkidle2' });
      assert.equal(await page.$eval('.leaderboards-message h2', node => node.textContent), 'Сезона 999999 нет в таблицах');
      assert.equal(await page.$('[role="alert"]'), null, 'an unknown season is not an outage');
      assert.equal(await page.$('.leaderboards-table'), null);
      assert.equal(await page.$eval('.leaderboards-message a', node => node.getAttribute('href')), `/leaderboards/${current}`);
      errors.push(...await page.evaluate(() => performance.getEntriesByType('resource')
        .filter(entry => entry.name.includes('/api/leaderboards/table')).map(entry => `requested ${entry.name}`)));

      // Ссылка открывает текущий сезон; скелетон сводки той же высоты, что и сводка, и не сдвигает таблицу.
      const stats = hold(url => url.includes('/api/leaderboards/stats?'));
      await page.click('.leaderboards-message a');
      await stats.seen();
      await settledOn(page, first, `${mode}: the current season after an unknown one`);
      assert.equal(new URL(page.url()).search, current, 'the unknown season leaves the URL');
      // Без isMobile: его смена перезагружает страницу и сбрасывает скелетон; раскладку задают медиазапросы по ширине.
      for (const width of [1440, 1100, 1024, 720, 412]) {
        await page.setViewport({ width, height: 900 });
        await pause(100);
        const skeleton = await page.$eval('.leaderboards-board > .loading-surface', node => Math.round(node.getBoundingClientRect().height * 2) / 2);
        const real = await browser.newPage();
        await real.setViewport({ width, height: 900 });
        await real.goto(`${pilot.origin}/leaderboards/${current}`, { waitUntil: 'networkidle2' });
        const loaded = await real.$eval('.leaderboards-board > .data-surface', node => Math.round(node.getBoundingClientRect().height * 2) / 2);
        await real.close();
        assert.ok(Math.abs(skeleton - loaded) <= 1, `${mode} at ${width}px: the summary skeleton is ${skeleton}px, the summary ${loaded}px`);
      }
      await page.setViewport({ width: 1440, height: 900 });
      await pause(100);
      const before = await page.$eval('.leaderboards-body', node => node.getBoundingClientRect().top);
      stats.release();
      await page.waitForSelector('.leaderboards-board > .data-surface .leaderboards-kpi');
      assert.equal(await page.$eval('.leaderboards-body', node => node.getBoundingClientRect().top), before, `${mode}: the summary arriving does not move the table`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await pilot.close();
  }
});
