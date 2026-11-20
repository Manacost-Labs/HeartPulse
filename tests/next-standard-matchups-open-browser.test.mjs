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
const PROTECTED_DELAY_MS = 2500;
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
      warm = (await (await fetch(`${next.origin}/standard/matchups/`)).text()).includes('Открытый архетип 20');
      if (!warm) await delay(250);
    }
    assert.ok(warm, 'the page was not regenerated with the matrix');
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const OFFER = 'Ранги, периоды и порог игр — в подписке';
    const shown = (page, text) => page.waitForFunction(needle => document.body.innerText.includes(needle), { timeout: 20_000 }, text);
    const pressedFormat = async page => {
      for (const name of ['Стандарт', 'Вольный']) {
        const button = await page.$(`::-p-aria([name="Показать матчапы: ${name}"][role="button"])`);
        if (button && await button.evaluate(node => node.getAttribute('aria-pressed')) === 'true') return name;
      }
      return '';
    };
    const lockNamed = (page, label) => page.$(`::-p-aria([name="${label} (фильтр): по подписке. Узнать, как открыть"][role="button"])`);

    // Without JavaScript: the most played archetypes of the slice, the guest's locks, no paid value, and nothing
    // in the content a keyboard could land on and find dead.
    const bare = await browser.newPage();
    await bare.setJavaScriptEnabled(false);
    await bare.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'load' });
    const bareText = await bare.evaluate(() => document.body.innerText);
    assert.ok(bareText.includes('Открытый архетип 20') && !bareText.includes('Открытый архетип 21'), 'the printed part of the slice');
    assert.ok(bareText.includes('Сильнейшие архетипы'), 'the leaders are printed too');
    assert.deepEqual(SENTINELS.filter(value => bareText.includes(value)), []);
    assert.ok(bareText.toLowerCase().includes('рейтинг') && bareText.toLowerCase().includes('все ранги'), 'the rank filter is in its place');
    for (let press = 0; press < 40; press += 1) await bare.keyboard.press('Tab');
    assert.equal(await bare.evaluate(() => Boolean(document.activeElement?.closest('#main-content'))), false, 'no live control in the content without a script');
    await bare.close();

    // A guest with JavaScript: the tail of the slice arrives, the locks open the offer, Wild reads the same open route.
    const guest = await browser.newPage();
    await guest.setViewport(DESKTOP);
    const errors = [];
    guest.on('pageerror', error => errors.push(error.message));
    await guest.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'networkidle0' });
    await shown(guest, 'Открытый архетип 36');
    assert.equal(stack.protectedReads, 0, 'a guest never asks the protected route');
    for (const label of ['Рейтинг', 'Период', 'Минимум игр в паре']) assert.ok(await lockNamed(guest, label), `${label} is a lock`);
    assert.equal(await guest.evaluate(offer => document.body.innerText.includes(offer), OFFER), false, 'no offer until a lock is pressed');
    await (await lockNamed(guest, 'Период')).click();
    await guest.waitForSelector(`::-p-aria([role="heading"][name="${OFFER}"])`);
    await guest.keyboard.press('Escape');
    await (await guest.waitForSelector('::-p-aria([name="Показать матчапы: Вольный"][role="button"])')).click();
    await shown(guest, 'Матчапы · Вольный');
    assert.equal(stack.publicReads.at(-1), '/api/standard/matchups/public?format=wild');
    assert.equal(await pressedFormat(guest), 'Вольный');
    const guestText = await guest.evaluate(() => document.body.innerText);
    assert.deepEqual(SENTINELS.filter(value => guestText.includes(value)), []);
    assert.deepEqual(errors, []);
    await guest.close();

    // The page of a guest does not shift while the rest of the slice arrives, on a desktop and a phone, and a phone's
    // page does not scroll sideways.
    for (const [name, viewport] of [['desktop', DESKTOP], ['phone', PHONE]]) {
      const view = await browser.newPage();
      await view.evaluateOnNewDocument(() => {
        window.__shifts = [];
        new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shifts.push(entry.value); })
          .observe({ type: 'layout-shift', buffered: true });
      });
      await view.setViewport(viewport);
      await view.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'networkidle0' });
      await shown(view, 'Открытый архетип 36');
      await delay(1000);
      const loadShift = await view.evaluate(() => window.__shifts.reduce((sum, value) => sum + value, 0));
      console.log(`${name} guest CLS ${loadShift.toFixed(4)}`);
      assert.ok(loadShift < 0.01, `${name}: the page shifted by ${loadShift.toFixed(4)} while loading`);
      assert.equal(await view.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, `${name}: no sideways scroll`);
      await view.close();
    }

    // The menu's «Вольный» opens ?format=wild: the browser reads the address and shows Wild, not Standard.
    const viaMenu = await browser.newPage();
    await viaMenu.setViewport(DESKTOP);
    await viaMenu.goto(`${stack.origin}/standard/matchups/?format=wild`, { waitUntil: 'networkidle0' });
    await shown(viaMenu, 'Матчапы · Вольный');
    assert.equal(await pressedFormat(viaMenu), 'Вольный');
    assert.equal(stack.publicReads.at(-1), '/api/standard/matchups/public?format=wild');
    assert.equal(await viaMenu.evaluate(() => document.body.innerText.includes('Матчапы · Стандарт')), false);
    await viaMenu.close();

    // Wild is slow and then fails: the Standard numbers must not stay on the screen under the chosen Wild.
    stack.wildDown = true;
    const slow = await browser.newPage();
    await slow.setViewport(DESKTOP);
    await slow.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'networkidle0' });
    await shown(slow, 'Открытый архетип 36');
    await (await slow.waitForSelector('::-p-aria([name="Показать матчапы: Вольный"][role="button"])')).click();
    await shown(slow, 'Матчапы · Вольный');
    assert.equal(await slow.evaluate(() => document.body.innerText.includes('Открытый архетип 1')), false, 'no Standard numbers while Wild loads');
    await slow.waitForSelector('::-p-aria([role="alert"])', { timeout: 15_000 });
    assert.equal(await slow.evaluate(() => document.body.innerText.includes('Открытый архетип 1')), false, 'no Standard numbers after Wild failed');
    assert.equal(await slow.evaluate(() => document.body.innerText.includes('Матчапы · Стандарт')), false, 'the heading does not describe Standard under Wild');
    await slow.close();
    stack.wildDown = false;

    // A subscriber: the same component stays while the paid answer is slow, with no lock to be offered a purchase
    // through; the paid slice replaces the open one inside it (same grid element, no skeleton, no shift).
    const reader = await browser.newPage();
    await reader.setViewport(process.env.MATCHUPS_PHONE_READER ? PHONE : DESKTOP);
    await reader.evaluateOnNewDocument(() => {
      window.__shifts = [];
      new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) { window.__shifts.push(entry.value); window.__why = (window.__why ?? []).concat((entry.sources ?? []).map(source => `${entry.value.toFixed(3)} @${Math.round(entry.startTime)} ${source.node?.className || source.node?.nodeName}`)); } })
        .observe({ type: 'layout-shift', buffered: true });
    });
    // Every frame of the swap, as a viewer sees it: is there a matrix, is a loading skeleton up, where is the matrix, are
    // the paid values (the leader's 63,4 %) on screen.
    await reader.evaluateOnNewDocument(() => {
      window.__frames = [];
      const tick = () => {
        const grid = document.querySelector('[role="grid"]');
        const box = grid?.getBoundingClientRect();
        const text = document.body?.innerText ?? '';
        window.__frames.push({ cells: grid ? grid.querySelectorAll('[role="gridcell"]').length : 0, loading: text.includes('Загружаем матчапы'),
          top: box ? Math.round(box.top + window.scrollY) : null, height: box ? Math.round(box.height) : null, paid: text.includes('63,4') });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await reader.setCookie({ name: 'mx_session', value: 'reader', url: stack.origin });
    await reader.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'load' });
    await shown(reader, 'Открытый архетип 1');
    await shown(reader, 'Топ-1000');
    assert.equal(await reader.evaluate(() => document.body.innerText.includes('Матчапы · Стандарт · Все ранги')), true, 'the open slice is on screen while the paid one loads');
    for (const label of ['Рейтинг', 'Период', 'Минимум игр в паре']) assert.equal(await lockNamed(reader, label), null, `a subscriber sees no lock on «${label}»`);
    // The reader picks an archetype on the open slice; the paid slice must not take the choice away.
    const pick = '::-p-aria([name="Открытый архетип 3"][role="button"])';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const button = await reader.waitForSelector(pick, { timeout: 20_000 });
      await button.click();
      if (await button.evaluate(node => node.getAttribute('aria-pressed')) === 'true') break;
      await delay(250);
    }
    assert.equal(await reader.$eval(pick, node => node.getAttribute('aria-pressed')), 'true', 'the pick took');
    const swapFrom = await reader.evaluate(() => window.__frames.length);
    assert.equal(await reader.evaluate(() => document.body.innerText.includes('63,4')), false, 'the paid values are not here before their answer');
    if (process.env.MATCHUPS_SHOTS) await reader.screenshot({ path: `${process.env.MATCHUPS_SHOTS}/sub-loading-${reader.viewport().width}.png` });
    await shown(reader, 'Матчапы · Стандарт · Легенда');
    await delay(500);
    assert.equal(await reader.$eval(pick, node => node.getAttribute('aria-pressed')), 'true', 'the reader\'s pick survives the swap');
    assert.equal(await reader.evaluate(() => document.body.innerText.includes('63,4')), true, 'the paid values are on screen at the end');
    const frames = await reader.evaluate(() => window.__frames);
    const onScreen = frames.slice(frames.findIndex(frame => frame.cells > 0 && frame.height > 0 && !frame.loading));
    assert.ok(onScreen.length > 30 && onScreen.some(frame => frame.paid), 'the swap was observed frame by frame');
    assert.equal(onScreen.filter(frame => frame.cells === 0 || frame.loading).length, 0, `the matrix is on screen in every frame: no skeleton, no empty frame: ${JSON.stringify(onScreen.map((frame, index) => ({ ...frame, index })).filter(frame => frame.cells === 0 || frame.loading))}`);
    // From the pick, on the open slice, to the paid values: the matrix neither moves nor changes its height.
    const swap = frames.slice(swapFrom);
    assert.ok(Math.max(...swap.map(frame => frame.top)) - Math.min(...swap.map(frame => frame.top)) <= 2, 'the matrix does not move');
    assert.ok(Math.max(...swap.map(frame => frame.height)) - Math.min(...swap.map(frame => frame.height)) <= 2, 'the matrix keeps its height');
    assert.ok(stack.protectedReads >= 1);
    await delay(1000);
    const shift = await reader.evaluate(() => window.__shifts.reduce((sum, value) => sum + value, 0));
    console.log(`subscriber CLS ${shift.toFixed(4)}`);
    assert.ok(shift < 0.01, `the subscriber page shifted by ${shift.toFixed(4)}: ${JSON.stringify(await reader.evaluate(() => window.__why))}`);
    await reader.close();
  } finally {
    if (browser) await browser.close();
    await next.close();
    await closeLocal(stack.server);
  }
});
