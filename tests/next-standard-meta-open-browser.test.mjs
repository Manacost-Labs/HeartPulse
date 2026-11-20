import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

// /standard/meta/ in a real browser against an Express stub: a guest without JavaScript sees every archetype of
// the general slice (Standard here, Wild after the switch), a guest with JavaScript gets locks and an offer for the
// paid filters, a subscriber gets the paid columns in place without moving the rows. The stub's protected route
// carries the sentinels, so they reach a page only for a subscriber.

const READER = { id: 'sm-reader', email: 'reader@example.test', name: 'Подписчик', role: 'user' };
const SUBSCRIBED = { hasAccess: true, entitlements: { arena: true, standard: true }, source: 'boosty', checkedAt: null,
  stale: false, message: '', boosty: { checked: true, hasAccess: true }, patreon: {}, telegram: {} };
const PROTECTED_DELAY_MS = 800;
const SENTINELS = ['77.7701', '66.6066', 'SENTINEL_TREND'];
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

const rows = (format, paid) => Array.from({ length: 8 }, (_, index) => ({
  id: `${format}-${index + 1}`, slug: `${format}-arch-${index + 1}`, archetype: `Archetype ${format} ${index + 1}`,
  archetypeLabel: `${format === 'wild' ? 'Вольный' : 'Стандартный'} архетип ${index + 1}`, translated: true,
  classKey: index % 2 ? 'mage' : 'priest', winrate: 55 - index, popularity: 12 - index / 2, games: 5000 - index * 300,
  turns: paid ? 77.7701 : null, durationMinutes: paid ? 66.6066 : null, climbingSpeed: paid ? 7.77 : null,
}));
const slice = (format, paid) => ({
  format, formatLabel: format === 'wild' ? 'Вольный' : 'Стандарт', rank: 'diamond_legend', rankLabel: 'Алмаз — Легенда',
  period: 'patch_36.6.3', availablePeriods: paid ? ['past_day', 'patch_36.6.3'] : ['patch_36.6.3'], currentPeriod: 'patch_36.6.3',
  currentPatchPeriod: 'patch_36.6.3', coin: 'any_player', minGames: 100, source: 'hsguru', sourceUrl: 'https://www.hsguru.com/meta',
  translationSource: '', updatedAt: new Date(Date.now() - 3_600_000).toISOString(), totalGames: 99_000, items: rows(format, paid),
});

async function startStack() {
  const state = { next: null, publicReads: [], protectedReads: 0, down: false, publicHeaders: [], protectedQueries: [], protectedDown: false, protectedDelay: PROTECTED_DELAY_MS, protectedHang: false, protectedDenied: 0, statusDelay: 0 };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://stack');
    const reader = /(?:^|;\s*)sm_session=reader/.test(request.headers.cookie ?? '');
    const json = (status, payload) => response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' })
      .end(JSON.stringify(payload));
    if (url.pathname === '/api/auth/me') return json(200, { user: reader ? READER : null });
    if (url.pathname === '/api/subscription/status') return reader ? void setTimeout(() => json(200, SUBSCRIBED), state.statusDelay) : json(401, { error: 'guest' });
    if (url.pathname === '/api/standard-meta/public') {
      state.publicReads.push(`${url.pathname}${url.search}`);
      state.publicHeaders.push(request.headers['x-hearthpulse-prerender'] ?? null);
      if (state.down) return json(503, { error: 'source down' });
      return json(200, slice(url.searchParams.get('format') === 'wild' ? 'wild' : 'standard', false));
    }
    if (url.pathname === '/api/standard-meta') {
      if (!reader) return json(401, { error: 'subscription required' });
      state.protectedReads += 1;
      state.protectedQueries.push(Object.fromEntries(url.searchParams));
      if (state.protectedDown) return json(503, { error: 'paid source down' });
      if (state.protectedDenied) return json(state.protectedDenied, { error: 'subscription required' });
      // Like the real route: a period or rank it does not serve is refused.
      const askedPeriod = url.searchParams.get('period');
      const askedRank = url.searchParams.get('rank');
      if ((askedPeriod && !/^(?:past_day|past_week|patch_\d+(?:\.\d+)*)$/.test(askedPeriod))
        || (askedRank && !['diamond', 'diamond_legend', 'legend', 'top_5k', 'top_legend'].includes(askedRank))) return json(400, { error: 'bad filter' });
      // The answer carries the filters it was asked for, as the real route does.
      const asked = {
        rank: url.searchParams.get('rank') ?? 'diamond_legend', coin: url.searchParams.get('coin') ?? 'any_player',
        minGames: Number(url.searchParams.get('min_games') ?? 100), period: url.searchParams.get('period') ?? 'patch_36.6.3',
      };
      if (state.protectedHang) return undefined; // never answers
      return void setTimeout(() => json(200, { ...slice(url.searchParams.get('format') === 'wild' ? 'wild' : 'standard', true), ...asked }), state.protectedDelay);
    }
    if (url.pathname.startsWith('/api/')) return json(401, { error: 'guest' });
    const upstream = http.request(new URL(state.next), { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  const origin = await listenLocal(server);
  return Object.assign(state, { server, origin });
}

test('a guest and a subscriber on /standard/meta/ in a real browser', { timeout: 240_000 }, async () => {
  const stack = await startStack();
  const next = await startNextServer({ legacyOrigin: stack.origin });
  stack.next = next.origin;
  let browser;
  try {
    assert.equal((await fetch(`${next.origin}/health/next/revalidate/`, { method: 'POST' })).status, 200);
    stack.publicReads.length = 0; stack.publicHeaders.length = 0; // the route's own probe of the source is not a page read
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });

    // A guest (and a crawler) without JavaScript: every archetype of the general slice, no paid value.
    const bare = await browser.newPage();
    await bare.setJavaScriptEnabled(false);
    await bare.goto(`${stack.origin}/standard/meta/`, { waitUntil: 'load' });
    const bareHtml = await bare.content();
    assert.equal((bareHtml.match(/class="standard-meta-card"/g) ?? []).length, 8, 'all eight archetypes are in the HTML');
    assert.ok(bareHtml.includes('Стандартный архетип 8') && bareHtml.includes('50%'), 'names and winrates are printed');
    assert.deepEqual(SENTINELS.filter(value => bareHtml.includes(value)), [], 'no sentinel in the HTML a guest gets');
    // The summary of the open slice is printed in the HTML itself (a value, never a placeholder).
    assert.match(bareHtml, /Архетипов<\/dt><dd>8<\/dd>/, 'the archetype count is printed');
    assert.match(bareHtml, /Игр в выборке<\/dt><dd>99(?:[\s\u00a0\u202f]|&nbsp;)000<\/dd>/, 'the games of the slice are printed');
    // The locks stand in their places in the HTML itself (the paid figures of every card, the paid filters), and the page
    // has no subscription block at its end.
    assert.equal((bareHtml.match(/aria-label="Ходы: по подписке/g) ?? []).length, 8, 'a lock for the turns of every card');
    assert.equal((bareHtml.match(/aria-label="Скорость набора: по подписке/g) ?? []).length, 8, 'a lock for the climb speed of every card');
    assert.equal((bareHtml.match(/data-locked-filter/g) ?? []).length, 3, 'the paid filters are in the HTML');
    assert.ok(!bareHtml.includes('standard-meta-paywall'), 'no subscription block at the end of the page');
    // Without a script nothing on the page may be focusable but links: every control waits for hydration, its place reserved.
    const dead = await bare.evaluate(() => [...document.querySelectorAll('.standard-meta a[href],.standard-meta button,.standard-meta input,.standard-meta select,.standard-meta textarea,.standard-meta [tabindex]')]
      .filter(node => !node.closest('[inert]') && !node.disabled && node.tagName !== 'A')
      .map(node => `${node.tagName} ${node.getAttribute('aria-label') ?? node.textContent.trim().slice(0, 30)}`));
    assert.deepEqual(dead, [], 'no focusable control that does nothing without JavaScript');
    const crawler = await (await fetch(`${stack.origin}/standard/meta/`, { headers: { 'User-Agent': 'Googlebot/2.1' } })).text();
    const guestHtml = await (await fetch(`${stack.origin}/standard/meta/`)).text();
    assert.equal(crawler, guestHtml, 'a crawler gets the guest HTML');
    const ld = [...guestHtml.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map(match => match[1]).join('');
    assert.match(ld, /"isAccessibleForFree":false/);
    assert.match(ld, /\.paywalled-standard-meta/);
    assert.deepEqual(SENTINELS.filter(value => ld.includes(value)), [], 'no sentinel in the JSON-LD');
    await bare.close();

    // A guest with JavaScript: locked filters open the offer; Wild reads the same open route.
    const guest = await browser.newPage();
    await guest.setViewport(DESKTOP);
    const errors = [];
    guest.on('pageerror', error => errors.push(error.message));
    await guest.goto(`${stack.origin}/standard/meta/`, { waitUntil: 'networkidle0' });
    assert.equal(await guest.$$eval('.standard-meta-card', cards => cards.length), 8);
    assert.equal(stack.publicReads.length, 1, 'only the server read the open slice');
    assert.equal(stack.protectedReads, 0, 'a guest never asks the protected route');
    assert.equal(await guest.$$eval('[data-locked-filter]', nodes => nodes.length), 3, 'period, coin and floor are locks');
    await guest.click('.standard-meta__rank-tabs button:not([aria-pressed="true"])');
    await guest.waitForSelector('[data-testid="arena-paid-offer"]');
    assert.match(await guest.$eval('[data-testid="arena-paid-offer"]', node => node.textContent), /Узкие срезы, история и тренды — в подписке/);
    await guest.keyboard.press('Escape');
    await guest.waitForFunction(() => !document.querySelector('[data-testid="arena-paid-offer"]'));
    assert.match(await guest.$eval('.standard-meta__rank-tabs button[aria-pressed="true"]', node => node.textContent), /Алмаз/, 'the rank stays');
    assert.equal(await guest.$$eval('.standard-meta-card', cards => cards.length), 8, 'a locked rank does not change the slice');
    await guest.click('[data-locked-filter]');
    await guest.waitForSelector('[data-testid="arena-paid-offer"]');
    await guest.keyboard.press('Escape');
    await guest.click('button[aria-label^="Ходы: по подписке"]');
    await guest.waitForSelector('[data-testid="arena-paid-offer"]');
    await guest.keyboard.press('Escape');
    assert.equal(stack.publicReads.length, 1, 'locked filters send no request');
    // The format switch is two links, each its own address: Wild opens at /standard/meta/wild/.
    assert.deepEqual(await guest.$$eval('.standard-meta__segmented a', links => links.map(link => link.getAttribute('href'))),
      ['/standard/meta/', '/standard/meta/wild/']);
    await guest.click('.standard-meta__segmented a[href="/standard/meta/wild/"]');
    await guest.waitForFunction(() => location.pathname === '/standard/meta/wild/' && document.body.textContent.includes('Вольный архетип 1'),
      { timeout: 15000 });
    assert.ok(stack.publicReads.includes('/api/standard-meta/public?format=wild'));
    assert.equal(await guest.$$eval('.standard-meta-card', cards => cards.length), 8);
    const guestText = await guest.evaluate(() => document.body.textContent);
    assert.deepEqual(SENTINELS.filter(value => guestText.includes(value)), []);
    assert.deepEqual(errors, []);
    await guest.close();

    // Wild at its own address: the same open slice in the HTML, one H1, a self canonical, the same HTML for a crawler.
    const wildBare = await browser.newPage();
    await wildBare.setJavaScriptEnabled(false);
    await wildBare.goto(`${stack.origin}/standard/meta/wild/`, { waitUntil: 'load' });
    const wildHtml = await wildBare.content();
    assert.equal((wildHtml.match(/class="standard-meta-card"/g) ?? []).length, 8, 'all eight Wild archetypes are in the HTML');
    assert.ok(wildHtml.includes('Вольный архетип 8') && !wildHtml.includes('Стандартный архетип'), 'only the Wild slice is printed');
    assert.equal((wildHtml.match(/<h1[\s>]/g) ?? []).length, 1, 'one H1');
    assert.ok(wildHtml.includes('Мета Вольного формата Hearthstone'));
    assert.match(wildHtml, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/standard\/meta\/wild\/"/);
    assert.deepEqual(SENTINELS.filter(value => wildHtml.includes(value)), [], 'no sentinel in the Wild HTML');
    const wildCrawler = await (await fetch(`${stack.origin}/standard/meta/wild/`, { headers: { 'User-Agent': 'Googlebot/2.1' } })).text();
    const wildGuest = await (await fetch(`${stack.origin}/standard/meta/wild/`)).text();
    assert.equal(wildCrawler, wildGuest, 'a crawler gets the guest HTML of Wild');
    const wildLd = [...wildGuest.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map(match => match[1]).join('');
    assert.match(wildLd, /meta\/wild\/#dataset/);
    assert.match(wildLd, /"isAccessibleForFree":false/);
    assert.deepEqual(SENTINELS.filter(value => wildLd.includes(value) || wildGuest.includes(value)), []);
    const wildRsc = await (await fetch(`${stack.origin}/standard/meta/wild/`, { headers: { RSC: '1' } })).text();
    assert.deepEqual(SENTINELS.filter(value => wildRsc.includes(value)), [], 'no sentinel in the RSC payload');
    await wildBare.close();

    // A Wild page opened directly asks nothing on hydration (its seed answers its own request), even if the source falls
    // between the server render and the hydration; no error is printed over the correct HTML.
    stack.down = true;
    const readsBefore = stack.publicReads.length;
    const direct = await browser.newPage();
    await direct.setViewport(DESKTOP);
    const directErrors = [];
    direct.on('pageerror', error => directErrors.push(error.message));
    await direct.goto(`${stack.origin}/standard/meta/wild/`, { waitUntil: 'networkidle0' });
    assert.equal(await direct.$$eval('.standard-meta-card', cards => cards.length), 8);
    assert.ok(!(await direct.evaluate(() => document.body.textContent)).includes('Не удалось загрузить мету'), 'no error over the server slice');
    assert.equal(stack.publicReads.length, readsBefore, 'no public request after hydration');
    assert.deepEqual(directErrors, []);
    await direct.close();
    stack.down = false;
    // Every server read of the open slice is a prerender read: Express then answers no last-good copy, which Next would keep for minutes.
    assert.ok(stack.publicHeaders.length > 0 && stack.publicHeaders.every(value => value === '1'), `prerender header on every server read: ${stack.publicHeaders}`);

    // The source is down: the revalidation leaves both pages as they are and a guest still gets the data.
    stack.down = true;
    const answer = await (await fetch(`${next.origin}/health/next/revalidate/`, { method: 'POST' })).json();
    assert.ok(answer.skipped.some(item => item.path === '/standard/meta/wild'), 'the Wild page is skipped while its source is down');
    for (const path of ['/standard/meta/', '/standard/meta/wild/']) {
      const response = await fetch(`${stack.origin}${path}`);
      assert.equal(response.status, 200, `${path} answers while the source is down`);
      assert.ok((await response.text()).includes('архетип 8'), `${path} keeps its data`);
    }
    stack.down = false;
    await fetch(`${next.origin}/health/next/revalidate/`, { method: 'POST' });

    // A subscriber: the paid columns replace the locks in place, the rows do not move.
    const reader = await browser.newPage();
    await reader.setViewport(DESKTOP);
    await reader.evaluateOnNewDocument(() => {
      window.__shifts = [];
      new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shifts.push(entry.value); })
        .observe({ type: 'layout-shift', buffered: true });
    });
    await reader.setCookie({ name: 'sm_session', value: 'reader', url: stack.origin });
    await reader.setCookie({ name: 'hp_viewer', value: 'AAAAAAAAAAAAAAAAAAAAAA', url: stack.origin });
    await reader.goto(`${stack.origin}/standard/meta/`, { waitUntil: 'load' });
    await reader.waitForSelector('.standard-meta-card');
    const cardTop = () => reader.$eval('.standard-meta-card:nth-child(4)', card => card.getBoundingClientRect().top + scrollY);
    const before = await cardTop();
    // The summary keeps the open slice's values while the paid slice loads (no placeholder in between).
    await reader.evaluate(() => {
      window.__placeholder = false;
      const look = () => { if (document.querySelector('.traditional-mode-banner__summary .loading-value')) window.__placeholder = true; };
      new MutationObserver(look).observe(document.body, { subtree: true, childList: true });
      look();
    });
    // The paid slice replaces the open one inside the same page: the same card element, no dimming, no lock on screen.
    await reader.evaluate(() => {
      window.__card = document.querySelector('.standard-meta-card');
      window.__busy = false; window.__lockSeen = false;
      const watch = () => {
        if (document.querySelector('[aria-busy="true"]')) window.__busy = true;
        for (const lock of document.querySelectorAll('[aria-label*="по подписке"]')) {
          if (getComputedStyle(lock.querySelector('svg')).visibility !== 'hidden') window.__lockSeen = true;
        }
      };
      new MutationObserver(watch).observe(document.body, { attributes: true, subtree: true, childList: true });
      watch();
    });
    await reader.waitForFunction(() => document.body.textContent.includes('77,77'), { timeout: 15000 });
    assert.equal(await cardTop(), before, 'the paid figures arrive without moving the rows');
    assert.equal(await reader.$('[data-locked-filter]'), null, 'no locks for a subscriber');
    assert.equal(await reader.$('[aria-label*="по подписке"]'), null, 'no lock anywhere for a subscriber');
    assert.equal(await reader.evaluate(() => window.__card.isConnected), true, 'the cards are not remounted by the paid data');
    assert.equal(await reader.evaluate(() => window.__placeholder), false, 'the summary is never a placeholder for a subscriber');
    assert.equal(await reader.evaluate(() => window.__busy), false, 'the page is not dimmed while the paid data loads');
    assert.equal(await reader.evaluate(() => window.__lockSeen), false, 'no lock is visible to a subscriber while the paid data loads');
    assert.equal(await reader.$('[data-testid="arena-paid-offer"]'), null, 'no offer for a subscriber');
    assert.ok(stack.protectedReads >= 1);
    const shift = await reader.evaluate(() => window.__shifts.reduce((sum, value) => sum + value, 0));
    assert.ok(shift < 0.01, `the subscriber page shifted by ${shift.toFixed(4)}`);
    await reader.close();

    // A guest's page is as tall as a subscriber's: the locks stand in the boxes of the controls and values they replace.
    const measure = async (viewport, role) => {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport(viewport);
      if (role === 'reader') {
        await page.setCookie({ name: 'sm_session', value: 'reader', url: stack.origin }, { name: 'hp_viewer', value: 'AAAAAAAAAAAAAAAAAAAAAA', url: stack.origin });
      }
      await page.goto(`${stack.origin}/standard/meta/`, { waitUntil: 'networkidle0' });
      if (role === 'reader') await page.waitForFunction(() => document.body.textContent.includes('77,77'), { timeout: 15000 });
      const height = selector => page.$eval(selector, node => Math.round(node.getBoundingClientRect().height * 10) / 10);
      const heights = {
        controls: await height('.standard-meta__controls'),
        filter: await page.$eval('.standard-meta__secondary-filters > :first-child', node => Math.round(node.getBoundingClientRect().height * 10) / 10),
        card: await height('.standard-meta-card'),
      };
      await page.click('[data-meta-view="table"]');
      await page.waitForSelector('[data-meta-surface="table"] tbody tr');
      heights.row = await height('[data-meta-surface="table"] tbody tr');
      await context.close();
      return heights;
    };
    for (const viewport of [DESKTOP, PHONE]) {
      const guestHeights = await measure(viewport, 'guest');
      const readerHeights = await measure(viewport, 'reader');
      for (const part of Object.keys(guestHeights)) {
        assert.ok(Math.abs(guestHeights[part] - readerHeights[part]) <= 1,
          `${part} at ${viewport.width}px: guest ${guestHeights[part]}, subscriber ${readerHeights[part]}`);
      }
    }

    // The paid answer is slow (11 s): no error, the paid data arrives; an answer that never comes ends after the
    // deadline with the same message and a retry.
    stack.protectedDelay = 11_000;
    const slow = await browser.newPage();
    await slow.setViewport(DESKTOP);
    await slow.setCookie({ name: 'sm_session', value: 'reader', url: stack.origin });
    await slow.goto(`${stack.origin}/standard/meta/`, { waitUntil: 'load' });
    await new Promise(resolve => setTimeout(resolve, 9_000));
    assert.ok(!(await slow.evaluate(() => document.body.textContent)).includes('Подписочные данные не загрузились'));
    await slow.waitForFunction(() => document.body.textContent.includes('77,77'), { timeout: 15000 });
    await slow.close();
    stack.protectedDelay = PROTECTED_DELAY_MS;
    stack.protectedHang = true;
    const hung = await browser.newPage();
    await hung.setViewport(DESKTOP);
    await hung.setCookie({ name: 'sm_session', value: 'reader', url: stack.origin });
    await hung.goto(`${stack.origin}/standard/meta/`, { waitUntil: 'load' });
    await hung.waitForFunction(() => document.body.textContent.includes('Подписочные данные не загрузились'), { timeout: 40_000 });
    assert.match(await hung.evaluate(() => document.body.textContent), /Сервер не ответил за 25 секунд/);
    assert.equal(await hung.$$eval('.standard-meta-card', cards => cards.length), 8, 'the open slice stays under the message');
    stack.protectedHang = false;
    await hung.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Повторить')).click());
    await hung.waitForFunction(() => document.body.textContent.includes('77,77'), { timeout: 15000 });
    await hung.close();

    // The paid source fails: the open slice stays, a visible message offers a retry, and the retry brings the paid data.
    stack.protectedDown = true;
    const failing = await browser.newPage();
    await failing.setViewport(DESKTOP);
    await failing.setCookie({ name: 'sm_session', value: 'reader', url: stack.origin });
    await failing.goto(`${stack.origin}/standard/meta/`, { waitUntil: 'load' });
    await failing.waitForFunction(() => document.body.textContent.includes('Подписочные данные не загрузились'), { timeout: 15000 });
    assert.equal(await failing.$$eval('.standard-meta-card', cards => cards.length), 8, 'the open slice stays under the message');
    assert.equal(await failing.$('[aria-label*="по подписке"]'), null, 'a subscriber sees no lock even when the paid data failed');
    stack.protectedDown = false;
    await failing.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Повторить')).click());
    await failing.waitForFunction(() => document.body.textContent.includes('77,77'), { timeout: 15000 });
    assert.ok(!(await failing.evaluate(() => document.body.textContent)).includes('Подписочные данные не загрузились'), 'the message goes with the retry');
    await failing.close();

    // Access is withdrawn (the session is gone): not one frame may show the paid slice or the paid rank, and the locks return.
    const revoked = await browser.newPage();
    await revoked.setViewport(DESKTOP);
    await revoked.setCookie({ name: 'sm_session', value: 'reader', url: stack.origin });
    await revoked.goto(`${stack.origin}/standard/meta/?rank=legend`, { waitUntil: 'load' });
    await revoked.waitForFunction(() => document.body.textContent.includes('77,77'), { timeout: 15000 });
    assert.equal(await revoked.$eval('.standard-meta__rank-tabs button[aria-pressed="true"]', node => node.textContent.trim()), 'Легенда');
    await revoked.evaluate(() => {
      window.__paidFrames = 0;
      const look = () => {
        const text = document.body.textContent;
        const pressed = document.querySelector('.standard-meta__rank-tabs button[aria-pressed="true"]')?.textContent.trim();
        if (/77,77|66,61|7,77 ★/.test(text) || pressed === 'Легенда') window.__paidFrames += 1;
      };
      window.__watch = true;
      new MutationObserver(look).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
      const loop = () => { look(); if (window.__watch) requestAnimationFrame(loop); };
      loop();
      window.__paidFrames = 0; // the page is still the subscriber's here: count only what follows
    });
    const paidReadsBeforeRevoke = stack.protectedReads;
    await revoked.deleteCookie({ name: 'sm_session', url: stack.origin });
    // A restored page re-checks the session: the server now answers as it does to a guest.
    await revoked.evaluate(() => window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })));
    await revoked.waitForSelector('button[aria-label^="Ходы: по подписке"]', { timeout: 15000 });
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(await revoked.evaluate(() => window.__paidFrames), 0, 'no frame shows the paid slice after access is withdrawn');
    assert.equal(stack.protectedReads, paidReadsBeforeRevoke, 'no paid request is sent once access is withdrawn');
    assert.equal(await revoked.$eval('.standard-meta__rank-tabs button[aria-pressed="true"]', node => node.textContent.trim()), 'Алмаз — Легенда');
    assert.equal(await revoked.$$eval('[data-locked-filter]', nodes => nodes.length), 3, 'the paid filters are locks again');
    assert.equal(await revoked.$$eval('.standard-meta-card', cards => cards.length), 8, 'the open slice is what is left');
    await revoked.close();

    // The paid route refuses a subscriber whose slice is loaded (401/403 on the next paid request, no pageshow): from
    // the answer on, not one frame shows the paid slice, and the page is the guest's, with locks, until it reloads.
    stack.statusDelay = 1_500; // the access check answers slowly: the page must not wait for it
    for (const code of [401, 403]) {
    const refused = await browser.newPage();
    await refused.setViewport(DESKTOP);
    await refused.setCookie({ name: 'sm_session', value: 'reader', url: stack.origin });
    await refused.goto(`${stack.origin}/standard/meta/`, { waitUntil: 'load' });
    await refused.waitForFunction(() => document.body.textContent.includes('77,77'), { timeout: 15000 });
    await refused.evaluate(code => {
      window.__deniedFrames = 0; window.__denied = false;
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const answer = await nativeFetch(...args);
        if (answer.status === code && String(args[0]).startsWith('/api/standard-meta?')) window.__denied = true;
        return answer;
      };
      const look = () => {
        const pressed = document.querySelector('.standard-meta__rank-tabs button[aria-pressed="true"]')?.textContent.trim();
        if (window.__denied && (/77,77|66,61|7,77 ★/.test(document.body.textContent) || pressed === 'Топ-5000')) window.__deniedFrames += 1;
      };
      new MutationObserver(look).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
      const loop = () => { look(); requestAnimationFrame(loop); };
      loop();
    }, code);
    stack.protectedDenied = code;
    await refused.evaluate(() => [...document.querySelectorAll('fieldset button')].find(button => button.textContent.trim() === 'Топ-5000').click());
    await refused.waitForSelector('button[aria-label^="Ходы: по подписке"]', { timeout: 15000 });
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(await refused.evaluate(() => window.__denied), true, 'the paid route did refuse');
    assert.equal(await refused.evaluate(() => window.__deniedFrames), 0, 'no frame shows the paid slice after the refusal');
    assert.equal(await refused.$eval('.standard-meta__rank-tabs button[aria-pressed="true"]', node => node.textContent.trim()), 'Алмаз — Легенда');
    assert.equal(await refused.$$eval('[data-locked-filter]', nodes => nodes.length), 3, 'the paid filters are locks');
    stack.protectedDenied = 0;
    await refused.close();
    }
    stack.statusDelay = 0;

    // A subscriber's filters go with the format switch, both ways: the address of the new page carries them, the paid
    // request of the new format is sent with them and its answer is what is shown.
    const filtered = await browser.newPage();
    await filtered.setViewport(DESKTOP);
    await filtered.setCookie({ name: 'sm_session', value: 'reader', url: stack.origin });
    await filtered.goto(`${stack.origin}/standard/meta/`, { waitUntil: 'load' });
    await filtered.waitForFunction(() => document.body.textContent.includes('77,77'), { timeout: 15000 });
    const choose = (label, value) => filtered.evaluate((name, wanted) => {
      const select = [...document.querySelectorAll('label')].find(node => node.textContent.trim().startsWith(name))?.querySelector('select');
      if (!select) throw new Error(`no select ${name}`);
      select.value = wanted;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, label, value);
    await filtered.evaluate(() => [...document.querySelectorAll('fieldset button')].find(button => button.textContent.trim() === 'Легенда').click());
    await choose('Период', 'past_day');
    await choose('Очерёдность хода', 'on_coin');
    await choose('Минимум игр', '500');
    const FILTERS = { rank: 'legend', coin: 'on_coin', min_games: '500', period: 'past_day' };
    const lastQuery = () => stack.protectedQueries.at(-1);
    await filtered.waitForFunction(() => document.body.textContent.includes('77,77'));
    assert.deepEqual({ rank: lastQuery().rank, coin: lastQuery().coin, min_games: lastQuery().min_games, period: lastQuery().period }, FILTERS,
      'the paid request of Standard carries the chosen filters');
    const goTo = async (name, path, archetype) => {
      const before = stack.protectedQueries.length;
      await filtered.evaluate(text => [...document.querySelectorAll('a')].find(link => link.textContent.trim().startsWith(text)
        && link.closest('[aria-label="Фильтры меты"]')).click(), name);
      await filtered.waitForFunction(location => window.location.pathname === location, { timeout: 15000 }, path);
      const search = new URLSearchParams(await filtered.evaluate(() => window.location.search));
      assert.deepEqual(Object.fromEntries(search), FILTERS, `${path} keeps the filters in its address`);
      await filtered.waitForFunction(text => document.body.textContent.includes(text) && document.body.textContent.includes('77,77'), { timeout: 15000 }, archetype);
      assert.ok(stack.protectedQueries.length > before, 'the new format asks its own paid slice');
      const asked = stack.protectedQueries.at(-1);
      assert.equal(asked.format, path.includes('wild') ? 'wild' : 'standard');
      assert.deepEqual({ rank: asked.rank, coin: asked.coin, min_games: asked.min_games, period: asked.period }, FILTERS, 'and asks it with the filters');
      assert.equal(await filtered.$eval('fieldset button[aria-pressed="true"]', node => node.textContent.trim()), 'Легенда', 'the rank is still chosen');
    };
    await goTo('Вольный', '/standard/meta/wild/', 'Вольный архетип 1');
    await goTo('Стандарт', '/standard/meta/', 'Стандартный архетип 1');
    // Back within the hand-off's few seconds opens the page with the filters of its own address, not those just handed to the other format.
    await filtered.evaluate(() => [...document.querySelectorAll('fieldset button')].find(button => button.textContent.trim() === 'Топ-5000').click());
    await filtered.evaluate(() => [...document.querySelectorAll('a')].find(link => link.textContent.trim().startsWith('Вольный')
      && link.closest('[aria-label="Фильтры меты"]')).click());
    await filtered.waitForFunction(() => window.location.pathname === '/standard/meta/wild/' && document.body.textContent.includes('Вольный архетип 1'), { timeout: 15000 });
    await filtered.evaluate(() => window.history.back());
    await filtered.waitForFunction(() => window.location.pathname === '/standard/meta/' && document.body.textContent.includes('Стандартный архетип 1') && document.body.textContent.includes('77,77'), { timeout: 15000 });
    assert.equal(await filtered.$eval('fieldset button[aria-pressed="true"]', node => node.textContent.trim()), 'Легенда', 'Back opens the filters of the address');
    await filtered.close();

    // A direct link with values the server refuses opens the default slice: no error, and no paid request carries them.
    const broken = await browser.newPage();
    await broken.setViewport(DESKTOP);
    await broken.setCookie({ name: 'sm_session', value: 'reader', url: stack.origin });
    const queriesBefore = stack.protectedQueries.length;
    await broken.goto(`${stack.origin}/standard/meta/wild/?period=broken&rank=xyz`, { waitUntil: 'load' });
    await broken.waitForFunction(() => document.body.textContent.includes('77,77'), { timeout: 15000 });
    assert.ok(!(await broken.evaluate(() => document.body.textContent)).includes('Не удалось загрузить мету'), 'no error for a bad link');
    const brokenQueries = stack.protectedQueries.slice(queriesBefore);
    assert.ok(brokenQueries.length > 0, 'the paid slice was asked');
    for (const asked of brokenQueries) {
      assert.notEqual(asked.period, 'broken');
      assert.notEqual(asked.rank, 'xyz');
      assert.equal(asked.rank, 'diamond_legend', 'the default rank replaces the bad one');
    }
    await broken.close();
  } finally {
    if (browser) await browser.close();
    await next.close();
    await closeLocal(stack.server);
  }
});
