import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

async function startGateway(nextOrigin, { rscDelayMs = 0 } = {}) {
  const next = new URL(nextOrigin);
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push({ path: request.url, destination: request.headers['sec-fetch-dest'], rsc: request.headers.rsc });
    if (request.url.startsWith('/api/')) {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' });
      response.end(JSON.stringify({ user: null }));
      return;
    }
    const forward = () => {
      const upstream = http.request(next, { method: request.method, path: request.url, headers: request.headers },
        answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
      upstream.on('error', () => response.destroy());
      request.pipe(upstream);
    };
    if (request.headers.rsc && rscDelayMs) setTimeout(forward, rscDelayMs);
    else forward();
  });
  return { server, origin: await listenLocal(server), requests };
}

async function visitByClick(page, selector, pathname) {
  await page.click(selector);
  await page.waitForFunction(path => location.pathname === path && document.querySelector('#main-content'), {}, pathname);
}

/** Records the content box's view-transition animations from the next commit on. */
async function watchRouteMotion(page) {
  await page.evaluate(() => {
    window.__routeMotion = [];
    window.__otherMotion = [];
    const started = performance.now();
    const record = () => {
      for (const animation of document.getAnimations()) {
        const pseudo = animation.effect?.pseudoElement ?? '';
        if (pseudo.startsWith('::view-transition') && !pseudo.includes('route-content') && animation.playState === 'running'
          && !window.__otherMotion.includes(pseudo)) window.__otherMotion.push(pseudo);
        if (!pseudo.includes('route-content') || window.__routeMotion.some(entry => entry.pseudo === pseudo)) continue;
        const timing = animation.effect.getTiming();
        const frames = animation.effect.getKeyframes();
        window.__routeMotion.push({ pseudo, duration: timing.duration, delay: timing.delay,
          from: frames[0]?.opacity, to: frames.at(-1)?.opacity });
      }
      if (performance.now() - started < 3000) requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
}

const transitionRunning = () => document.getAnimations().some(animation => animation.playState === 'running'
  && animation.effect?.pseudoElement?.startsWith('::view-transition'));

async function routeMotion(page) {
  await page.waitForFunction(`!(${transitionRunning})()`);
  const { route, other } = await page.evaluate(() => ({
    route: window.__routeMotion.toSorted((a, b) => a.delay - b.delay), other: window.__otherMotion }));
  assert.deepEqual(other, [], 'only the content box may animate');
  return route;
}

async function rememberFrame(page) {
  await page.evaluate(() => {
    window.__navigationFrame = { sidebar: document.querySelector('.arena-sidebar'), topbar: document.querySelector('.arena-mobile-topbar') };
  });
}

async function assertSameFrame(page) {
  assert.equal(await page.evaluate(() => window.__navigationFrame?.sidebar === document.querySelector('.arena-sidebar')
    && window.__navigationFrame?.topbar === document.querySelector('.arena-mobile-topbar')), true, 'navigation DOM must persist');
}

async function assertGroupSwitchHasNoDelayedCollapse(page, root) {
  const result = await page.evaluate(async selector => {
    const nav = document.querySelector(selector);
    const buttons = [...nav.querySelectorAll('button[aria-controls]')];
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    buttons[0].click();
    await new Promise(resolve => setTimeout(resolve, 250));
    buttons[1].click();
    await frame();
    await frame();
    const closed = document.getElementById(buttons[0].getAttribute('aria-controls'));
    const height = closed.getBoundingClientRect().height;
    const firstY = buttons[1].getBoundingClientRect().y;
    await new Promise(resolve => setTimeout(resolve, 180));
    return { height, firstY, lastY: buttons[1].getBoundingClientRect().y };
  }, root);
  assert.equal(result.height, 0, 'the closed group must release layout with the newly opened group');
  assert.ok(Math.abs(result.firstY - result.lastY) < 0.5, 'group controls must not move again after the exit duration');
}

test('public navigation preserves the frame, sidebar state and native link behavior', { timeout: 60_000 }, async () => {
  const legacy = http.createServer((_request, response) => response.writeHead(401).end());
  let next, gateway, browser;
  try {
    next = await startNextServer({ legacyOrigin: await listenLocal(legacy) });
    gateway = await startGateway(next.origin);
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 700 });
    await page.goto(`${gateway.origin}/faq/`, { waitUntil: 'networkidle2' });
    assert.equal(await page.$eval('.arena-content', node => node.getAnimations().length), 0,
      'the first document paint must have no route entrance');
    await rememberFrame(page);
    await assertGroupSwitchHasNoDelayedCollapse(page, '.arena-sidebar');
    assert.equal(await page.$eval('#root', root => root.firstElementChild?.matches('.arena-skip-link')), true,
      'the persistent skip link remains the first root element');
    await page.evaluate(() => { document.querySelector('.arena-sidebar').scrollTop = 180; });
    await page.hover('.arena-sidebar a[href="/guides-archive/"]');
    const scroll = await page.$eval('.arena-sidebar', node => node.scrollTop);
    assert.ok(scroll > 0, 'fixture must exercise sidebar scroll');
    const documentCount = gateway.requests.filter(request => request.destination === 'document').length;
    const readingOffset = await page.evaluate(() => {
      scrollTo(0, Math.min(240, document.documentElement.scrollHeight - innerHeight));
      return scrollY;
    });
    assert.ok(readingOffset > 0, 'fixture must leave a scrolled page');
    await watchRouteMotion(page);
    await visitByClick(page, '.arena-sidebar a[href="/guides-archive/"]', '/guides-archive/');
    assert.deepEqual(await routeMotion(page), [
      { pseudo: '::view-transition-old(route-content)', duration: 90, delay: 0, from: '1', to: '0' },
      { pseudo: '::view-transition-new(route-content)', duration: 140, delay: 90, from: '0', to: '1' },
    ], 'the outgoing content clears, then the destination fades in; nothing else moves');
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--route-old-shift')), `${-readingOffset}px`,
      'the outgoing snapshot stays where the reader saw it');
    assert.equal(await page.evaluate(() => scrollY), 0, 'the destination opens at its top');
    await assertSameFrame(page);
    assert.equal(await page.$eval('.arena-sidebar', node => node.scrollTop), scroll);
    assert.equal(await page.$eval('.arena-sidebar button[aria-controls="arena-sidebar-misc"]', node => node.getAttribute('aria-expanded')), 'true');
    assert.equal(gateway.requests.filter(request => request.destination === 'document').length, documentCount);
    assert.ok(gateway.requests.some(request => request.rsc === '1' && request.path.startsWith('/guides-archive/')));
    assert.equal(await page.evaluate(() => document.querySelector('script[type="speculationrules"]') === null
      && !document.documentElement.hasAttribute('data-page-enter') && getComputedStyle(document.querySelector('.arena-content')).opacity === '1'), true);
    await watchRouteMotion(page);
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => location.pathname === '/faq/');
    assert.deepEqual(await routeMotion(page), [], 'Back restores the page without a transition');
    await assertSameFrame(page);
    await page.evaluate(() => history.forward());
    await page.waitForFunction(() => location.pathname === '/guides-archive/');
    await assertSameFrame(page);
    // A plain anchor from page content uses the same router; fragments remain native.
    await page.evaluate(() => {
      const invalid = document.createElement('a'); invalid.href = 'http://%';
      document.querySelector('.arena-content').append(invalid);
      invalid.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
      const link = document.createElement('a'); link.id = 'client-test-link'; link.href = '/faq?from=navigation'; link.textContent = 'Перейти';
      document.querySelector('.arena-content').prepend(link);
    });
    await visitByClick(page, '#client-test-link', '/faq/');
    assert.equal(await page.evaluate(() => location.search), '?from=navigation');
    await assertSameFrame(page);
    await page.evaluate(() => {
      const fragment = document.createElement('a'); fragment.id = 'native-fragment';
      fragment.href = `${location.pathname}${location.search}#main-content`; fragment.textContent = 'К содержимому';
      document.querySelector('.arena-content').prepend(fragment);
    });
    const beforeFragment = gateway.requests.length;
    await routeMotion(page); // the content box takes clicks once it has faded in
    await page.click('#native-fragment');
    assert.equal(await page.evaluate(() => location.hash), '#main-content');
    assert.equal(gateway.requests.slice(beforeFragment).some(request => request.rsc === '1'), false,
      'a fragment on the current canonical path/query must remain native');
    await assertSameFrame(page);
    const popupReady = browser.waitForTarget(target => target.type() === 'page' && target.url() === `${gateway.origin}/tierlist/`, { timeout: 10_000 });
    await page.keyboard.down('Control');
    await page.click('.arena-sidebar a[href="/tierlist/"]');
    await page.keyboard.up('Control');
    const popup = await (await popupReady).page();
    assert.ok(popup, 'Ctrl-click must create a new page');
    assert.equal(new URL(popup.url()).pathname, '/tierlist/', 'Ctrl-click opens the destination in another tab');
    assert.equal(await page.evaluate(() => location.pathname), '/faq/');
    await popup.close();
    await page.bringToFront();
    // The navigation stays usable while the content box is still fading in.
    await visitByClick(page, '.arena-sidebar a[href="/tierlist/"]', '/tierlist/');
    assert.equal(await page.evaluate(transitionRunning), true, 'fixture must click during the transition');
    await visitByClick(page, '.arena-sidebar a[href="/guides-archive/"]', '/guides-archive/');
    await routeMotion(page);
    await assertSameFrame(page);
    assert.deepEqual(errors, []);

    await page.setViewport({ width: 390, height: 844 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.click('.arena-mobile-nav-toggle');
    await page.waitForFunction(() => document.querySelector('#arena-mobile-menu').matches(':popover-open'));
    await assertGroupSwitchHasNoDelayedCollapse(page, '#arena-mobile-menu');
    await watchRouteMotion(page);
    await visitByClick(page, '#arena-mobile-menu a[href="/tierlist/"]', '/tierlist/');
    assert.deepEqual(await routeMotion(page), [], 'reduced motion skips the route animation on phones');
    await page.waitForFunction(() => !document.querySelector('#arena-mobile-menu').matches(':popover-open') && document.body.style.position !== 'fixed');
    await assertSameFrame(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    await closeLocal(legacy);
  }
});

test('public transitions avoid accidental prefetch and keep usable content while a slower route loads', { timeout: 60_000 }, async () => {
  const legacy = http.createServer((_request, response) => response.writeHead(401).end());
  let next, gateway, browser;
  try {
    next = await startNextServer({ legacyOrigin: await listenLocal(legacy) });
    gateway = await startGateway(next.origin, { rscDelayMs: 900 });
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 700 });
    await page.goto(`${gateway.origin}/faq/`, { waitUntil: 'networkidle2' });
    const link = '.arena-sidebar a[href="/guides-archive/"]';
    await page.click('.arena-sidebar button[aria-controls="arena-sidebar-misc"]');
    await page.waitForFunction(() => document.getElementById('arena-sidebar-misc').getAnimations().length === 0);
    await page.evaluate(() => { document.querySelector('.arena-sidebar').scrollTop = 180; });
    await page.hover(link);
    await page.mouse.move(800, 100);
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.equal(gateway.requests.filter(request => request.rsc && request.path.startsWith('/guides-archive/')).length, 0,
      'crossing a link must not download a route');
    const content = await page.$eval('#main-content', node => node.getBoundingClientRect().top);
    await rememberFrame(page);
    await page.click(link);
    await page.waitForSelector('[data-navigation-progress="pending"]', { timeout: 800 });
    assert.equal(await page.evaluate(() => location.pathname), '/faq/', 'previous route remains usable until ready');
    assert.equal(await page.$eval('#main-content', node => node.getBoundingClientRect().top), content);
    assert.equal(await page.$eval('[data-navigation-progress]', node => node.textContent), 'Открываем страницу…');
    await assertSameFrame(page);
    await page.waitForFunction(() => location.pathname === '/guides-archive/' && !document.querySelector('[data-navigation-progress="pending"]'));
    await page.goBack();
    await page.waitForFunction(() => location.pathname === '/faq/');
    await page.evaluate(() => Object.defineProperty(navigator, 'connection', {
      configurable: true, value: { get saveData() { return true; }, get effectiveType() { return '4g'; } },
    }));
    const other = '.arena-sidebar a[href="/contests/"]';
    await page.hover(other);
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.equal(gateway.requests.filter(request => request.rsc && request.path.startsWith('/contests/')).length, 0,
      'Save-Data suppresses speculation, including prototype-style connection getters');
    await page.click(other);
    await page.waitForSelector('[data-navigation-progress="pending"]', { timeout: 800 });
    await page.click(link);
    await page.waitForFunction(() => location.pathname === '/guides-archive/' && !document.querySelector('[data-navigation-progress="pending"]'));
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal(await page.evaluate(() => location.pathname), '/guides-archive/', 'a slow earlier route cannot replace the newer destination');
    await page.click('.arena-sidebar a[href="/articles/"]');
    await page.waitForSelector('[data-navigation-progress="pending"]', { timeout: 800 });
    await page.goBack();
    await page.waitForFunction(() => location.pathname === '/faq/' && !document.querySelector('[data-navigation-progress="pending"]'));
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal(await page.evaluate(() => location.pathname), '/faq/', 'Back supersedes a pending destination');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    await closeLocal(legacy);
  }
});

test('hover prepares a complete dynamic page before click, including its route code', { timeout: 60_000 }, async () => {
  const legacy = http.createServer((_request, response) => response.writeHead(401).end());
  let next, gateway, browser;
  try {
    next = await startNextServer({ legacyOrigin: await listenLocal(legacy) });
    gateway = await startGateway(next.origin, { rscDelayMs: 450 });
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${gateway.origin}/faq/`, { waitUntil: 'networkidle2' });
    await page.click('.arena-sidebar button[aria-controls="arena-sidebar-misc"]');
    await page.$eval('.arena-sidebar', node => { node.scrollTop = 180; });
    const link = '.arena-sidebar a[href="/guides-archive/"]';
    await page.hover(link);
    await page.waitForNetworkIdle({ idleTime: 250 });
    assert.ok(gateway.requests.some(request => request.rsc && request.path.startsWith('/guides-archive/')),
      'genuine hover must prepare the dynamic route');
    const beforeClick = gateway.requests.length;
    await visitByClick(page, link, '/guides-archive/');
    assert.equal(gateway.requests.slice(beforeClick).filter(request => request.rsc).length, 0,
      'a prepared dynamic page must not need a new route request after click');
    assert.ok(await page.$('#main-content'), 'the prepared content must render');
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    await closeLocal(legacy);
  }
});
