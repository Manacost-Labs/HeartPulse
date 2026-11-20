import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { resolve } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

// /tierlist/ and /classes/ in a real browser against an Express stub (E21 R6, #410, #462): a guest gets the
// subscriber's view on the open data (on /tierlist/ the same TierList), with locks in place of the paid values
// and no gate over it; a class is a link to its page (#617), a lock opens the subscription offer; a subscriber's
// view switches to the protected data only once it has arrived, without a duplicate and without a layout shift. The protected routes of
// the stub carry the sentinels, so they appear on a page only for a subscriber.

const READER = { id: 'first-screen-reader', email: 'reader@example.test', name: 'Подписчик Арены', role: 'user' };
const SUBSCRIBED = { hasAccess: true, entitlements: { arena: true }, source: 'boosty', checkedAt: null,
  stale: false, message: '', boosty: { checked: true, hasAccess: true }, patreon: {}, telegram: {} };
const PROTECTED_DELAY_MS = 900;
const CARD_IMAGE = readFileSync(resolve('public/arena-logo-icon.webp'));
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true };
const SMALL_PHONE = { width: 360, height: 740, isMobile: true, hasTouch: true };
const DESKTOP = { width: 1440, height: 900 };
const UPDATED_AT = '2026-11-19T12:00:00.000Z';
const PAID_SENTINEL = 73.3;
const CLASSES = [['druid', 'Друид'], ['mage', 'Маг'], ['warlock', 'Чернокнижник'], ['any', 'Нейтральные']];
const RANKED = ['Рыцарь смерти', 'Охотник на демонов', 'Друид', 'Охотник', 'Маг', 'Паладин', 'Жрец', 'Разбойник', 'Шаман', 'Чернокнижник', 'Воин']
  .map((name, index) => [`class-${index}`, name]);
const TIERS = ['S', 'A', 'B', 'C'];
const NAMES = ['Хранитель Скрытого Могильника', 'Волшебная ракета', 'Ледяная стрела', 'Страж'];

const cardsOf = (classId, index) => Array.from({ length: 24 }, (_, i) => ({
  cardId: `FS_${classId}_${i}`, name: `${NAMES[(i + index) % NAMES.length]} ${i + 1}`, tier: TIERS[Math.floor(i / 6)],
  cost: i % 9, rarity: 'rare', type: 'minion', winrate: 61.2 - i * 0.3 - index * 0.1, pickRate: 30.4 - i * 0.2,
}));
const openTierlist = () => ({ updatedAt: UPDATED_AT, source: 'HSReplay', sourceId: 'hsreplay', sampleGamesAtLeast: 980000,
  classes: CLASSES.map(([id, name], index) => ({ id, name, cards: cardsOf(id, index) })) });
const protectedTierlist = () => {
  const cards = {};
  const sections = CLASSES.map(([id, name], index) => ({ id, name, color: '#704a16', textDark: false, totalCards: 24,
    tiers: TIERS.map((tier, t) => ({ tier, label: tier, description: '', cards: cardsOf(id, index).slice(t * 6, t * 6 + 6).map(card => {
      cards[card.cardId] = { cost: card.cost, type: 'minion', rarity: 'rare', imageHa: '/api/card-image/x.webp', imageRu: null };
      return { ...card, score: 90, classKey: id, source: 'hsreplay', deckWinrate: PAID_SENTINEL, playedWinrate: PAID_SENTINEL, arenaScore: PAID_SENTINEL };
    }) })) }));
  return { sections, cards, updatedAt: UPDATED_AT, source: 'hsreplay.net' };
};
const openClasses = () => ({ updatedAt: UPDATED_AT, source: 'HSReplay', sampleUnit: 'drafts',
  classes: RANKED.map(([id, name], i) => ({ id, name, winrate: 56.4 - i * 0.9, sample: 48210 - i * 1900 })) });
// The protected ranking is a newer snapshot than the open slice: the data line must follow the ranking it heads.
const PROTECTED_CLASSES_AT = '2026-11-19T15:30:00.000Z';
const protectedClasses = () => ({ updatedAt: PROTECTED_CLASSES_AT, source: 'hsreplay.net',
  classes: RANKED.map(([id, name], i) => ({ id, name, color: '#704a16', winrate: 56.4 - i * 0.9, games: 12000 - i * 300 })) });

async function startStack() {
  const sessions = new Set(['reader']);
  const state = { protectedReads: 0, next: null };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://stack');
    const name = /(?:^|;\s*)fs_session=(\w+)/.exec(request.headers.cookie ?? '')?.[1];
    const reader = Boolean(name && sessions.has(name));
    const json = (status, payload) => response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' })
      .end(JSON.stringify(payload));
    if (url.pathname === '/api/auth/me') return json(200, { user: reader ? READER : null, adminAllowed: false, contestAdminAllowed: false });
    if (url.pathname === '/api/auth/telegram/config') {
      return json(200, { enabled: false, socialProviders: [{ provider: 'google', authUrl: '/api/auth/google/start' }] });
    }
    if (url.pathname === '/api/subscription/status') return reader ? json(200, SUBSCRIBED) : json(401, { error: 'guest' });
    if (url.pathname === '/api/tierlist/public') return state.openDown ? json(503, { error: 'no snapshot' }) : json(200, openTierlist());
    if (url.pathname === '/api/winrates/public-teaser') return json(200, openClasses());
    if (url.pathname === '/api/tierlist' || url.pathname === '/api/winrates') {
      if (!reader) return json(401, { error: 'subscription required' });
      state.protectedReads += 1;
      if (state.protectedFail === '500') return void setTimeout(() => json(500, { error: 'boom' }), 200);
      if (state.protectedFail === 'empty') {
        return void setTimeout(() => json(200, url.pathname === '/api/tierlist'
          ? { sections: [], cards: {}, updatedAt: UPDATED_AT, source: 'hsreplay.net' }
          : { classes: [], updatedAt: UPDATED_AT, source: 'hsreplay.net' }), 200);
      }
      if (state.protectedFail === 'broken') return void setTimeout(() => response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"sections":'), 200);
      return void setTimeout(() => json(200, url.pathname === '/api/tierlist' ? protectedTierlist() : protectedClasses()), PROTECTED_DELAY_MS);
    }
    if (url.pathname.startsWith('/api/card-image/') || url.pathname.endsWith('.webp')) {
      return response.writeHead(200, { 'Content-Type': 'image/webp' }).end(CARD_IMAGE);
    }
    if (url.pathname.startsWith('/api/')) return json(401, { error: 'guest' });
    const next = new URL(state.next);
    const upstream = http.request(next, { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  const origin = await listenLocal(server);
  return Object.assign(state, { server, origin, sessions });
}

async function open(browser, origin, path, { viewport = DESKTOP, session = null, wait = '.hs-tier-card, .arena-class-meter-label' } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.setCacheEnabled(false);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    window.__layoutShifts = [];
    window.__shiftSources = [];
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        window.__layoutShifts.push(entry.value);
        window.__shiftSources.push(`${entry.value.toFixed(3)}: ${entry.sources.map(source => `${source.node?.nodeName}.${source.node?.className ?? ''}`).join(', ')}`);
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  // A subscriber's protected answers are cached in the browser for a minute: every visit starts from a cold cache.
  if (session) await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch { /* none */ } });
  if (session) await page.setCookie({ name: 'fs_session', value: session, url: origin });
  else await page.deleteCookie({ name: 'fs_session', url: origin });
  await page.goto(`${origin}${path}`, { waitUntil: 'load' });
  await page.waitForSelector(wait, { timeout: 15000 });
  return { page, errors };
}
const shift = page => page.evaluate(() => window.__layoutShifts.reduce((sum, value) => sum + value, 0));
const shiftSources = page => page.evaluate(() => window.__shiftSources.join(' | '));

test('/tierlist/ and /classes/: the open data is the first screen, locks stand for the paid values', async () => {
  const stack = await startStack();
  const next = await startNextServer({ legacyOrigin: stack.origin,
    env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
  stack.next = next.origin;
  let browser;
  try {
    // Both pages are five-minute ISR copies: move the server's clock until the copies with the data are served.
    for (const [path, marker] of [['/tierlist/', 'hs-tier-card'], ['/classes/', 'arena-class-meter-label']]) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        process.kill(next.pid, 'SIGUSR2');
        if ((await (await fetch(`${next.origin}${path}`)).text()).includes(marker)) break;
        assert.ok(attempt < 39, `${path}: the server HTML never got the data`);
        await delay(250);
      }
    }
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });

    // A guest without JavaScript: the data and the locks, no gate, no paid value.
    const bare = await browser.newPage();
    await bare.setJavaScriptEnabled(false);
    for (const path of ['/tierlist/', '/classes/']) {
      await bare.goto(`${stack.origin}${path}`, { waitUntil: 'load' });
      const html = await bare.content();
      assert.ok(!html.includes('arena-paywall'), `${path}: no gate for a guest`);
      assert.ok(!html.includes(String(PAID_SENTINEL)), `${path}: no paid value`);
      assert.ok(html.includes('paywalled-'), `${path}: the closed part is named`);
      assert.ok(html.includes(path === '/tierlist/' ? 'Страж 4' : 'Чернокнижник'), `${path}: the open data is in the HTML`);
    }
    await bare.close();

    for (const viewport of [DESKTOP, PHONE, SMALL_PHONE]) {
      // The tier list: the subscriber's view on the open data, the closed parts locked in place.
      const { page, errors } = await open(browser, stack.origin, '/tierlist/', { viewport });
      await delay(1200);
      assert.equal(await page.$('.arena-paywall'), null, `${viewport.width}px: no gate over the list`);
      assert.equal(stack.protectedReads, 0, 'a guest never asks for the protected list');
      const geometry = await page.evaluate(() => ({
        cards: document.querySelectorAll('.tierlist-card-grid .hs-tier-card').length,
        locks: document.querySelectorAll('.paywalled-tierlist').length,
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        badge: document.querySelector('.tierlist-group-heading img.arena-tier-badge')?.getAttribute('src') ?? null,
      }));
      assert.ok(geometry.cards > 0, `${viewport.width}px: the cards are on the page`);
      assert.ok(geometry.locks >= 4, `${viewport.width}px: two sources and two filters are locked (${geometry.locks})`);
      assert.ok(geometry.page <= 0, `${viewport.width}px: the page scrolls sideways by ${geometry.page}`);
      assert.match(geometry.badge, /^\/tier-marks\/[sabcdefu]-80\.webp$/, 'tiers use the painted marks');
      assert.ok(await shift(page) < 0.01, `${viewport.width}px: the guest page shifted by ${await shift(page)}: ${await shiftSources(page)}`);

      // Choosing a class opens its page (#617), the class whole; a lock opens the offer there.
      await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('.arena-tier-classes a[aria-label="Маг"]')]);
      assert.equal(await page.evaluate(() => location.pathname), '/tierlist/mage/');
      await page.waitForSelector('.tierlist-card-grid .hs-tier-card');
      assert.equal(await page.$eval('.arena-tier-classes a[aria-current="page"]', link => link.getAttribute('aria-label')), 'Маг');
      await page.click('.source-toggle-button[data-locked="true"]');
      await page.waitForSelector('[data-testid="arena-paid-offer"]');
      const login = await page.$eval('[data-testid="arena-paid-offer"] a[href^="/?login"]', link => link.getAttribute('href'));
      assert.equal(new URLSearchParams(login.split('?')[1]).get('returnTo'), '/tierlist/mage/', 'sign-in returns to the class page');
      assert.deepEqual(errors, []);
      await page.close();

      // A guest who opens the address with a class gets that class.
      const linked = await open(browser, stack.origin, '/tierlist/?class=druid', { viewport });
      await linked.page.waitForFunction(() => document.querySelector('.arena-tier-classes a[aria-current="page"]')?.getAttribute('aria-label') === 'Друид', { timeout: 15000 });
      await linked.page.close();

      // The classes.
      const classes = await open(browser, stack.origin, '/classes/', { viewport });
      await delay(1000);
      assert.equal(await classes.page.$('.arena-paywall'), null, `${viewport.width}px: no gate over the ranking`);
      // A phone is only asked for the first rows of the eleven.
      const rowsBottom = await classes.page.$eval('.arena-classes-board li:nth-child(2)', row => row.getBoundingClientRect().bottom);
      assert.ok(rowsBottom <= viewport.height, `${viewport.width}px: the ranking starts below the first screen (${rowsBottom})`);
      assert.equal(await classes.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, true,
        `${viewport.width}px: the page does not scroll sideways`);
      assert.ok(await shift(classes.page) < 0.01, `${viewport.width}px: the classes page shifted by ${await shift(classes.page)}`);
      await classes.page.click('.classes-paid-more');
      await classes.page.waitForSelector('[data-testid="arena-paid-offer"]');
      assert.deepEqual(classes.errors, []);
      await classes.page.close();
    }

    // A subscriber on the tier list: the open list stays until the protected data is in, then the full view
    // replaces it (no duplicate, no gate, no skeleton, no shift).
    for (const viewport of [DESKTOP, PHONE]) {
      const { page, errors } = await open(browser, stack.origin, '/tierlist/?class=mage', { viewport, session: 'reader' });
      await delay(300);
      assert.equal(await page.$('.arena-paywall'), null, 'no gate while the access is checked');
      assert.ok(await page.$('.tierlist-card-grid .hs-tier-card'), 'the open data is on the page while the protected data loads');
      // Details opened on the open data close when the protected data replaces it (no stale figures, no hidden paid ones).
      await page.click('.tierlist-card-grid .hs-tier-card');
      await page.waitForSelector('.card-modal-lightbox');
      await page.waitForFunction(() => !document.querySelector('[data-locked], .arena-tier-select--locked'), { timeout: 15000 });
      await page.waitForFunction(() => !document.querySelector('.card-modal-lightbox'), { timeout: 5000 });
      assert.equal(await page.$('.arena-paywall'), null);
      assert.equal(await page.$eval('.arena-tier-classes a[aria-current="page"]', link => link.getAttribute('aria-label')), 'Маг',
        'the class stays when the protected data arrives');
      await delay(600);
      assert.ok(await shift(page) < 0.01, `${viewport.width}px: the subscriber's swap shifted the page by ${await shift(page)}: ${await shiftSources(page)}`);
      assert.deepEqual(errors, []);
      await page.close();

      // The same on the classes page.
      const classes = await open(browser, stack.origin, '/classes/', { viewport, session: 'reader' });
      await delay(300);
      assert.ok(await classes.page.$('.classes-paid-more'), 'the open ranking (with its lock) is there while the protected data loads');
      await classes.page.waitForFunction(() => !document.querySelector('.classes-paid-more') && document.querySelector('.arena-class-row'), { timeout: 15000 });
      assert.equal(await classes.page.$$eval('.arena-classes-board', boards => boards.length), 1, 'one ranking, not two');
      assert.equal(await classes.page.$eval('.classes-data-line time', node => node.getAttribute('datetime')), PROTECTED_CLASSES_AT,
        'the data line dates the ranking shown');
      assert.match(await classes.page.$eval('.classes-data-line', node => node.textContent), /источник HSReplay/);
      assert.equal(await classes.page.$('.arena-paywall'), null);
      await delay(600);
      assert.ok(await shift(classes.page) < 0.01, `${viewport.width}px: the swap shifted the classes page by ${await shift(classes.page)}: ${await shiftSources(classes.page)}`);
      assert.deepEqual(classes.errors, []);
      await classes.page.close();
    }

    // The protected answer fails (a 5xx, a broken body or a valid answer without rows): the subscriber keeps the open list, never an empty or error view.
    for (const failure of ['500', 'broken', 'empty']) {
      stack.protectedFail = failure;
      for (const [path, open1, full] of [['/tierlist/', '.tierlist-card-grid .hs-tier-card + *, .paywalled-tierlist', '.arena-paywall'],
        ['/classes/', '.classes-paid-more', '.arena-classes-notice, .arena-paywall']]) {
        const failed = await open(browser, stack.origin, path, { session: 'reader' });
        await delay(2500);
        assert.ok(await failed.page.$(open1), `${path} (${failure}): the open data must stay when the protected answer fails`);
        assert.equal(await failed.page.$(full), null, `${path} (${failure}): no empty or error full view`);
        await failed.page.close();
      }
    }
    stack.protectedFail = null;

    // A subscriber who signed in with a class in the address gets that class once the protected data is in.
    const signedIn = await open(browser, stack.origin, '/tierlist/?class=mage', { session: 'reader', wait: '.arena-tier-classes' });
    await signedIn.page.waitForFunction(() => document.querySelector('.arena-tier-classes a[aria-current="page"]')?.getAttribute('aria-label') === 'Маг',
      { timeout: 15000 });
    assert.deepEqual(signedIn.errors, []);
    await signedIn.page.close();

    // The open source goes down at runtime: a regeneration without data throws, so the last good page stays (#631)
    // and a guest never gets the copy without cards (that copy is only the build's, which the deploy warm-up replaces).
    stack.openDown = true;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      for (const path of ['/tierlist/', '/classes/']) {
        const html = await (await fetch(`${next.origin}${path}`)).text();
        assert.ok(html.includes(path === '/tierlist/' ? 'hs-tier-card' : 'arena-class-meter-label'), `${path}: the last good copy stays`);
      }
      await delay(250);
    }
  } finally {
    if (browser) await browser.close();
    await next.close();
    await closeLocal(stack.server);
  }
});
