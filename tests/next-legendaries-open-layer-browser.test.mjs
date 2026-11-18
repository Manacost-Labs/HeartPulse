import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { resolve } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';
import { SENTINELS, openAnswer, protectedAnswer } from './helpers/legendariesOpenLayerFixture.ts';

// /legendaries/ in a real browser against an Express stub: a guest without JavaScript already sees the groups,
// a guest with JavaScript gets a lock and an offer instead of the paid figures, a subscriber gets the paid
// columns in place, and signing out takes them away again. The stub's protected route is what carries the
// sentinels, so they appear on the page only for a subscriber.

const READER = { id: 'ol-reader', email: 'reader@example.test', name: 'Подписчик Арены', role: 'user' };
const SUBSCRIBED = { hasAccess: true, entitlements: { arena: true }, source: 'boosty', checkedAt: null,
  stale: false, message: '', boosty: { checked: true, hasAccess: true }, patreon: {}, telegram: {} };
const PROTECTED_DELAY_MS = 900;
const CARD_IMAGE = readFileSync(resolve('public/arena-logo-icon.webp'));
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true };
const DESKTOP = { width: 1440, height: 900 };

async function startStack() {
  const sessions = new Set(['reader']);
  const state = { protectedReads: 0, next: null };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://stack');
    const name = /(?:^|;\s*)ol_session=(\w+)/.exec(request.headers.cookie ?? '')?.[1];
    const reader = Boolean(name && sessions.has(name));
    const json = (status, payload) => response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' })
      .end(JSON.stringify(payload));
    if (url.pathname === '/api/auth/me') return json(200, { user: reader ? READER : null });
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') { sessions.delete(name); return json(200, { ok: true }); }
    if (url.pathname === '/api/subscription/status') return reader ? json(200, SUBSCRIBED) : json(401, { error: 'guest' });
    if (url.pathname === '/api/legendaries/public') {
      return json(200, openAnswer({ noise: true, sourceId: url.searchParams.get('source') === 'firestone' ? 'firestone' : 'hsreplay' }));
    }
    if (url.pathname === '/api/legendaries') {
      if (!reader) return json(401, { error: 'subscription required' });
      state.protectedReads += 1;
      return void setTimeout(() => json(200, protectedAnswer()), PROTECTED_DELAY_MS);
    }
    if (url.pathname.startsWith('/api/card-image/')) return response.writeHead(200, { 'Content-Type': 'image/webp' }).end(CARD_IMAGE);
    if (url.pathname.startsWith('/api/')) return json(401, { error: 'guest' });
    const next = new URL(state.next);
    const upstream = http.request(next, { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  const origin = await listenLocal(server);
  return Object.assign(state, { server, origin, sessions });
}

const cells = page => page.$$eval('.legendary-group-card', cards => cards.map(card => ({
  name: card.querySelector('.font-hs')?.textContent,
  paid: Object.fromEntries([...card.querySelectorAll('.paywalled-legendaries')].map(cell => [cell.dataset.metric,
    { state: cell.dataset.state, text: cell.textContent }])),
})));

async function open(browser, origin, { viewport = DESKTOP, session = null, path = '/legendaries/' } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    window.__layoutShifts = [];
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__layoutShifts.push(entry.value);
    }).observe({ type: 'layout-shift', buffered: true });
  });
  if (session) await page.setCookie({ name: 'ol_session', value: session, url: origin });
  await page.goto(`${origin}${path}`, { waitUntil: 'load' });
  await page.waitForSelector('.legendary-group-card', { timeout: 15000 });
  return { page, errors };
}

test('a guest and a subscriber on /legendaries/ in a real browser', async () => {
  const stack = await startStack();
  const next = await startNextServer({ legacyOrigin: stack.origin,
    env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
  stack.next = next.origin;
  let browser;
  try {
    // The page is a five-minute ISR copy: move the server's clock until the copy with the groups is served.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      const html = await (await fetch(`${next.origin}/legendaries/`)).text();
      if (html.includes('legendary-group-card')) break;
      assert.ok(attempt < 39, 'the server HTML never got the groups');
      await delay(250);
    }
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });

    // A guest without JavaScript: the groups and the lock, and no paid value.
    const bare = await browser.newPage();
    await bare.setJavaScriptEnabled(false);
    await bare.goto(`${stack.origin}/legendaries/`, { waitUntil: 'load' });
    const bareCells = await cells(bare);
    assert.deepEqual(bareCells.map(card => card.name), ['Ярость Альфа', 'Бета Властелин', 'Гамма Страж']);
    assert.ok(bareCells.every(card => card.paid.offerRate.state === 'locked' && card.paid.score.state === 'locked'));
    assert.ok(await bare.$eval('body', body => body.textContent.includes('Спутник Первый')), 'the companions are there');
    const bareHtml = await bare.content();
    assert.deepEqual(SENTINELS.filter(value => bareHtml.includes(value)), [], 'no sentinel in the HTML a guest without JavaScript gets');
    await bare.close();

    // A guest: no layout shift, the lock opens the offer, the class and the group stay in the address.
    for (const viewport of [DESKTOP, PHONE]) {
      const { page, errors } = await open(browser, stack.origin, { viewport });
      await delay(1200);
      const shift = await page.evaluate(() => window.__layoutShifts.reduce((sum, value) => sum + value, 0));
      assert.ok(shift <= 0.1, `${viewport.width}px: the guest page shifted by ${shift.toFixed(4)}`);
      assert.equal(await page.$('.arena-paywall'), null, 'no gate over the groups');
      assert.doesNotMatch(await page.evaluate(() => document.body.textContent), /91\.2|87\.7|66\.7|40\.2|95\.5/, 'no paid value for a guest');
      assert.equal(stack.protectedReads, 0, 'a guest never asks for the protected groups');

      // The first screen of a phone: the name, the companions and the winrate of the first group.
      if (viewport.isMobile) {
        const first = await page.$eval('.legendary-group-card[data-rank="1"]', card => {
          const box = selector => card.querySelector(selector)?.getBoundingClientRect().bottom ?? Infinity;
          return { name: box('.font-hs'), winrate: box('.legendary-winrate-badge'), lineup: box('.legendary-group-composition') };
        });
        assert.ok(first.name <= viewport.height && first.winrate <= viewport.height && first.lineup <= viewport.height,
          `the first group is not in the first screen: ${JSON.stringify(first)}`);
      }

      // Search and class keep working.
      await page.type('#legendary-search', 'Гамма');
      assert.deepEqual((await cells(page)).map(card => card.name), ['Гамма Страж']);
      await page.$eval('#legendary-search', input => { input.value = ''; });
      await page.type('#legendary-search', ' ');
      await page.click('.legendary-class-tabs button[title="Маг"]');
      assert.deepEqual((await cells(page)).map(card => card.name), ['Ярость Альфа', 'Бета Властелин']);
      assert.match(await page.evaluate(() => location.search), /class=mage/);

      // Tapping a paid figure opens the offer for that group; the address keeps the class and the group.
      await page.click('.legendary-group-card[data-rank="1"] .legendary-paid-stat__lock');
      await page.waitForSelector('[data-testid="legendaries-offer"]');
      assert.equal(await page.$eval('[data-testid="legendaries-offer"] h2', node => node.textContent),
        'Узнать, как часто эту группу предлагают вашему классу');
      assert.match(await page.evaluate(() => location.search), /class=mage/);
      assert.match(await page.evaluate(() => location.search), /group=LEG_A/);
      await page.click('.legendaries-offer__close');
      await page.waitForFunction(() => !document.querySelector('[data-testid="legendaries-offer"]'));
      assert.equal(await page.$eval('.legendary-group-card[data-selected="true"]', card => card.dataset.rank), '1');
      // A paid sort opens the offer too and does not reorder the groups.
      await page.evaluate(() => [...document.querySelectorAll('.legendary-sort-bar button')].find(button => button.getAttribute('aria-expanded') !== null).click());
      await page.evaluate(() => [...document.querySelectorAll('.legendary-sort-bar button')].find(button => button.textContent.includes('Оценка ArenaSmith')).click());
      await page.waitForSelector('[data-testid="legendaries-offer"]');
      assert.deepEqual(errors, []);
      await page.close();
    }

    // A link with a class and a group lands on that group.
    const linked = await open(browser, stack.origin, { path: '/legendaries/?class=priest&group=LEG_C' });
    await linked.page.waitForSelector('.legendary-group-card[data-selected="true"]');
    assert.equal(await linked.page.$$eval('.legendary-group-card', nodes => nodes.length), 2);
    await linked.page.close();

    // A subscriber: the paid columns come in place; the layout, the class and the search stay.
    const { page, errors } = await open(browser, stack.origin, { session: 'reader' });
    await page.click('.legendary-class-tabs button[title="Маг"]');
    const before = await page.$eval('.legendary-group-card[data-rank="1"]', card => card.getBoundingClientRect().top + scrollY);
    await page.waitForFunction(() => document.querySelector('.legendary-group-card [data-metric="score"]')?.dataset.state === 'open'
      && !document.querySelector('.legendary-group-card [data-metric="score"]').textContent.includes('…'), { timeout: 15000 });
    const open1 = await cells(page);
    assert.deepEqual(open1.map(card => card.name), ['Ярость Альфа', 'Бета Властелин'], 'the class stays');
    assert.match(open1[0].paid.offerRate.text, /66\.7%|91\.2%/);
    assert.match(open1[0].paid.score.text, /87\.7/);
    assert.match(open1[1].paid.score.text, /40\.2/);
    const after = await page.$eval('.legendary-group-card[data-rank="1"]', card => card.getBoundingClientRect().top + scrollY);
    assert.equal(after, before, 'the paid figures arrive without moving the groups');
    assert.equal(await page.$('.legendary-paid-stat__lock'), null, 'no lock for a subscriber');
    // Sorting by the paid score works for a subscriber.
    await page.evaluate(() => [...document.querySelectorAll('.legendary-sort-bar button')].find(button => button.getAttribute('aria-expanded') !== null).click());
    await page.evaluate(() => [...document.querySelectorAll('.legendary-sort-bar button')].find(button => button.textContent.includes('Оценка ArenaSmith')).click());
    assert.deepEqual((await cells(page)).map(card => card.name), ['Ярость Альфа', 'Бета Властелин']);
    await page.click('.legendary-class-tabs button[title="Все"]');
    assert.deepEqual((await cells(page)).map(card => card.name), ['Гамма Страж', 'Ярость Альфа', 'Бета Властелин'], 'ordered by the paid score');
    assert.equal(await page.$('[data-testid="legendaries-offer"]'), null);

    // Signing out takes the paid figures away.
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.evaluate(() => { location.href = '/?login'; })]);
    const logout = await page.waitForSelector('.account-logout', { timeout: 15000 });
    await logout.evaluate(button => button.click());
    await page.waitForFunction(() => !document.querySelector('.account-logout'));
    for (let attempt = 0; stack.sessions.has('reader') && attempt < 50; attempt += 1) await delay(50);
    assert.equal(stack.sessions.has('reader'), false, 'the account page ended the session');
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.evaluate(() => history.back())]);
    await page.waitForSelector('.legendary-group-card');
    await page.waitForSelector('.legendary-paid-stat__lock', { timeout: 15000 });
    const guestAgain = await cells(page);
    assert.ok(guestAgain.every(card => card.paid.offerRate.state === 'locked' && card.paid.score.state === 'locked'));
    assert.ok(!(await page.evaluate(() => document.body.textContent)).match(/91\.2|87\.7|66\.7/), 'no paid value after sign-out');
    assert.deepEqual(errors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await next.close();
    await closeLocal(stack.server);
  }
});
