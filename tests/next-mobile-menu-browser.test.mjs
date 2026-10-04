import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

// The support pages and the guest tier list need no data; every `/api/` call
// (the shell's session check) answers "signed out", uncacheable as in
// production.
function signedOut(response) {
  response.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' })
    .end('{"error":"Unavailable"}');
}

async function startGateway(nextOrigin) {
  const next = new URL(nextOrigin);
  const server = http.createServer((request, response) => {
    if (request.url.startsWith('/api/')) { signedOut(response); return; }
    const upstream = http.request(next, { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  return { server, origin: await listenLocal(server) };
}

async function phonePage(browser, { javaScript = true } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  if (!javaScript) await page.setJavaScriptEnabled(false);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  return { page, pageErrors };
}

const drawerState = page => page.evaluate(() => {
  const menu = document.querySelector('#arena-mobile-menu');
  const backdrop = document.querySelector('.arena-mobile-drawer-backdrop');
  return {
    open: Boolean(menu?.matches(':popover-open')),
    shown: Boolean(menu) && getComputedStyle(menu).display !== 'none' && menu.getBoundingClientRect().height > 0,
    backdrop: Boolean(backdrop) && getComputedStyle(backdrop).display !== 'none',
    expanded: document.querySelector('.arena-mobile-nav-toggle')?.getAttribute('aria-expanded'),
    locked: document.body.style.position,
  };
});

async function waitForDrawer(page, expected) {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const state = await drawerState(page);
    if (Object.entries(expected).every(([key, value]) => state[key] === value)) return state;
    assert.ok(Date.now() < deadline, `drawer state ${JSON.stringify(state)} never matched ${JSON.stringify(expected)}`);
    await delay(25);
  }
}

test('the mobile drawer opens before hydration, animates both ways and closes as a page leaves', async () => {
  const express = http.createServer((request, response) => signedOut(response));
  let next;
  let gateway;
  let browser;
  try {
    next = await startNextServer({ legacyOrigin: await listenLocal(express) });
    gateway = await startGateway(next.origin);
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox', '--disable-features=BackForwardCache'] });

    // Before (here: without) JavaScript the toggle opens the drawer natively,
    // and its links are plain anchors to canonical URLs.
    const plain = await phonePage(browser, { javaScript: false });
    await plain.page.goto(`${gateway.origin}/privacy/`, { waitUntil: 'networkidle2' });
    assert.deepEqual(await drawerState(plain.page), { open: false, shown: false, backdrop: false, expanded: 'false', locked: '' });
    await plain.page.click('.arena-mobile-nav-toggle');
    await waitForDrawer(plain.page, { open: true, shown: true, backdrop: true });
    await plain.page.click('#arena-mobile-menu a[href="/tierlist/"]');
    await plain.page.waitForFunction(() => location.pathname === '/tierlist/', { timeout: 10_000 });

    const { page, pageErrors } = await phonePage(browser);
    await page.goto(`${gateway.origin}/faq/`, { waitUntil: 'networkidle2' });
    await page.evaluate(() => document.querySelector('script[type="speculationrules"]').remove());

    // After hydration React owns the state: open drops in, close lifts out
    // (still on screen for the exit, then gone), Escape returns focus. Sampled
    // in the page two frames after each change, so a slow runner cannot miss
    // the short transitions.
    const sampleAfter = change => page.evaluate(async action => {
      const menu = document.querySelector('#arena-mobile-menu');
      if (action === 'open') document.querySelector('.arena-mobile-nav-toggle').click();
      else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { open: menu.matches(':popover-open'), display: getComputedStyle(menu).display,
        fading: document.getAnimations().some(animation => animation.effect?.target === menu && animation.transitionProperty === 'opacity') };
    }, change);
    assert.deepEqual(await sampleAfter('open'), { open: true, display: 'grid', fading: true }, 'the drawer drops in');
    await waitForDrawer(page, { open: true, shown: true, backdrop: true, expanded: 'true', locked: 'fixed' });
    assert.deepEqual(await sampleAfter('close'), { open: false, display: 'grid', fading: true }, 'the drawer lifts out before it goes');
    await waitForDrawer(page, { shown: false, backdrop: false, expanded: 'false', locked: '' });
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('arena-mobile-nav-toggle')), true);

    // A drawer the browser opened itself (the toggle before hydration) is
    // adopted: the page locks behind it, and a tap outside it (here on the
    // empty middle of the top bar) lets the browser close it again.
    await page.evaluate(() => document.querySelector('#arena-mobile-menu').showPopover());
    await waitForDrawer(page, { open: true, expanded: 'true', locked: 'fixed' });
    const outside = await page.evaluate(() => {
      const brand = document.querySelector('.arena-mobile-brand').getBoundingClientRect();
      const toggle = document.querySelector('.arena-mobile-nav-toggle').getBoundingClientRect();
      return { x: (brand.right + toggle.left) / 2, y: toggle.top + toggle.height / 2 };
    });
    await page.mouse.click(outside.x, outside.y);
    await waitForDrawer(page, { open: false, shown: false, expanded: 'false', locked: '' });

    // A page restored from the back/forward cache never comes back with the
    // drawer open and the page locked.
    await page.click('.arena-mobile-nav-toggle');
    await waitForDrawer(page, { open: true, locked: 'fixed' });
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await waitForDrawer(page, { open: false, shown: false, locked: '' });

    // Leaving through a drawer link releases the lock first, so Back returns
    // to the reading position instead of the top. The back/forward cache is
    // off in this browser (tests/next-bfcache-browser.test.mjs covers a
    // restore), so Back reloads the page and only the scroll position stored
    // with the history entry can bring the reader back.
    await page.goto(`${gateway.origin}/classes/`, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      document.querySelector('script[type="speculationrules"]').remove();
      scrollTo(0, 600);
    });
    await page.click('.arena-mobile-nav-toggle');
    await waitForDrawer(page, { open: true, shown: true, locked: 'fixed' });
    await page.evaluate(() => addEventListener('pagehide', () => sessionStorage.setItem('left-at',
      JSON.stringify({ y: scrollY, locked: document.body.style.position }))));
    await page.click('#arena-mobile-menu a[href="/tierlist/"]');
    await page.waitForFunction(() => location.pathname === '/tierlist/' && document.readyState === 'complete', { timeout: 10_000 });
    assert.deepEqual(JSON.parse(await page.evaluate(() => sessionStorage.getItem('left-at'))), { y: 600, locked: '' });
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => location.pathname === '/classes/' && document.readyState === 'complete' && scrollY > 0,
      { timeout: 10_000 }).catch(() => {});
    assert.deepEqual(await page.evaluate(() => ({ y: Math.round(scrollY),
      type: performance.getEntriesByType('navigation')[0].type })), { y: 600, type: 'back_forward' },
    'Back reloads the page at the reading position');
    assert.deepEqual(pageErrors, []);
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    await closeLocal(express);
  }
});
