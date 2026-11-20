import assert from 'node:assert/strict';
import http from 'node:http';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';
import { SENTINELS, openAnswer, protectedAnswer } from './helpers/standardMatchupsOpenFixture.ts';

// /standard/matchups/ in a real browser against an Express stub: a guest without JavaScript sees the open matrix,
// a guest with JavaScript gets the rest of the slice, Wild after the switch and the offer behind the locks, a
// subscriber's matrix replaces the open view only when its data and chunk are loaded, and the swap does not shift.

const READER = { id: 'mx-reader', email: 'reader@example.test', name: 'Подписчик', role: 'user' };
const SUBSCRIBED = { hasAccess: true, entitlements: { arena: true, standard: true }, source: 'boosty', checkedAt: null,
  stale: false, message: '', boosty: { checked: true, hasAccess: true }, patreon: {}, telegram: {} };
const PROTECTED_DELAY_MS = 800;
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

async function startStack() {
  const state = { next: null, publicReads: [], protectedReads: 0, wildDown: false };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://stack');
    const reader = /(?:^|;\s*)mx_session=reader/.test(request.headers.cookie ?? '');
    const json = (status, payload) => response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' })
      .end(JSON.stringify(payload));
    if (url.pathname === '/api/auth/me') return json(200, { user: reader ? READER : null });
    if (url.pathname === '/api/subscription/status') return reader ? json(200, SUBSCRIBED) : json(401, { error: 'guest' });
    if (url.pathname === '/api/standard/matchups/public') {
      state.publicReads.push(`${url.pathname}${url.search}`);
      if (url.searchParams.get('format') === 'wild' && state.wildDown) {
        return void setTimeout(() => response.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '60' })
          .end(JSON.stringify({ error: 'no snapshot' })), 1200);
      }
      return json(200, openAnswer({ noise: true, format: url.searchParams.get('format') === 'wild' ? 'wild' : 'standard' }));
    }
    if (url.pathname === '/api/standard/matchups') {
      if (!reader) return json(401, { error: 'subscription required' });
      state.protectedReads += 1;
      return void setTimeout(() => json(200, protectedAnswer()), PROTECTED_DELAY_MS);
    }
    if (url.pathname.startsWith('/api/')) return json(401, { error: 'guest' });
    const upstream = http.request(new URL(state.next), { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  const origin = await listenLocal(server);
  return Object.assign(state, { server, origin });
}

test('a guest and a subscriber on /standard/matchups/ in a real browser', { timeout: 300_000 }, async () => {
  const stack = await startStack();
  const next = await startNextServer({ legacyOrigin: stack.origin,
    env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
  stack.next = next.origin;
  let browser;
  try {
    // The page is a five-minute ISR page the warm-up route does not cover: move the server's clock past that
    // window and request until the regenerated copy has the matrix.
    let warm = false;
    for (let attempt = 0; attempt < 40 && !warm; attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      warm = (await (await fetch(`${next.origin}/standard/matchups/`)).text()).includes('standard-matchups-open__matrix');
      if (!warm) await delay(250);
    }
    assert.ok(warm, 'the page was not regenerated with the matrix');
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });

    // Without JavaScript: the most played archetypes of the general slice, no paid value.
    const bare = await browser.newPage();
    await bare.setJavaScriptEnabled(false);
    await bare.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'load' });
    const bareHtml = await bare.content();
    assert.equal((bareHtml.match(/class="standard-matchups-open__row"/g) ?? []).length, 30);
    assert.deepEqual(SENTINELS.filter(value => bareHtml.includes(value)), []);
    await bare.close();

    // A guest with JavaScript: the tail of the slice arrives, Wild reads the same open route, the locks bring the offer.
    const guest = await browser.newPage();
    await guest.setViewport(DESKTOP);
    const errors = [];
    guest.on('pageerror', error => errors.push(error.message));
    await guest.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'networkidle0' });
    assert.equal(await guest.$$eval('.standard-matchups-open__row', rows => rows.length), 36, 'the browser completes the slice');
    assert.equal(stack.protectedReads, 0, 'a guest never asks the protected route');
    assert.equal(await guest.$('.arena-paywall'), null, 'no gate until a lock is pressed');
    await guest.click('[data-locked-filter]');
    await guest.waitForSelector('#standard-matchups-paywall');
    await guest.evaluate(() => [...document.querySelectorAll('.standard-matchups__segmented button')].at(1).click());
    await guest.waitForFunction(() => document.querySelector('.standard-matchups-open__line')?.textContent.includes('Вольный'), { timeout: 15000 });
    assert.equal(stack.publicReads.at(-1), '/api/standard/matchups/public?format=wild');
    const guestText = await guest.evaluate(() => document.body.textContent);
    assert.deepEqual(SENTINELS.filter(value => guestText.includes(value)), []);
    assert.deepEqual(errors, []);
    await guest.close();

    // The matrix is readable and navigable: whole names in tooltips, sticky head and names, the pointer and the keys
    // mark a cell's row and column, the order and the search work, a phone's page does not scroll sideways, nothing shifts.
    for (const [name, viewport] of [['desktop', DESKTOP], ['phone', PHONE]]) {
      const ui = await browser.newPage();
      await ui.evaluateOnNewDocument(() => {
        window.__shifts = [];
        new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shifts.push(entry.value); })
          .observe({ type: 'layout-shift', buffered: true });
      });
      await ui.setViewport(viewport);
      await ui.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'networkidle0' });
      await ui.waitForFunction(() => document.querySelectorAll('.standard-matchups-open__row').length === 36);
      const tableLabel = `${name}:`;
      await delay(1000);
      const loadShift = await ui.evaluate(() => window.__shifts.reduce((sum, value) => sum + value, 0));
      console.log(`${name} guest CLS ${loadShift.toFixed(4)}`);
      assert.ok(loadShift < 0.01, `${tableLabel} the page shifted by ${loadShift.toFixed(4)} while loading`);
      assert.equal(await ui.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, `${tableLabel} the page does not scroll sideways`);
      assert.equal(await ui.$eval('.standard-matchups-open__column', node => node.getAttribute('title')), 'Открытый архетип 1');
      assert.equal(await ui.$$eval('.standard-matchups-open__column .standard-matchups-open__icon', icons => icons.length), 36);
      const scroll = '.standard-matchups-open__scroll';
      await ui.$eval(scroll, node => { node.scrollTop = 220; node.scrollLeft = 260; });
      const stuck = await ui.evaluate(() => {
        const box = document.querySelector('.standard-matchups-open__scroll').getBoundingClientRect();
        const head = document.querySelector('.standard-matchups-open__column').getBoundingClientRect();
        const row = document.querySelector('.standard-matchups-open__row').getBoundingClientRect();
        return { head: Math.round(head.top - box.top), row: Math.round(row.left - box.left) };
      });
      assert.ok(stuck.head <= 2 && stuck.row <= 2, `${tableLabel} the head and the names column stay put: ${JSON.stringify(stuck)}`);
      await ui.$eval(scroll, node => { node.scrollTop = 0; node.scrollLeft = 0; });

      // The pointer: the row, the column and the cell are marked, the readout names the pair.
      const cell = await ui.evaluateHandle(() => document.querySelectorAll('.standard-matchups-open__matrix tbody tr')[2].cells[4]);
      await cell.hover();
      const marked = await ui.evaluate(() => ({
        rows: document.querySelectorAll('td[data-hr]').length, columns: document.querySelectorAll('td[data-hc]').length,
        head: document.querySelectorAll('thead th[data-hc]').length, readout: document.querySelector('.standard-matchups-open__readout').textContent,
      }));
      assert.deepEqual([marked.rows, marked.columns, marked.head], [37, 36, 1], `${tableLabel} row, column and head are marked`);
      assert.match(marked.readout, /Открытый архетип 3 против Открытый архетип 3.*игр/s);
      // The keys: arrows move between cells and mark the new one.
      await ui.evaluate(() => document.querySelectorAll('.standard-matchups-open__matrix tbody tr')[0].cells[2].focus());
      await ui.keyboard.press('ArrowRight');
      await ui.keyboard.press('ArrowDown');
      assert.match(await ui.$eval('.standard-matchups-open__readout', node => node.textContent), /Открытый архетип 2 против Открытый архетип 2/);
      await ui.keyboard.press('End');
      assert.equal(await ui.evaluate(() => document.activeElement === document.activeElement.parentElement.lastElementChild), true);

      // The order: highest winrate first, the same twice flips it; by name the reading order is that of Russian.
      await ui.evaluate(() => [...document.querySelectorAll('.standard-matchups-open__sorts button')].find(b => b.textContent.startsWith('Винрейт')).click());
      await ui.evaluate(() => [...document.querySelectorAll('.standard-matchups-open__sorts button')].find(b => b.textContent.startsWith('Винрейт')).click());
      const firstRow = () => ui.$eval('.standard-matchups-open__row span', node => node.textContent);
      assert.equal(await firstRow(), 'Открытый архетип 36', 'the lowest winrate first once flipped');
      assert.equal(await ui.$$eval('.standard-matchups-open__column', heads => heads[0].title), 'Открытый архетип 36', 'columns follow the rows');
      await ui.evaluate(() => [...document.querySelectorAll('.standard-matchups-open__sorts button')].find(b => b.textContent.startsWith('Название')).click());
      assert.equal(await firstRow(), 'Открытый архетип 1');

      // The search: by words, in any order; nothing found says so.
      await ui.type('.standard-matchups-open__search input', 'архетип 17');
      assert.deepEqual(await ui.$$eval('.standard-matchups-open__row span', nodes => nodes.map(node => node.textContent)), ['Открытый архетип 17']);
      await ui.focus('.standard-matchups-open__search input');
      await ui.keyboard.down('Control');
      await ui.keyboard.press('a');
      await ui.keyboard.up('Control');
      await ui.keyboard.press('Backspace');
      await ui.keyboard.type('zzzz');
      await ui.waitForSelector('.standard-matchups-open__none');
      assert.equal(await ui.$('.standard-matchups-open__matrix'), null);
      await ui.close();
    }

    // The menu's «Вольный» opens ?format=wild: the browser reads the address and shows Wild, not Standard.
    const viaMenu = await browser.newPage();
    await viaMenu.setViewport(DESKTOP);
    await viaMenu.goto(`${stack.origin}/standard/matchups/?format=wild`, { waitUntil: 'networkidle0' });
    await viaMenu.waitForFunction(() => document.querySelector('.standard-matchups-open__line')?.textContent.includes('Вольный'), { timeout: 15000 });
    assert.equal(await viaMenu.$eval('.standard-matchups__segmented button[aria-pressed="true"]', node => node.textContent), 'Вольный');
    assert.equal(stack.publicReads.at(-1), '/api/standard/matchups/public?format=wild');
    assert.ok(!(await viaMenu.evaluate(() => document.querySelector('.standard-matchups-open__line')?.textContent ?? '')).includes('Стандарт'));
    await viaMenu.close();

    // Wild is slow and then fails: the Standard numbers must not stay on the screen under the chosen Wild.
    stack.wildDown = true;
    const slow = await browser.newPage();
    await slow.setViewport(DESKTOP);
    await slow.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'networkidle0' });
    assert.ok(await slow.$('.standard-matchups-open__matrix'), 'Standard is up first');
    await slow.evaluate(() => [...document.querySelectorAll('.standard-matchups__segmented button')].at(1).click());
    await slow.waitForFunction(() => document.querySelector('.standard-matchups__segmented button[aria-pressed="true"]')?.textContent.includes('Вольный'));
    assert.equal(await slow.$('.standard-matchups-open__matrix'), null, 'no Standard matrix while Wild loads');
    assert.equal(await slow.$('.standard-matchups-open__row'), null, 'no Standard row while Wild loads');
    await slow.waitForSelector('.standard-matchups__error', { timeout: 15000 });
    assert.equal(await slow.$('.standard-matchups-open__matrix'), null, 'no Standard matrix after Wild failed');
    assert.equal(await slow.$('.standard-matchups-open__row'), null, 'no Standard row after Wild failed');
    assert.ok(!(await slow.evaluate(() => document.querySelector('.standard-matchups-open__line')?.textContent ?? '')).includes('Стандарт'),
      'the line does not describe Standard under Wild');
    await slow.close();
    stack.wildDown = false;

    // A subscriber: the open view stays until the matrix is ready, then the matrix replaces it without shifting.
    const reader = await browser.newPage();
    await reader.setViewport(DESKTOP);
    await reader.evaluateOnNewDocument(() => {
      window.__shifts = [];
      new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shifts.push(entry.value); })
        .observe({ type: 'layout-shift', buffered: true });
    });
    await reader.setCookie({ name: 'mx_session', value: 'reader', url: stack.origin });
    await reader.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'load' });
    await reader.waitForSelector('.standard-matchups-open__matrix');
    assert.equal(await reader.$('.standard-matchups__ledger'), null, 'the paid view is not up before its data');
    await reader.waitForSelector('.standard-matchups__ledger', { timeout: 20000 });
    assert.equal(await reader.$('.standard-matchups-open__matrix'), null, 'the open view is gone once the matrix is up');
    assert.equal(await reader.$('.standard-matchups [data-skeleton], .standard-matchups .matchups-skeleton'), null, 'no skeleton between the two');
    assert.ok(stack.protectedReads >= 1);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const shift = await reader.evaluate(() => window.__shifts.reduce((sum, value) => sum + value, 0));
    console.log(`subscriber CLS ${shift.toFixed(4)}`);
    assert.ok(shift < 0.01, `the subscriber page shifted by ${shift.toFixed(4)}`);
    await reader.close();
  } finally {
    if (browser) await browser.close();
    await next.close();
    await closeLocal(stack.server);
  }
});
