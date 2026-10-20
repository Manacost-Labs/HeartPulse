import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

const READER = { id: 'bf-reader', email: 'reader@example.test', name: 'Читатель Кэша', role: 'user' };
const OTHER = { id: 'bf-other', email: 'other@example.test', name: 'Другой Посетитель', role: 'user' };
const SUBSCRIBED = { hasAccess: true, entitlements: { battlegrounds: true, arena: true }, source: 'boosty', checkedAt: null,
  stale: false, message: '', boosty: { checked: true, hasAccess: true }, patreon: {}, telegram: {} };
const UNSUBSCRIBED = { ...SUBSCRIBED, hasAccess: false, entitlements: {}, boosty: { checked: true, hasAccess: false } };
const ACCOUNTS = { reader: { user: READER, subscription: SUBSCRIBED }, other: { user: OTHER, subscription: UNSUBSCRIBED } };

// Stands where nginx and Express do: pages go to Next.js, `/api/` is answered
// here with Express's `no-store` header. `bf_session` names the account; the
// server ends a session on sign-out or revocation (`sessions.delete`).
async function startGateway(nextOrigin) {
  const sessions = new Set(Object.keys(ACCOUNTS));
  const gateway = { subscriptionDelay: 0, meDelay: 0 };
  const next = new URL(nextOrigin);
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://gateway');
    const name = /(?:^|;\s*)bf_session=(\w+)/.exec(request.headers.cookie ?? '')?.[1];
    const account = name && sessions.has(name) ? ACCOUNTS[name] : null;
    const json = (status, payload) => response.writeHead(status, { 'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store' }).end(JSON.stringify(payload));
    if (url.pathname === '/api/auth/me') {
      // `meDelay`: the session answer is late too.
      return setTimeout(() => json(200, { user: account?.user ?? null }), gateway.meDelay);
    }
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
      sessions.delete(name);
      return json(200, { ok: true });
    }
    if (url.pathname === '/api/subscription/status') {
      if (!account) return json(401, { error: 'guest' });
      // `subscriptionDelay`: the subscription answer is late, or never comes ('hang').
      if (gateway.subscriptionDelay === 'hang') return undefined;
      if (gateway.subscriptionDelay === 'error') return json(503, { error: 'unavailable' });
      return setTimeout(() => json(200, account.subscription), gateway.subscriptionDelay);
    }
    if (url.pathname === '/api/bg/tier-lists') {
      return account?.subscription.entitlements.battlegrounds
        ? json(200, { list: url.searchParams.get('list'), count: 0, tiers: { S: [], A: [], B: [], C: [], D: [] } })
        : json(401, { error: 'guest' });
    }
    if (url.pathname === '/api/winrates') {
      return account?.subscription.entitlements.arena ? json(200, { source: 'hsreplay', updatedAt: new Date().toISOString(),
        classes: [{ id: 'mage', name: 'Маг', winrate: 55.5, color: '#3366ff', games: 1000 }] }) : json(401, { error: 'guest' });
    }
    if (url.pathname.startsWith('/api/')) return json(401, { error: 'guest' });
    const upstream = http.request(next, { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  return Object.assign(gateway, { server, origin: await listenLocal(server), sessions });
}

// Navigates like a link the visitor follows (renderer-initiated, not prerendered).
async function follow(page, path) {
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.evaluate(href => { location.href = href; }, path)]);
}

async function back(page, steps = 1) {
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.evaluate(count => history.go(-count), steps)]);
}

// What the restored document shows: inside `pageshow` (after the page's own
// listener), on the first frame after it, and later while it re-checks.
async function watchRestore(page) {
  await page.evaluate(() => {
    window.__restoreMarker = true;
    window.__restored = null;
    if (window.__restoreWatched) return;
    window.__restoreWatched = true;
    const snapshot = () => ({
      paid: Boolean(document.querySelector('.bg-tier-list-page, ol.arena-classes-board')),
      reader: document.body.textContent.includes('Читатель Кэша'),
      avatar: Boolean(document.querySelector('.arena-sidebar-profile-avatar')),
    });
    // Whether a lock (the gate) shows, sampled every frame after the restore.
    const gates = () => { window.__restoredGates.push(Boolean(document.querySelector('.arena-paywall'))); };
    addEventListener('pageshow', event => {
      if (!event.persisted) return;
      window.__restored = { event: snapshot(), later: [] };
      window.__restoredGates = [];
      gates();
      const until = performance.now() + 1500;
      const sample = () => { gates(); if (performance.now() < until) requestAnimationFrame(sample); };
      requestAnimationFrame(sample);
      requestAnimationFrame(() => { window.__restored.frame = snapshot(); });
      for (const wait of [300, 1000, 2500, 6500]) setTimeout(() => window.__restored.later.push(snapshot()), wait);
    });
  });
}

async function restoredState(page, settled = 0) {
  await page.waitForFunction(count => window.__restored?.frame && window.__restored.later.length >= count,
    { timeout: 10000 }, settled).catch(() => null);
  return page.evaluate(() => ({ marker: window.__restoreMarker === true, restored: window.__restored ?? null }));
}

async function openReader(browser, origin, account, path = '/battlegrounds/tier-list/', paid = '.bg-tier-list-page') {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.setCookie({ name: 'bf_session', value: account, url: origin });
  await page.goto(`${origin}${path}`, { waitUntil: 'load' });
  await page.waitForSelector(paid, { timeout: 15000 });
  await page.waitForFunction(() => document.body.textContent.includes('Читатель Кэша'));
  await watchRestore(page);
  return { page, pageErrors };
}

const SHOWN = { paid: true, reader: true, avatar: true };
const HIDDEN = { paid: false, reader: false, avatar: false };

test('public documents allow the back/forward cache and account documents keep no-store', async () => {
  const express = http.createServer((request, response) => response.writeHead(401).end());
  let next;
  try {
    next = await startNextServer({ legacyOrigin: await listenLocal(express) });
    const header = async (path, init) => {
      const response = await fetch(`${next.origin}${path}`, { redirect: 'manual', ...init });
      await response.arrayBuffer();
      return `${response.status} ${response.headers.get('cache-control')}`;
    };
    for (const path of ['/', '/tierlist/', '/classes/', '/standard/matchups/', '/heroes/', '/library/minions/',
      '/battlegrounds/tier-list/', '/guides-archive/', '/cosmetics/']) {
      assert.equal(await header(path), '200 private, no-cache', path);
    }
    assert.equal(await header('/tierlist/', { method: 'HEAD' }), '200 private, no-cache');
    // The account page, cookie-dependent admin documents, profiles and errors keep Next's no-store.
    const noStore = 'private, no-cache, no-store, max-age=0, must-revalidate';
    for (const path of ['/?login', '/admin/', '/deck-builder/', '/archetypes/']) {
      assert.equal(await header(path), `200 ${noStore}`, path);
    }
    for (const path of ['/id/abc/', '/profiles/abc/', '/no-such-page/']) {
      assert.equal(await header(path), `404 ${noStore}`, path);
    }
    // proxy.ts answers an unverifiable entity itself; its 503 is never cached.
    assert.equal(await header('/heroes/123/'), '503 private, no-store');
    // Prerendered support pages keep their own caching.
    assert.equal(await header('/faq/'), '200 s-maxage=31536000');
  } finally {
    if (next) await next.close();
    await closeLocal(express);
  }
});

test('Back restores public pages from the back/forward cache and never shows a signed-out viewer paid data', async () => {
  const express = http.createServer((request, response) => response.writeHead(401).end());
  let next; let gateway; let browser;
  try {
    next = await startNextServer({ legacyOrigin: await listenLocal(express) });
    gateway = await startGateway(next.origin);
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });

    // A guest goes from one public page to another and back.
    const guest = await browser.newPage();
    await guest.setViewport({ width: 1440, height: 900 });
    const cdp = await guest.createCDPSession();
    await cdp.send('Page.enable');
    const notRestored = [];
    cdp.on('Page.backForwardCacheNotUsed', event => notRestored.push(...event.notRestoredExplanations.map(item => item.reason)));
    await guest.goto(`${gateway.origin}/tierlist/`, { waitUntil: 'load' });
    await guest.waitForSelector('.arena-paywall');
    await guest.evaluate(() => scrollTo(0, 600));
    await watchRestore(guest);
    await follow(guest, '/classes/');
    await back(guest);
    const guestState = await restoredState(guest);
    assert.deepEqual(notRestored, [], 'the guest page must be restorable');
    assert.equal(guestState.marker, true, 'Back must restore the same document, not reload it');
    assert.equal(await guest.evaluate(() => scrollY), 600, 'the restored page keeps its scroll position');
    await guest.close();

    // A phone visitor who leaves through the open menu comes back to a closed,
    // scrollable page, not to the menu the document was left with.
    const phone = await browser.newPage();
    await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await phone.goto(`${gateway.origin}/tierlist/`, { waitUntil: 'load' });
    await phone.click('button[aria-controls="arena-mobile-menu"]');
    await phone.waitForSelector('#arena-mobile-menu', { visible: true });
    await watchRestore(phone);
    await follow(phone, '/classes/');
    await back(phone);
    const phoneState = await restoredState(phone);
    assert.equal(phoneState.marker, true, 'the phone page must be restored');
    // The drawer stays in the page as a closed popover: it must be neither
    // open nor on screen.
    assert.deepEqual(await phone.evaluate(() => {
      const menu = document.querySelector('#arena-mobile-menu');
      return {
        menu: Boolean(menu && (menu.matches(':popover-open') || menu.hasAttribute('data-open')
          || getComputedStyle(menu).display !== 'none')),
        expanded: document.querySelector('button[aria-controls="arena-mobile-menu"]')?.getAttribute('aria-expanded'),
        locked: getComputedStyle(document.body).overflow === 'hidden' || getComputedStyle(document.body).position === 'fixed',
      };
    }), { menu: false, expanded: 'false', locked: false });
    await phone.close();

    // A subscriber's restored page hides the viewer before its first frame,
    // since a frozen page cannot know whether the session still holds, and
    // shows the paid view again once the server confirms it.
    const { page: reader, pageErrors } = await openReader(browser, gateway.origin, 'reader');
    await follow(reader, '/classes/');
    await back(reader);
    const kept = await restoredState(reader, 2);
    assert.equal(kept.marker, true, 'the subscriber page must be restored');
    assert.deepEqual({ event: kept.restored.event, frame: kept.restored.frame, later: kept.restored.later[1] },
      { event: HIDDEN, frame: HIDDEN, later: SHOWN }, 'an unchanged session gets the paid view back after the check');

    // The session is revoked on the server while the page is frozen, and no
    // page of ours hears of it: the restored page still never shows the viewer.
    await watchRestore(reader);
    await follow(reader, '/classes/');
    await reader.waitForSelector('ol.arena-classes-board', { timeout: 15000 });
    gateway.sessions.delete('reader');
    await back(reader);
    const revoked = await restoredState(reader, 3);
    assert.equal(revoked.marker, true);
    for (const [moment, shown] of [['event', revoked.restored.event], ['frame', revoked.restored.frame],
      ...revoked.restored.later.map((shown, index) => [`check ${index}`, shown])]) {
      assert.deepEqual(shown, HIDDEN, `revoked while frozen, ${moment}: the viewer and the paid view stay hidden`);
    }
    await reader.waitForSelector('.arena-paywall .arena-paywall__dialog', { timeout: 15000 });
    gateway.sessions.add('reader');

    // The session answers at once but the subscription late, or never: the
    // restored page shows the account only together with its subscription.
    for (const subscriptionDelay of [2500, 'hang']) {
      await reader.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'load' });
      await reader.waitForSelector('.bg-tier-list-page', { timeout: 15000 });
      await watchRestore(reader);
      await follow(reader, '/classes/');
      await reader.waitForSelector('ol.arena-classes-board', { timeout: 15000 });
      gateway.subscriptionDelay = subscriptionDelay;
      await back(reader);
      const partial = await restoredState(reader, 2);
      for (const [moment, shown] of [['event', partial.restored.event], ['frame', partial.restored.frame],
        ['300 ms', partial.restored.later[0]], ['1 s', partial.restored.later[1]]]) {
        assert.deepEqual(shown, HIDDEN, `subscription ${subscriptionDelay}, ${moment}: no account before its subscription`);
      }
      if (subscriptionDelay === 'hang') {
        await reader.waitForSelector('.arena-access-unavailable', { timeout: 20000 });
        assert.equal(await reader.evaluate(() => document.body.textContent.includes('Читатель Кэша')), false,
          'a subscription that never answers leaves the restored page without the account');
      } else {
        await reader.waitForSelector('.bg-tier-list-page', { timeout: 15000 });
      }
      gateway.subscriptionDelay = 0;
    }

    // A page frozen as a guest; meanwhile the visitor signs in elsewhere. Back
    // shows the account only together with its subscription, or not at all.
    for (const subscriptionDelay of [2500, 'error']) {
      const context = await browser.createBrowserContext();
      const guestPage = await context.newPage();
      await guestPage.setViewport({ width: 1440, height: 900 });
      await guestPage.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'load' });
      await guestPage.waitForSelector('.arena-paywall .arena-paywall__dialog', { timeout: 15000 });
      await watchRestore(guestPage);
      await follow(guestPage, '/classes/');
      await guestPage.setCookie({ name: 'bf_session', value: 'reader', url: gateway.origin });
      gateway.subscriptionDelay = subscriptionDelay;
      gateway.meDelay = 1200;
      await back(guestPage);
      const signedIn = await restoredState(guestPage, 2);
      assert.equal(signedIn.marker, true);
      for (const [moment, shown] of [['event', signedIn.restored.event], ['frame', signedIn.restored.frame],
        ['300 ms', signedIn.restored.later[0]], ['1 s', signedIn.restored.later[1]]]) {
        assert.equal(shown.reader, false, `guest page, subscription ${subscriptionDelay}, ${moment}: no account before its subscription`);
      }
      // The guest's old gate goes before the first frame: no lock while both answers are on their way.
      assert.deepEqual(await guestPage.evaluate(() => window.__restoredGates.filter(Boolean).length), 0,
        `guest page, subscription ${subscriptionDelay}: no lock frame after the restore`);
      gateway.meDelay = 0;
      if (subscriptionDelay === 'error') {
        await guestPage.waitForSelector('.arena-access-unavailable', { timeout: 20000 });
        assert.equal(await guestPage.evaluate(() => document.body.textContent.includes('Читатель Кэша')), false,
          'a failed subscription check leaves the restored page without the account');
        // «Повторить проверку» stays atomic: the account shows only with its subscription.
        // Still restored and unconfirmed: a retry that fails again, then one that is late but succeeds.
        for (const retry of ['error', 2500]) {
          gateway.subscriptionDelay = retry;
          await guestPage.evaluate(() => {
            window.__afterRetry = [];
            document.querySelector('.arena-access-unavailable button').click();
            for (const wait of [300, 1000, 2000]) {
              setTimeout(() => window.__afterRetry.push(document.body.textContent.includes('Читатель Кэша')), wait);
            }
          });
          await guestPage.waitForFunction(() => window.__afterRetry.length === 3, { timeout: 10000 });
          assert.deepEqual(await guestPage.evaluate(() => window.__afterRetry), [false, false, false],
            `retry with subscription ${retry}: no account before its subscription`);
          if (retry === 'error') {
            await guestPage.waitForSelector('.arena-access-unavailable', { timeout: 20000 });
            assert.equal(await guestPage.evaluate(() => document.body.textContent.includes('Читатель Кэша')), false);
          } else {
            await guestPage.waitForSelector('.bg-tier-list-page', { timeout: 15000 });
          }
        }
      } else {
        await guestPage.waitForSelector('.bg-tier-list-page', { timeout: 15000 });
      }
      gateway.subscriptionDelay = 0;
      await context.close();
    }
    await reader.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'load' });
    await reader.waitForSelector('.bg-tier-list-page', { timeout: 15000 });
    await watchRestore(reader);

    // The subscriber signs out on the account page, then goes Back.
    await watchRestore(reader);
    await follow(reader, '/?login');
    const logout = await reader.waitForSelector('.account-logout', { timeout: 15000 });
    await logout.evaluate(button => button.click());
    await reader.waitForFunction(() => !document.querySelector('.account-logout'));
    for (let attempt = 0; gateway.sessions.has('reader') && attempt < 50; attempt += 1) await delay(50);
    assert.equal(gateway.sessions.has('reader'), false, 'the account page must end the session');
    await back(reader);
    const signedOut = await restoredState(reader);
    assert.equal(signedOut.marker, true, 'the paid page must come back from the back/forward cache');
    assert.deepEqual({ event: signedOut.restored.event, frame: signedOut.restored.frame }, { event: HIDDEN, frame: HIDDEN },
      'a page restored after sign-out must hide the paid view and the signed-in header before its first frame');
    await reader.waitForSelector('.arena-paywall .arena-paywall__dialog', { timeout: 10000 });
    assert.equal(await reader.$('.bg-tier-list-page'), null);
    assert.equal(await reader.$('.arena-sidebar-profile-avatar'), null);
    assert.deepEqual(pageErrors, []);
    await reader.close();

    // The same on /classes/: its statistics leave in the render that hides the viewer.
    gateway.sessions.add('reader');
    const classes = await openReader(browser, gateway.origin, 'reader', '/classes/', 'ol.arena-classes-board');
    await follow(classes.page, '/?login');
    const classesLogout = await classes.page.waitForSelector('.account-logout', { timeout: 15000 });
    await classesLogout.evaluate(button => button.click());
    for (let attempt = 0; gateway.sessions.has('reader') && attempt < 50; attempt += 1) await delay(50);
    await back(classes.page);
    const classesState = await restoredState(classes.page);
    assert.equal(classesState.marker, true);
    assert.deepEqual({ event: classesState.restored.event, frame: classesState.restored.frame }, { event: HIDDEN, frame: HIDDEN },
      'restored /classes/ must drop the class statistics before its first frame');
    assert.deepEqual(classes.pageErrors, []);
    await classes.page.close();
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    await closeLocal(express);
  }
});

// The session can end without a sign-out on our pages (expiry, revocation on
// another device) and another account can sign in through a redirect. The
// page that observed those answers recorded them, so the restored page of the
// first account hides before its first frame, also when the browser is
// offline and the re-check cannot reach the server.
test('a page restored after an account switch or offline never shows the previous viewer', async () => {
  const express = http.createServer((request, response) => response.writeHead(401).end());
  let next; let gateway; let browser;
  try {
    next = await startNextServer({ legacyOrigin: await listenLocal(express) });
    gateway = await startGateway(next.origin);
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    for (const offline of [false, true]) {
      gateway.sessions.add('reader');
      const context = await browser.createBrowserContext();
      const { page, pageErrors } = await openReader(context, gateway.origin, 'reader');
      gateway.sessions.delete('reader');
      await follow(page, '/?login');
      await page.waitForFunction(() => localStorage.getItem('hs_arena_auth_cookie_hint') === null);
      await page.setCookie({ name: 'bf_session', value: 'other', url: gateway.origin });
      await follow(page, '/?login&telegram=ok');
      await page.waitForFunction(() => document.body.textContent.includes('Другой Посетитель'));
      if (offline) await page.setOfflineMode(true);
      await back(page, 2);
      const state = await restoredState(page, 4);
      assert.equal(state.marker, true, 'the first account\'s page must come back from the back/forward cache');
      for (const [moment, shown] of [['event', state.restored.event], ['frame', state.restored.frame],
        ...state.restored.later.map((shown, index) => [`check ${index}`, shown])]) {
        assert.equal(shown.paid, false, `offline=${offline} ${moment}: the previous viewer's paid view must stay hidden`);
        assert.equal(shown.reader, false, `offline=${offline} ${moment}: the previous viewer's name must stay hidden`);
      }
      if (!offline) {
        await page.waitForSelector('.arena-paywall .arena-paywall__dialog', { timeout: 10000 });
        assert.ok(await page.evaluate(() => document.body.textContent.includes('Другой Посетитель')));
      }
      assert.deepEqual(pageErrors, []);
      await context.close();
    }

    // Offline, a restored page cannot confirm even an unchanged viewer: it hides after the failed re-check.
    gateway.sessions.add('reader');
    const context = await browser.createBrowserContext();
    const { page } = await openReader(context, gateway.origin, 'reader');
    await follow(page, '/classes/');
    await page.setOfflineMode(true);
    await back(page);
    const offlineState = await restoredState(page, 3);
    assert.equal(offlineState.marker, true);
    assert.deepEqual(offlineState.restored.event, HIDDEN, 'a restored page hides its viewer until the server confirms it');
    assert.equal(offlineState.restored.later[2].paid, false, 'an unconfirmed restored page must not keep the paid view');
    await context.close();
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    await closeLocal(express);
  }
});

test('client routes revalidate shared access after revocation and account changes', async () => {
  const legacy = http.createServer((_request, response) => response.writeHead(401).end());
  let next, gateway, browser;
  try {
    next = await startNextServer({ legacyOrigin: await listenLocal(legacy) });
    gateway = await startGateway(next.origin);
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const { page, pageErrors } = await openReader(browser, gateway.origin, 'reader');
    await page.evaluate(() => { window.__sharedMenu = document.querySelector('.arena-sidebar'); });
    await page.click('.arena-sidebar a[href="/classes/"]');
    await page.waitForSelector('ol.arena-classes-board');
    assert.equal(await page.evaluate(() => window.__sharedMenu === document.querySelector('.arena-sidebar')), true);
    gateway.sessions.delete('reader');
    await page.click('.arena-sidebar a[href="/tierlist/"]');
    await page.waitForFunction(() => location.pathname === '/tierlist/' && !document.body.textContent.includes('Читатель Кэша'));
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => location.pathname === '/classes/');
    assert.equal(await page.$('ol.arena-classes-board'), null, 'revoked access must not reappear on client Back');
    await page.setCookie({ name: 'bf_session', value: 'other', url: gateway.origin });
    await page.click('.arena-sidebar a[href="/battlegrounds/tier-list/"]');
    await page.waitForFunction(() => location.pathname === '/battlegrounds/tier-list/' && document.body.textContent.includes('Другой Посетитель'));
    assert.equal(await page.$('.bg-tier-list-page'), null, 'the new account has no paid grants');
    assert.equal(await page.evaluate(() => window.__sharedMenu === document.querySelector('.arena-sidebar')), true);
    assert.deepEqual(pageErrors, []);
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    await closeLocal(legacy);
  }
});
