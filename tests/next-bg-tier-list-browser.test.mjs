import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';
import { isAbortedRoutePrefetch, isMenuRoutePrefetch } from './helpers/abortedRoutePrefetch.mjs';
import { isMenuBackgroundRead, MENU_PATCH_ARCHIVE } from './helpers/menuBackgroundReads.mjs';

const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');

test('Next BG tier list keeps its public teaser separate from subscriber data and restores URL state', async () => {
  const tierRequests = [];
  let tierStatus = 200;
  // Lists whose protected answer fails (503) or comes back with nothing in it (200, no entries).
  const failingLists = new Set(); const emptyLists = new Set();
  let malformedAuthResponsesRemaining = 0;
  let failedSubscriptionResponsesRemaining = 0;
  const reservation = http.createServer();
  const nextOrigin = await listenLocal(reservation); await closeLocal(reservation);
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/public-web',
    '--hostname', '127.0.0.1', '--port', new URL(nextOrigin).port], {
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', RUNTIME_CLIENT_CONFIG_FILE: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; let browser;
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
  try {
    let ready = false;
    for (let i = 0; i < 200; i += 1) {
      if (child.exitCode !== null) throw new Error(`Next exited: ${output}`);
      ready = await fetch(`${nextOrigin}/health/next/`).then(response => response.ok, () => false);
      if (ready) break;
      await delay(50);
    }
    assert.equal(ready, true, `Next did not start: ${output}`);
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      const signedIn = request.headers().cookie?.includes('tier_reader=1');
      const respond = (status, payload) => request.respond({ status, contentType: 'application/json',
        body: JSON.stringify(payload) });
      if (url.pathname === '/api/auth/me') {
        if (signedIn && malformedAuthResponsesRemaining > 0) {
          malformedAuthResponsesRemaining -= 1;
          void respond(200, { malformed: true });
        } else {
          void respond(200, { user: signedIn
            ? { id: 'tier-reader', email: 'tier@example.test', name: 'Игрок', role: 'user' } : null });
        }
      } else if (url.pathname === '/api/subscription/status') {
        if (failedSubscriptionResponsesRemaining > 0) {
          failedSubscriptionResponsesRemaining -= 1;
          void respond(503, { error: 'temporarily unavailable' });
        } else void respond(200, { hasAccess: true, entitlements: { battlegrounds: true } });
      } else if (isMenuBackgroundRead(url.pathname)) {
        void respond(200, MENU_PATCH_ARCHIVE);
      } else if (url.pathname === '/api/bg/tier-lists') {
        tierRequests.push(url.search);
        const list = url.searchParams.get('list');
        void respond(signedIn ? (failingLists.has(list) ? 503 : tierStatus) : 401, !signedIn ? { error: 'guest' }
          : tierStatus !== 200 || failingLists.has(list) ? { error: 'Данные временно недоступны' }
            : emptyLists.has(list) ? { list, count: 0, tiers: {} }
              : { list, count: 1,
                tiers: { S: [{ key: 'fx', title: 'Фикстура', name: 'Фикстура', tier: 'S', dbfId: 1 }], A: [], B: [], C: [], D: [] } });
      } else if (/^\/(?:menu\/|tier-marks\/|wallpaper\/|fonts\/|ad\/|hearthpulse-logo\.webp$|favicon(?:-\d+)?\.(?:png|ico)$|apple-touch-icon\.png$)/.test(url.pathname)) {
        const mime = url.pathname.endsWith('.woff2') ? 'font/woff2'
          : url.pathname.endsWith('.otf') ? 'font/otf'
            : url.pathname.endsWith('.webp') ? 'image/webp'
              : url.pathname.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
        void request.respond({ status: 200, contentType: mime,
          body: readFileSync(new URL(`../public${url.pathname}`, import.meta.url)) });
      } else void request.continue();
    });
    // Whether the paid view is on screen (it is mounted, hidden, while the open view stays). Both are the same tier
    // list: the paid one is the view inside `.arena-paid-view`.
    const PAID = '.arena-paid-view';
    const OPEN_LOCKS = '.paywalled-builds.bg-tierlist-tab--locked';
    const shownPaid = () => page.evaluate(paid => [...document.querySelectorAll(`${paid} .bg-tierlist-toolbar`)].some(node => node.getClientRects().length > 0), PAID);
    const errors = []; const failed = []; const failedResponses = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    // The subscriber's own data probe may be cut by the reload the test makes while it is in flight.
    page.on('requestfailed', request => { if (!isAbortedRoutePrefetch(request) && !request.url().endsWith('/api/bg/tier-lists?list=minions')) failed.push(request.url()); });
    page.on('response', response => { if (response.status() >= 400 && !isMenuRoutePrefetch(response.request())) failedResponses.push(`${response.status()} ${response.url()}`); });
    for (const width of [1440, 390, 320]) {
      await page.setViewport({ width, height: 900 });
      const guest = await page.goto(`${nextOrigin}/battlegrounds/tier-list/`, { waitUntil: 'networkidle2' });
      // The page is prerendered: a repeat visit revalidates its ETag (304).
      assert.ok([200, 304].includes(guest.status()), `${guest.status()}`);
      await page.evaluate(axe);
      const state = await page.evaluate(async () => ({
        headings: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
        canonical: document.querySelector('link[rel="canonical"]')?.href,
        // The subscriber's view on the open builds (none in this copy, so it says so): the other lists are locked
        // tabs, no subscription dialog until one is pressed.
        teaser: document.querySelectorAll('.paywalled-builds.bg-tierlist-tab--locked').length === 3 && !document.querySelector('.arena-paywall')
          && document.querySelector('main').textContent.includes('Сборки временно недоступны'),
        overflow: document.documentElement.scrollWidth > innerWidth,
        violations: (await axe.run(document,
          { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => item.id),
      }));
      assert.deepEqual(state.headings, ['Тир-лист Полей сражений']);
      assert.equal(state.canonical, 'https://hearthpulse.net/battlegrounds/tier-list/');
      assert.equal(state.teaser, true);
      assert.equal(state.overflow, false);
      assert.deepEqual(state.violations, []);
    }
    assert.deepEqual(tierRequests, [], 'anonymous visitors do not request subscriber statistics');
    await page.evaluate(() => localStorage.setItem('hs_arena_auth_cookie_hint', '1'));
    await page.setCookie({ name: 'tier_reader', value: '1', url: nextOrigin });
    malformedAuthResponsesRemaining = 3;
    const member = await page.goto(`${nextOrigin}/battlegrounds/tier-list/?list=strategies&source=hsreplay`,
      { waitUntil: 'networkidle2' });
    assert.ok([200, 304].includes(member.status()), `${member.status()}`);
    for (let attempt = 0; malformedAuthResponsesRemaining > 0 && attempt < 30; attempt += 1) await delay(100);
    assert.equal(malformedAuthResponsesRemaining, 0, 'all three bounded auth attempts must fail');
    await delay(100);
    assert.doesNotMatch(await page.$eval('main', node => node.textContent), /Подписка не найдена|доступен подписчикам/,
      'a remembered session must not read as a refusal after a transient auth failure');
    // The prerendered page cannot vary its meta by query; the response header carries the policy.
    const deepLink = await fetch(`${nextOrigin}/battlegrounds/tier-list/?list=strategies&source=hsreplay`);
    await deepLink.arrayBuffer();
    assert.equal(deepLink.headers.get('x-robots-tag'), 'noindex, follow');
    assert.equal(await page.$eval('link[rel="canonical"]', node => node.href),
      'https://hearthpulse.net/battlegrounds/tier-list/');
    const strategy = await page.waitForSelector(`${PAID} [data-tour-id="bg-tier-list-strategy"][aria-pressed="true"]`,
      { timeout: 12000 }).catch(() => null);
    assert.ok(strategy, JSON.stringify({ tierRequests,
      main: await page.$eval('main', node => node.textContent.slice(0, 450)) }));
    assert.ok(tierRequests.some(query => query.includes('list=strategies') && query.includes('source=hsreplay')));
    assert.deepEqual(errors, [], JSON.stringify(failedResponses.slice(0, 40)));
    assert.deepEqual(failed, []);
    assert.deepEqual(failedResponses, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector(`${PAID} [data-tour-id="bg-tier-list-strategy"][aria-pressed="true"]`, { timeout: 10000 });
    assert.equal(await page.$eval(`${PAID} .bg-tierlist-toolbar__meta`, node => node.textContent), '1');
    failedSubscriptionResponsesRemaining = 1;
    await page.reload({ waitUntil: 'networkidle2' });
    assert.equal(failedSubscriptionResponsesRemaining, 0);
    assert.doesNotMatch(await page.$eval('main', node => node.textContent), /Подписка не найдена|доступен подписчикам/,
      'a temporary subscription API failure must not appear as a revoked entitlement');
    await page.waitForSelector(`${PAID} [data-tour-id="bg-tier-list-strategy"][aria-pressed="true"]`, { timeout: 10000 });
    tierStatus = 503;
    await page.reload({ waitUntil: 'networkidle2' });
    // The subscriber's own data fails: the open list stays instead of the paid view's error.
    await page.waitForSelector(OPEN_LOCKS, { timeout: 10000 });
    assert.equal(await shownPaid(), false, 'no paid view over a failed protected read');
    // The list the paid view really asks for (the one in the address) decides, not another list: a failed or an
    // empty answer for it keeps the open list, whatever the other lists answer.
    tierStatus = 200;
    for (const [query, list, mode] of [['list=strategies&source=hsreplay', 'strategies', 'failing'], ['list=trinkets', 'trinkets', 'failing'],
      ['list=strategies&source=hsreplay', 'strategies', 'empty']]) {
      (mode === 'failing' ? failingLists : emptyLists).add(list);
      await page.goto(`${nextOrigin}/battlegrounds/tier-list/?${query}`, { waitUntil: 'networkidle2' });
      await page.waitForSelector(OPEN_LOCKS, { timeout: 10000 });
      assert.equal(await shownPaid(), false, `${list} ${mode}: the open list stays`);
      assert.equal(await page.$$eval('h1', nodes => nodes.filter(node => node.getClientRects().length > 0).length), 1, `${list} ${mode}: one visible H1`);
      failingLists.clear(); emptyLists.clear();
    }
    await page.goto(`${nextOrigin}/battlegrounds/tier-list/?list=strategies&source=hsreplay`, { waitUntil: 'networkidle2' });
    await page.waitForSelector(`${PAID} [data-tour-id="bg-tier-list-strategy"][aria-pressed="true"]`, { timeout: 10000 });
    assert.equal(await page.$(OPEN_LOCKS), null, 'a good answer replaces the open view');
    await page.close();
  } finally {
    if (browser) await browser.close();
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
  }
});
