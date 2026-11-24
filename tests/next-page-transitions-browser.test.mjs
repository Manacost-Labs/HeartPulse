import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

async function startGateway(nextOrigin, { rscDelayMs = 0 } = {}) {
  const next = new URL(nextOrigin);
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push({ path: request.url, destination: request.headers['sec-fetch-dest'], rsc: request.headers.rsc,
      prefetch: request.headers['next-router-prefetch'], segment: request.headers['next-router-segment-prefetch'] });
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

async function assertMenuDidNotPrefetchAtIdle(page, gateway) {
  const paths = await page.$$eval('.arena-sidebar a[href], #arena-mobile-menu a[href]', links =>
    links.map(link => link.pathname));
  assert.ok(paths.includes('/gallery/'), 'the menu routes must be rendered for this check');
  await page.evaluate(() => new Promise(resolve => requestIdleCallback(() => requestAnimationFrame(resolve))));
  await page.waitForNetworkIdle({ idleTime: 300 });
  const speculative = gateway.requests.filter(request => request.rsc && (request.prefetch || request.segment)
    && paths.includes(new URL(request.path, gateway.origin).pathname));
  assert.deepEqual(speculative.map(request => request.path), [], 'an untouched menu must not fetch its routes');
}

/** Records the entrance animations inside the content box from the next commit on. */
async function watchRouteMotion(page) {
  await page.evaluate(() => {
    window.__routeMotion = [];
    window.__otherMotion = [];
    const seen = new Set();
    const started = performance.now();
    const record = () => {
      for (const animation of document.getAnimations()) {
        if (seen.has(animation)) continue;
        seen.add(animation);
        const target = animation.effect?.target;
        const pseudo = animation.effect?.pseudoElement ?? '';
        if (pseudo.startsWith('::view-transition')) window.__otherMotion.push(pseudo);
        if (!target?.closest?.('[data-route-content]')) continue;
        const timing = animation.effect.getTiming();
        const frames = animation.effect.getKeyframes();
        // An entrance moves (a page keeps full opacity: a fade from 0 blinks) or settles from a dip.
        const moves = frames[0]?.transform && frames[0].transform !== 'none';
        if (!(Number(frames[0]?.opacity ?? 1) < 1) && !moves) continue;
        window.__routeMotion.push({ target: target.matches('[data-route-content] > *') ? 'content' : 'section',
          skeleton: Boolean(target.closest('.loading-block, [data-loading-surface]') || target.querySelector('.loading-block')),
          duration: timing.duration, delay: timing.delay, from: frames[0]?.opacity, to: frames.at(-1)?.opacity,
          ...(frames[0]?.transform && frames[0].transform !== 'none' ? { transform: frames[0].transform } : {}) });
      }
      if (performance.now() - started < 3000) requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
}

const transitionRunning = () => document.getAnimations().some(animation => animation.playState === 'running'
  && animation.effect?.target?.closest?.('[data-route-content]')
  && (Number(animation.effect.getKeyframes()[0]?.opacity ?? 1) < 1 || /translate|scale/.test(animation.effect.getKeyframes()[0]?.transform ?? '')));

async function routeMotion(page) {
  await page.waitForFunction(`!(${transitionRunning})()`);
  const { route, other } = await page.evaluate(() => ({ route: window.__routeMotion, other: window.__otherMotion }));
  assert.deepEqual(other, [], 'no view transition captures the page');
  // One entrance per element: duplicates of the same timing collapse.
  return [...new Map(route.map(entry => [JSON.stringify(entry), entry])).values()];
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

/** Makes the menu list the mode holding a link, as a reader does: open the mode switch and choose the mode's banner. */
async function openModeFor(page, linkSelector) {
  const mode = await page.evaluate(selector => {
    const link = document.querySelector(selector);
    return link && link.getClientRects().length === 0 ? link.closest('.hp-nav-list')?.dataset.for ?? null : null;
  }, linkSelector);
  if (!mode) return;
  const root = linkSelector.startsWith('#arena-mobile-menu') ? '#arena-mobile-menu' : '.arena-sidebar';
  await page.click(`${root} details.hp-mode > summary`);
  // The banners rise in one after another; press once the chosen one has settled.
  await page.waitForFunction(selector => {
    const card = document.querySelector(selector);
    return card?.checkVisibility() && !card.getAnimations({ subtree: true }).length && getComputedStyle(card).opacity === '1';
  }, {}, `${root} [data-mode-card][data-mode="${mode}"]`);
  const destination = await page.$eval(`${root} [data-mode-card][data-mode="${mode}"]`, card => new URL(card.href).pathname);
  await page.click(`${root} [data-mode-card][data-mode="${mode}"]`);
  await page.waitForFunction(path => location.pathname === path && !document.querySelector('[data-navigation-progress="pending"]'), { timeout: 15_000 }, destination);
  if (root === '#arena-mobile-menu' && !(await page.$eval(root, node => node.matches(':popover-open')))) {
    await page.click('button[aria-controls="arena-mobile-menu"]');
    await page.waitForFunction(selector => document.querySelector(selector)?.matches(':popover-open'), {}, root);
  }
  await page.waitForFunction(selector => document.querySelector(selector)?.getClientRects().length > 0, { timeout: 15_000 }, linkSelector);
}

/** The mode switch as a reader uses it: opens on a click, shows the five banners with the current one marked, and closes on Escape (focus back on its button) or a press elsewhere. */
async function assertModePanelBehavior(page, root) {
  const state = () => page.evaluate(selector => {
    const panel = document.querySelector(`${selector} details.hp-mode`);
    const cards = [...panel.querySelectorAll('[data-mode-card]')];
    return {
      open: panel.open,
      visibleCards: cards.filter(card => card.checkVisibility()).length,
      current: cards.filter(card => card.checkVisibility() && card.getAttribute('aria-current') === 'true' && getComputedStyle(card.querySelector('.hp-mode-badge')).display !== 'none').length,
      focusOnButton: document.activeElement === panel.querySelector('summary'),
    };
  }, root);
  const button = `${root} details.hp-mode > summary`;
  // An opened drawer puts focus on its first control, which is the mode switch; the sidebar leaves it where it was.
  assert.deepEqual(await state(), { open: false, visibleCards: 0, current: 0, focusOnButton: root === '#arena-mobile-menu' }, 'the banners start closed');
  await page.click(button);
  await page.waitForFunction(selector => document.querySelectorAll(`${selector} [data-mode-card]`).length === 5
    && [...document.querySelectorAll(`${selector} [data-mode-card]`)].every(card => card.checkVisibility()), {}, root);
  assert.deepEqual(await state(), { open: true, visibleCards: 5, current: 1, focusOnButton: true }, 'a click opens five banners, one marked «Текущий»');
  await page.keyboard.press('Escape');
  await page.waitForFunction(selector => !document.querySelector(`${selector} details.hp-mode`).open
    && [...document.querySelectorAll(`${selector} [data-mode-card]`)].every(card => !card.checkVisibility()), {}, root);
  assert.deepEqual(await state(), { open: false, visibleCards: 0, current: 0, focusOnButton: true }, 'Escape closes the banners and returns focus to the button');
  assert.equal(await page.evaluate(() => document.querySelector('#arena-mobile-menu')?.matches(':popover-open') ?? false), root === '#arena-mobile-menu',
    'the first Escape closes only the banners, not the drawer');
  await page.click(button);
  // A press on empty ground: beside the sidebar on a desktop, the drawer's own floor on a phone.
  await (root === '#arena-mobile-menu' ? page.mouse.click(200, 830) : page.mouse.click(1000, 5));
  await page.waitForFunction(selector => !document.querySelector(`${selector} details.hp-mode`).open, {}, root);
}

/** A reader who last used another mode: the menu of a page without a mode lists it. */
async function rememberMode(page, mode) {
  await page.evaluateOnNewDocument(value => { try { localStorage.setItem('hp:nav:mode', value); } catch { /* storage is optional */ } }, mode);
}

test('public navigation preserves the frame, sidebar state and native link behavior', { timeout: 60_000 }, async () => {
  const legacy = http.createServer((_request, response) => response.writeHead(401).end());
  let next, gateway, browser;
  try {
    next = await startNextServer({ legacyOrigin: await listenLocal(legacy) });
    gateway = await startGateway(next.origin);
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 700 });
    await rememberMode(page, 'community');
    await page.goto(`${gateway.origin}/faq/`, { waitUntil: 'networkidle2' });
    assert.equal(await page.$eval('.arena-content', node => node.getAnimations().length), 0,
      'the first document paint must have no route entrance');
    await rememberFrame(page);
    await assertModePanelBehavior(page, '.arena-sidebar');
    assert.equal(await page.$eval('#root', root => root.firstElementChild?.matches('.arena-skip-link')), true,
      'the persistent skip link remains the first root element');
    await page.evaluate(() => { document.querySelector('.arena-sidebar .hp-nav-scroll').scrollTop = 180; });
    await page.hover('.arena-sidebar .hp-nav-list a[href="/contests/"]');
    const scroll = await page.$eval('.arena-sidebar .hp-nav-scroll', node => node.scrollTop);
    assert.ok(scroll > 0, 'fixture must exercise sidebar scroll');
    const documentCount = gateway.requests.filter(request => request.destination === 'document').length;
    const readingOffset = await page.evaluate(() => {
      scrollTo(0, Math.min(240, document.documentElement.scrollHeight - innerHeight));
      return scrollY;
    });
    assert.ok(readingOffset > 0, 'fixture must leave a scrolled page');
    await watchRouteMotion(page);
    await visitByClick(page, '.arena-sidebar .hp-nav-list a[href="/contests/"]', '/contests/');
    assert.deepEqual(await routeMotion(page), [
      { target: 'content', skeleton: false, duration: 220, delay: 0, from: '1', to: '1', transform: 'translateY(16px)' },
    ], 'the ready destination rises in once (ValyroUI rise) at full opacity, at commit, over --motion-base; nothing else moves');
    assert.equal(await page.evaluate(() => scrollY), 0, 'the destination opens at its top');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'main-content', 'focus continues at the new page');
    await assertSameFrame(page);
    assert.equal(await page.$eval('.arena-sidebar .hp-nav-scroll', node => node.scrollTop), scroll);
    assert.equal(await page.$eval('.arena-sidebar .hp-nav-list a[href="/contests/"]', node => node.getAttribute('aria-current')), 'page', 'the current page stays marked in the same list');
    assert.equal(gateway.requests.filter(request => request.destination === 'document').length, documentCount);
    assert.ok(gateway.requests.some(request => request.rsc === '1' && request.path.startsWith('/contests/')));
    assert.equal(await page.evaluate(() => document.querySelector('script[type="speculationrules"]') === null
      && !document.documentElement.hasAttribute('data-page-enter') && getComputedStyle(document.querySelector('.arena-content')).opacity === '1'), true);
    await watchRouteMotion(page);
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => location.pathname === '/faq/');
    assert.deepEqual(await routeMotion(page), [], 'Back restores the page without a transition');
    await assertSameFrame(page);
    await page.evaluate(() => history.forward());
    await page.waitForFunction(() => location.pathname === '/contests/');
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
    const popupReady = browser.waitForTarget(target => target.type() === 'page' && target.url() === `${gateway.origin}/gallery/`, { timeout: 10_000 });
    await page.keyboard.down('Control');
    await page.click('.arena-sidebar .hp-nav-list a[href="/gallery/"]');
    await page.keyboard.up('Control');
    const popup = await (await popupReady).page();
    assert.ok(popup, 'Ctrl-click must create a new page');
    assert.equal(new URL(popup.url()).pathname, '/gallery/', 'Ctrl-click opens the destination in another tab');
    assert.equal(await page.evaluate(() => location.pathname), '/faq/');
    await popup.close();
    await page.bringToFront();
    // The navigation stays usable while the content box is still fading in.
    await visitByClick(page, '.arena-sidebar .hp-nav-list a[href="/gallery/"]', '/gallery/');
    assert.equal(await page.evaluate(transitionRunning), true, 'fixture must click during the transition');
    await visitByClick(page, '.arena-sidebar .hp-nav-list a[href="/guides-archive/"]', '/guides-archive/');
    await routeMotion(page);
    await assertSameFrame(page);
    assert.deepEqual(errors, []);

    await page.setViewport({ width: 390, height: 844 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.click('.arena-mobile-nav-toggle');
    await page.waitForFunction(() => document.querySelector('#arena-mobile-menu').matches(':popover-open'));
    await assertModePanelBehavior(page, '#arena-mobile-menu');
    await watchRouteMotion(page);
    await openModeFor(page, '#arena-mobile-menu .hp-nav-list a[href="/tierlist/"]');
    await visitByClick(page, '#arena-mobile-menu .hp-nav-list a[href="/tierlist/"]', '/tierlist/');
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
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 700 });
    await rememberMode(page, 'community');
    await page.goto(`${gateway.origin}/faq/`, { waitUntil: 'networkidle2' });
    await assertMenuDidNotPrefetchAtIdle(page, gateway);
    const link = '.arena-sidebar .hp-nav-list a[href="/gallery/"]';
    await page.evaluate(() => { document.querySelector('.arena-sidebar .hp-nav-scroll').scrollTop = 180; });
    await page.hover(link);
    await page.mouse.move(800, 100);
    await new Promise(resolve => setTimeout(resolve, 180));
    const pageRequests = path => gateway.requests.filter(request => request.rsc && !request.prefetch && request.path.startsWith(path));
    assert.equal(pageRequests('/gallery/').length, 0, 'crossing a link must not download a page');
    const content = await page.$eval('#main-content', node => node.getBoundingClientRect().top);
    await rememberFrame(page);
    await page.click(link);
    await page.waitForSelector('[data-navigation-progress="pending"]', { timeout: 800 });
    assert.equal(await page.evaluate(() => location.pathname), '/faq/', 'previous route remains usable until ready');
    assert.equal(await page.$eval('#main-content', node => node.getBoundingClientRect().top), content);
    assert.equal(await page.$eval('[data-navigation-progress]', node => node.textContent), 'Открываем страницу…');
    await assertSameFrame(page);
    await page.waitForFunction(() => location.pathname === '/gallery/' && !document.querySelector('[data-navigation-progress="pending"]'));
    await page.goBack();
    await page.waitForFunction(() => location.pathname === '/faq/');
    await page.evaluate(() => Object.defineProperty(navigator, 'connection', {
      configurable: true, value: { get saveData() { return true; }, get effectiveType() { return '4g'; } },
    }));
    const other = '.arena-sidebar .hp-nav-list a[href="/contests/"]';
    await page.hover(other);
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.equal(pageRequests('/contests/').length, 0,
      'Save-Data suppresses speculation, including prototype-style connection getters');
    await page.click(other);
    await page.waitForSelector('[data-navigation-progress="pending"]', { timeout: 800 });
    await page.click(link);
    await page.waitForFunction(() => location.pathname === '/gallery/' && !document.querySelector('[data-navigation-progress="pending"]'));
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal(await page.evaluate(() => location.pathname), '/gallery/', 'a slow earlier route cannot replace the newer destination');
    // A dynamic page: /articles/ is prerendered and opens without a pending route.
    await page.click('.arena-sidebar .hp-nav-list a[href="/streamers/"]');
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

test('the mobile drawer waits for intent and the tapped route opens', { timeout: 45_000 }, async () => {
  const legacy = http.createServer((_request, response) => response.writeHead(401).end());
  let next, gateway, browser;
  try {
    next = await startNextServer({ legacyOrigin: await listenLocal(legacy) });
    gateway = await startGateway(next.origin);
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await rememberMode(page, 'community');
    await page.goto(`${gateway.origin}/faq/`, { waitUntil: 'networkidle2' });
    await assertMenuDidNotPrefetchAtIdle(page, gateway);
    await page.tap('.arena-mobile-nav-toggle');
    await page.waitForFunction(() => document.querySelector('#arena-mobile-menu').matches(':popover-open'));
    await assertMenuDidNotPrefetchAtIdle(page, gateway);
    await page.tap('#arena-mobile-menu .hp-nav-list a[href="/gallery/"]');
    await page.waitForFunction(() => location.pathname === '/gallery/' && !document.querySelector('#arena-mobile-menu').matches(':popover-open'));
    assert.ok(await page.$('#main-content'));
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
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await rememberMode(page, 'community');
    await page.goto(`${gateway.origin}/faq/`, { waitUntil: 'networkidle2' });
    await page.$eval('.arena-sidebar .hp-nav-scroll', node => { node.scrollTop = 180; });
    const link = '.arena-sidebar .hp-nav-list a[href="/gallery/"]';
    const pageRequests = path => gateway.requests.filter(request => request.rsc && !request.prefetch && request.path.startsWith(path));
    await page.hover(link);
    await page.waitForNetworkIdle({ idleTime: 250 });
    assert.equal(pageRequests('/gallery/').length, 1, 'genuine hover must prepare the dynamic route');
    await visitByClick(page, link, '/gallery/');
    assert.equal(pageRequests('/gallery/').length, 1, 'a prepared dynamic page must not need a new route request after click');
    assert.ok(await page.$('#main-content'), 'the prepared content must render');
    // A click while the hover's page is still downloading joins it instead of asking again.
    const contests = '.arena-sidebar .hp-nav-list a[href="/contests/"]';
    await page.hover(contests);
    for (let attempt = 0; attempt < 100 && pageRequests('/contests/').length === 0; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(pageRequests('/contests/').length, 1, 'fixture must click while the prefetch is on its way');
    await visitByClick(page, contests, '/contests/');
    assert.equal(pageRequests('/contests/').length, 1, 'the click reuses the prefetch that was still downloading');
    // Back while a click waits for its prefetch wins at once, and the late prefetch never navigates.
    const funDecks = '.arena-sidebar .hp-nav-list a[href="/standard/fun-decks/"]';
    await openModeFor(page, funDecks);
    await page.hover(funDecks);
    for (let attempt = 0; attempt < 100 && pageRequests('/standard/fun-decks/').length === 0; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await page.click(funDecks);
    const backAt = Date.now();
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => location.pathname === '/contests/');
    assert.ok(Date.now() - backAt < 400, 'Back is not held by the waiting click');
    await new Promise(resolve => setTimeout(resolve, 900));
    assert.equal(await page.evaluate(() => location.pathname), '/contests/');
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    await closeLocal(legacy);
  }
});
