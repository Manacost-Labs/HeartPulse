import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

const READER = { id: 'bf-reader', email: 'reader@example.test', name: 'Читатель Кэша', role: 'user' };
const SUBSCRIBED = { hasAccess: true, entitlements: { battlegrounds: true }, source: 'boosty', checkedAt: null,
  stale: false, message: '', boosty: { checked: true, hasAccess: true }, patreon: {}, telegram: {} };

// Stands where nginx and Express do: pages go to Next.js, `/api/` is answered
// here with Express's `no-store` header. The session lives in `bf_session`
// until the account page signs out.
async function startGateway(nextOrigin) {
  const session = { active: true };
  const next = new URL(nextOrigin);
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://gateway');
    const signedIn = session.active && /(?:^|;\s*)bf_session=1/.test(request.headers.cookie ?? '');
    const json = (status, payload) => response.writeHead(status, { 'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store' }).end(JSON.stringify(payload));
    if (url.pathname === '/api/auth/me') return json(200, { user: signedIn ? READER : null });
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
      session.active = false;
      return json(200, { ok: true });
    }
    if (url.pathname === '/api/subscription/status') {
      return signedIn ? json(200, SUBSCRIBED) : json(401, { error: 'guest' });
    }
    if (url.pathname === '/api/bg/tier-lists') {
      return signedIn ? json(200, { list: url.searchParams.get('list'), count: 0, tiers: { S: [], A: [], B: [], C: [], D: [] } })
        : json(401, { error: 'guest' });
    }
    if (url.pathname.startsWith('/api/')) return json(401, { error: 'guest' });
    const upstream = http.request(next, { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  return { server, origin: await listenLocal(server), session };
}

// Navigates like a link the visitor follows (renderer-initiated, not prerendered).
async function follow(page, path) {
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.evaluate(href => { location.href = href; }, path)]);
}

async function back(page) {
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.goBack()]);
}

// What the restored document shows the moment it is back: inside `pageshow`
// (after the page's own listener) and on the first frame after it.
async function watchRestore(page) {
  await page.evaluate(() => {
    const snapshot = () => ({
      paid: Boolean(document.querySelector('.bg-tier-list-page')),
      viewer: Boolean(document.querySelector('.arena-sidebar-profile-avatar'))
        || document.body.textContent.includes('Читатель Кэша'),
    });
    window.__restoreMarker = true;
    window.__restored = null;
    if (window.__restoreWatched) return;
    window.__restoreWatched = true;
    addEventListener('pageshow', event => {
      if (!event.persisted) return;
      window.__restored = { event: snapshot() };
      requestAnimationFrame(() => { window.__restored.frame = snapshot(); });
    });
  });
}

async function restoredState(page) {
  await page.waitForFunction(() => window.__restored?.frame, { timeout: 5000 }).catch(() => null);
  return page.evaluate(() => ({ marker: window.__restoreMarker === true, restored: window.__restored ?? null }));
}

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

    // A subscriber's restored page keeps the paid view: nothing changed in between.
    const reader = await browser.newPage();
    await reader.setViewport({ width: 1440, height: 900 });
    const pageErrors = [];
    reader.on('pageerror', error => pageErrors.push(error.message));
    await reader.setCookie({ name: 'bf_session', value: '1', url: gateway.origin });
    await reader.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'load' });
    await reader.waitForSelector('.bg-tier-list-page', { timeout: 15000 });
    await reader.waitForSelector('.arena-sidebar-profile-avatar');
    await watchRestore(reader);
    await follow(reader, '/classes/');
    await back(reader);
    const kept = await restoredState(reader);
    assert.equal(kept.marker, true, 'the subscriber page must be restored');
    assert.deepEqual(kept.restored, { event: { paid: true, viewer: true }, frame: { paid: true, viewer: true } },
      'an unchanged session keeps the restored paid view');
    await delay(500);
    assert.ok(await reader.$('.bg-tier-list-page'), 'the quiet re-check keeps the paid view');

    // The subscriber signs out on the account page, then goes Back.
    await watchRestore(reader);
    await follow(reader, '/?login');
    const logout = await reader.waitForSelector('.account-logout', { timeout: 15000 });
    await logout.evaluate(button => button.click());
    await reader.waitForFunction(() => !document.querySelector('.account-logout'));
    for (let attempt = 0; gateway.session.active && attempt < 50; attempt += 1) await delay(50);
    assert.equal(gateway.session.active, false, 'the account page must end the session');
    await back(reader);
    const signedOut = await restoredState(reader);
    assert.equal(signedOut.marker, true, 'the paid page must come back from the back/forward cache');
    assert.deepEqual(signedOut.restored, { event: { paid: false, viewer: false }, frame: { paid: false, viewer: false } },
      'a page restored after sign-out must hide the paid view and the signed-in header before its first frame');
    await reader.waitForSelector('.arena-paywall .arena-paywall__dialog', { timeout: 10000 });
    assert.equal(await reader.$('.bg-tier-list-page'), null);
    assert.equal(await reader.$('.arena-sidebar-profile-avatar'), null);
    assert.deepEqual(pageErrors, []);
    await reader.close();
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    await closeLocal(express);
  }
});
