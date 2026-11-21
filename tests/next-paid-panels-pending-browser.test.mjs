import assert from 'node:assert/strict';
import http from 'node:http';
import { after, describe, test } from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { createPublicWebGateway } from '../scripts/public-web-gateway.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

// A subscriber whose subscription answer is late (as on a phone) must never
// see a paid panel locked: while access is checked, or the panel's paid data
// is on its way, the panel keeps its loading state. Locks, the inline paywall
// and the "available to subscribers" previews belong to a confirmed answer
// without access (instant viewer access, docs/specs/instant-viewer-access.md).
const STATUS_DELAY_MS = 2500;
const LOCKS = ['.constructed-cards__stats-lock', '.constructed-cards__locked-value', '.constructed-cards__sort-lock',
  '.arena-inline-paywall', '.arena-paywall', '.archetype-build-preview', 'visible:.constructed-card-detail .paid-lock',
  'visible:.constructed-card-detail .paid-filter-lock', 'visible:.constructed-card-detail .constructed-cards__filter-lock'];
const LOCK_TEXT = ['Статистика доступна с тарифом', 'доступны подписчикам'];
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/google-chrome';

// One card pilot (real backend, Next and gateway) with a subscriber's grant
// for the card tests; each test opens its own browser.
let sharedPilot = null;
function cardPilot() {
  sharedPilot ??= startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true }).then(runtime => {
    runtime.grant();
    return runtime;
  });
  return sharedPilot;
}
after(async () => { if (sharedPilot) await (await sharedPilot).close(); });

function recordLocks(selectors, texts) {
  window.__locks = [];
  const sample = () => {
    if (document.body) {
      // `visible:` selectors: a lock that holds its place but is not drawn (the card page while access is checked) does not count.
      const found = candidate => candidate.startsWith('visible:')
        ? [...document.querySelectorAll(candidate.slice(8))].some(node => node.checkVisibility({ visibilityProperty: true }))
        : Boolean(document.querySelector(candidate));
      const selector = selectors.find(found);
      const text = texts.find(candidate => document.body.textContent.includes(candidate));
      if (selector || text) window.__locks.push({ at: Math.round(performance.now()), selector, text });
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}

// Holds the subscription answer back without changing it.
async function delaySubscription(page) {
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/subscription/status') {
      setTimeout(() => { void request.continue().catch(() => {}); }, STATUS_DELAY_MS);
      return;
    }
    void request.continue().catch(() => {});
  });
}

async function assertNeverLocked(page, label, settled) {
  await page.evaluateOnNewDocument(recordLocks, LOCKS, LOCK_TEXT);
  await delaySubscription(page);
  return async path => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(settled, { timeout: 20_000 });
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
    assert.deepEqual(await page.evaluate(() => window.__locks.slice(0, 3)), [], `${label}: no frame shows a lock`);
  };
}

// The scenarios are independent, so they run side by side to keep the browser suite short.
describe('paid panels while access is pending', { concurrency: 4 }, () => {
test('constructed card statistics stay in their loading state, never locked, for a late subscription answer', { timeout: 180_000 }, async () => {
  const runtime = await cardPilot();
  let browser;
  try {
    browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox'] });
    const [name, value] = runtime.cookie.split('=');
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
      for (const [path, settled] of [
        ['/standard/cards/standard/blizzard%3A12345/',
          () => Boolean(document.querySelector('.constructed-card-detail__statistics dl.constructed-cards__stats[data-stats-mode="full"]'))],
        ['/standard/cards/', () => performance.getEntriesByType('resource')
          .filter(entry => entry.name.includes('/api/constructed-cards')).length > 0
          && !document.querySelector('[data-loading]')
          && performance.getEntriesByType('resource').some(entry => entry.name.endsWith('/api/subscription/status'))],
      ]) {
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setViewport(viewport);
        await page.setCookie({ name, value, url: runtime.origin });
        const visit = await assertNeverLocked(page, `${path} at ${viewport.width}px`, settled);
        await visit(`${runtime.origin}${path}`);
        await context.close();
      }
    }
  } finally {
    if (browser) await browser.close();
  }
});

// A subscription service that keeps failing (503 until the check's deadline)
// is neither a grant nor a refusal: the card statistics never lock. The card
// API confirms access by itself here, so its statistics appear; without that
// the panel would offer a retry.
// «Динамика карты» is the same block for everybody: a guest opens it and finds the lock in the chart's place and no
// request for the paid history; a subscriber opens it and the history is asked for, with no lock.
test('the card dynamics block is a lock for a guest and the history for a subscriber', { timeout: 180_000 }, async () => {
  const runtime = await cardPilot();
  const [name, value] = runtime.cookie.split('=');
  let browser;
  try {
    browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox'] });
    for (const viewer of ['guest', 'subscriber']) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      if (viewer === 'subscriber') await page.setCookie({ name, value, url: runtime.origin });
      const historyRequests = [];
      page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/history')) historyRequests.push(request.url()); });
      await page.goto(`${runtime.origin}/standard/cards/standard/blizzard%3A12345/`, { waitUntil: 'domcontentloaded' });
      if (viewer === 'subscriber') await page.waitForSelector('dl.constructed-cards__stats[data-stats-mode="full"]', { timeout: 25_000 });
      else await page.waitForSelector('dl.constructed-cards__stats[data-stats-mode="locked"]', { timeout: 25_000 });
      const heading = await page.waitForSelector('xpath/.//h2[normalize-space()="Динамика карты"]');
      await heading.click();
      const lock = 'button[aria-label="История карты: по подписке. Узнать, как открыть"]';
      if (viewer === 'guest') {
        await page.waitForSelector(lock, { visible: true, timeout: 10_000 });
        // The closed block is the real chart panel, muted: the switches of the metric and of the range are there,
        // with the chart, out of reach of readers; the lock stands on it.
        await page.waitForSelector('.constructed-card-history__muted [aria-label="Показатель графика"]', { timeout: 10_000 });
        await page.waitForSelector('.constructed-card-history__muted svg', { timeout: 10_000 });
        assert.equal(await page.$eval('.constructed-card-history__muted', node => node.getAttribute('aria-hidden') === 'true' && node.hasAttribute('inert')), true);
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1000)));
        assert.deepEqual(historyRequests, [], 'a guest never asks for the paid history');
      } else {
        await page.waitForFunction(() => document.querySelector('details.constructed-card-history')?.open === true);
        await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => new URL(entry.name).pathname.endsWith('/history')), { timeout: 15_000 });
        assert.equal(await page.$(lock), null, 'a subscriber sees no lock where the history is');
      }
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
  }
});

// The same block for everybody: the guest's lock takes no more room than a subscriber's figure, so no caption
// wraps onto a second line and the block is as tall as the subscriber's, on a phone and on a desktop.
test('the statistics block is as tall for a guest as for a subscriber, and no caption wraps', { timeout: 240_000 }, async () => {
  const runtime = await cardPilot();
  const [name, value] = runtime.cookie.split('=');
  let browser;
  try {
    browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox'] });
    for (const viewport of [{ width: 390, height: 844, isMobile: true, hasTouch: true }, { width: 1440, height: 900 }]) {
      const measured = {};
      for (const viewer of ['guest', 'subscriber']) {
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setViewport(viewport);
        if (viewer === 'subscriber') await page.setCookie({ name, value, url: runtime.origin });
        await page.goto(`${runtime.origin}/standard/cards/standard/blizzard%3A12345/`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector(`dl.constructed-cards__stats[data-stats-mode="${viewer === 'guest' ? 'locked' : 'full'}"]`, { timeout: 25_000 });
        await page.evaluate(() => document.fonts.ready);
        measured[viewer] = await page.evaluate(() => ({
          block: document.querySelector('.constructed-card-detail__statistics').getBoundingClientRect().height,
          captions: [...document.querySelectorAll('.constructed-cards__stats dt')].map(node => Math.round(node.getBoundingClientRect().height)),
        }));
        await context.close();
      }
      const label = `${viewport.width}px`;
      assert.ok(Math.abs(measured.guest.block - measured.subscriber.block) <= 2, `${label}: guest block ${measured.guest.block}, subscriber block ${measured.subscriber.block}`);
      assert.deepEqual(measured.guest.captions, measured.subscriber.captions, `${label}: no caption wraps differently for a guest`);
    }
  } finally {
    if (browser) await browser.close();
  }
});

// A card answer that hangs does not keep the paid rows waiting forever: after the deadline the open numbers stay and a
// readable message with «Повторить» appears; the retry loads the card.
test('a hanging paid card request ends with a message and a retry, the open numbers staying', { timeout: 120_000 }, async () => {
  const runtime = await cardPilot();
  const [name, value] = runtime.cookie.split('=');
  let browser;
  try {
    browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox'] });
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setCookie({ name, value, url: runtime.origin });
    let hang = true;
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (hang && new URL(request.url()).pathname.startsWith('/api/constructed-cards/')) return; // never answered
      void request.continue().catch(() => {});
    });
    await page.goto(`${runtime.origin}/standard/cards/standard/blizzard%3A12345/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('dl.constructed-cards__stats[data-stats-mode="waiting"]', { timeout: 20_000 });
    const retry = await page.waitForSelector('xpath/.//button[normalize-space()="Повторить"]', { timeout: 40_000 });
    const notice = await page.$eval('.constructed-card-detail__statistics-unavailable p', node => node.textContent);
    assert.match(notice, /Сервер не ответил за 25 секунд/);
    assert.equal(await page.$eval('dl.constructed-cards__stats', node => node.dataset.statsMode), 'failed');
    assert.match(await page.$eval('dl.constructed-cards__stats', node => node.textContent), /12,5%/, 'the open numbers stay');
    hang = false;
    await retry.click();
    await page.waitForSelector('dl.constructed-cards__stats[data-stats-mode="full"]', { timeout: 25_000 });
    await context.close();
  } finally {
    if (browser) await browser.close();
  }
});

// The offer of a card lock closes when the card's own entitlement is confirmed (`standard`), also for a reader
// without `arena`: signed in, no access yet; opens a lock; the grant arrives (the subscription answer carries
// `standard` only: a manual grant would give every entitlement); «Проверить доступ»; the offer goes and the paid
// statistics are on the page.
test('the card offer closes once the standard entitlement is confirmed, with no arena one', { timeout: 180_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  const [name, value] = runtime.cookie.split('=');
  let browser;
  try {
    browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox'] });
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setCookie({ name, value, url: runtime.origin });
    let granted = false;
    await page.setRequestInterception(true);
    page.on('request', request => {
      const { pathname } = new URL(request.url());
      if (!granted || !['/api/subscription/status', '/api/subscription/refresh'].includes(pathname)) { void request.continue().catch(() => {}); return; }
      void fetch(request.url(), { method: request.method(), headers: { ...request.headers(), Cookie: runtime.cookie }, body: request.postData() }).then(async answer => {
        const status = await answer.json();
        const only = { arena: false, battlegrounds: false, standard: true, contests: false, guidesArchive: false, arenaArticles: false, battlegroundsArticles: false };
        await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...status, entitlements: only }) });
      }).catch(() => request.continue().catch(() => {}));
    });
    await page.goto(`${runtime.origin}/standard/cards/standard/blizzard%3A12345/`, { waitUntil: 'domcontentloaded' });
    // Signed in, the rows wait while the access is checked; the lock comes with the confirmed refusal.
    const lock = await page.waitForSelector('button[aria-label="Винрейт, если сыграна: по подписке. Узнать, как открыть"]', { visible: true, timeout: 25_000 });
    await lock.click();
    await page.waitForSelector('[role="dialog"]', { visible: true, timeout: 10_000 });
    runtime.grant(); granted = true;
    const check = await page.waitForSelector('xpath/.//button[normalize-space()="Проверить доступ"]', { visible: true, timeout: 10_000 });
    await check.click();
    await page.waitForSelector('[role="dialog"]', { hidden: true, timeout: 20_000 });
    await page.waitForSelector('dl.constructed-cards__stats[data-stats-mode="full"]', { timeout: 20_000 });
    await context.close();
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});

test('card statistics never lock when the subscription answer fails', { timeout: 180_000 }, async () => {
  const runtime = await cardPilot();
  let browser;
  try {
    browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox'] });
    const [name, value] = runtime.cookie.split('=');
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.setCookie({ name, value, url: runtime.origin });
    await page.evaluateOnNewDocument(recordLocks, LOCKS, LOCK_TEXT);
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/subscription/status') {
        void request.respond({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' }).catch(() => {});
        return;
      }
      void request.continue().catch(() => {});
    });
    await page.goto(`${runtime.origin}/standard/cards/standard/blizzard%3A12345/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('.constructed-card-detail__statistics-unavailable button')
      || document.querySelector('.constructed-card-detail__statistics dl.constructed-cards__stats[data-stats-mode="full"]'), { timeout: 25_000 });
    // Past the check's deadline (10 s) the access state is final: still no lock.
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 11_000)));
    assert.deepEqual(await page.evaluate(() => window.__locks.slice(0, 3)), [], 'no frame shows a lock');
    await context.close();
  } finally {
    if (browser) await browser.close();
  }
});

// Back restores a card page from the back/forward cache. Its statistics were
// paid data for the viewer then; until the server confirms the viewer again
// they must not show, whether the answers are late or fail.
test('a restored card page hides its paid statistics until access is confirmed again', { timeout: 240_000 }, async () => {
  const runtime = await cardPilot();
  const target = new URL(runtime.origin);
  const proxy = { mode: 'pass' };
  const server = http.createServer((request, response) => {
    const { pathname } = new URL(request.url, 'http://proxy');
    const forward = () => {
      const upstream = http.request(target, { method: request.method, path: request.url, headers: request.headers },
        answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
      // A delayed request can outlive the pilot once the test is over.
      upstream.on('error', () => response.destroy());
      request.pipe(upstream);
    };
    if (proxy.mode !== 'pass' && (pathname === '/api/auth/me' || pathname === '/api/subscription/status')) {
      if (proxy.mode === 'error' && pathname === '/api/subscription/status') {
        response.writeHead(503, { 'Content-Type': 'application/json' }).end('{"error":"unavailable"}');
        return;
      }
      setTimeout(forward, 2500);
      return;
    }
    forward();
  });
  let browser;
  try {
    const origin = await listenLocal(server);
    browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox'] });
    const [name, value] = runtime.cookie.split('=');
    for (const mode of ['late', 'error']) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.setCookie({ name, value, url: origin });
      proxy.mode = 'pass';
      await page.goto(`${origin}/standard/cards/standard/blizzard%3A12345/`, { waitUntil: 'load' });
      await page.waitForSelector('.constructed-card-detail__statistics dl.constructed-cards__stats[data-stats-mode="full"]', { timeout: 20_000 });
      await page.evaluate(() => {
        window.__restoreMarker = true;
        addEventListener('pageshow', event => {
          if (!event.persisted) return;
          const paid = () => Boolean(document.querySelector('.constructed-card-detail__statistics dl.constructed-cards__stats[data-stats-mode="full"]')
            || document.querySelector('.constructed-card-detail__history, [class*="history-chart"]'));
          window.__restored = { event: paid(), later: [] };
          requestAnimationFrame(() => { window.__restored.frame = paid(); });
          for (const wait of [300, 1000, 2000]) setTimeout(() => window.__restored.later.push(paid()), wait);
        });
      });
      await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.evaluate(() => { location.href = '/faq/'; })]);
      proxy.mode = mode;
      await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.evaluate(() => history.back())]);
      await page.waitForFunction(() => window.__restored?.later.length === 3, { timeout: 10_000 });
      const restored = await page.evaluate(() => ({ marker: window.__restoreMarker === true, ...window.__restored }));
      assert.equal(restored.marker, true, `${mode}: the card page must come back from the back/forward cache`);
      assert.deepEqual({ event: restored.event, frame: restored.frame, later: restored.later }, { event: false, frame: false,
        later: [false, false, false] }, `${mode}: no paid statistics before the access is confirmed again`);
      if (mode === 'late') {
        await page.waitForSelector('.constructed-card-detail__statistics dl.constructed-cards__stats[data-stats-mode="full"]', { timeout: 20_000 });
      } else {
        await page.waitForSelector('.constructed-card-detail__statistics-unavailable button', { timeout: 25_000 });
      }
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    await closeLocal(server);
  }
});

const teaser = {
  format: 'wild', formatLabel: 'Вольный', patch: '36.0.3', minimumGames: 50, updatedAt: '2026-07-24T12:38:57.727Z',
  item: { slug: 'thief-priest', archetype: 'Thief Priest', archetypeLabel: 'Воровской Жрец', translated: true,
    classKey: 'priest', format: 'wild', games: 31959, winrate: 58.3, popularity: 13.5, turns: 7.9, durationMinutes: 8,
    climbingSpeed: 1.24, deckCount: 1, sourceUrl: 'https://www.hsguru.com/meta', builds: [] },
  featuredBuild: { games: 2216, winrate: 57.1, updatedAt: null, sampleRank: 'all', samplePeriod: 'past_30_days' },
  history: [], analysis: null,
};

test('archetype detail keeps its paid sections loading, without preview or paywall, for a late subscription answer', { timeout: 120_000 }, async () => {
  const legacy = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture');
    const member = /(?:^|;\s*)member=1/.test(request.headers.cookie ?? '');
    const json = (status, payload) => response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload));
    if (url.pathname === '/api/constructed-archetypes/teaser/wild/thief-priest') return json(200, teaser);
    if (url.pathname === '/api/constructed-archetypes/wild/thief-priest') {
      if (!member) return json(403, { error: 'denied' });
      const section = url.searchParams.get('section');
      return json(200, section === 'history' ? { history: [] } : section === 'analysis' ? { analysis: null }
        : { ...teaser, item: { ...teaser.item, builds: [{ deckCode: 'AAEBAa0GValidDeckCode', games: 2216, winrate: 57.1, classKey: 'priest' }] } });
    }
    if (url.pathname === '/api/auth/me') {
      return json(200, member ? { user: { id: 'late-member', name: 'Тест', email: 'member@example.test', role: 'user' } }
        : { user: null, adminAllowed: false, contestAdminAllowed: false });
    }
    if (url.pathname === '/api/subscription/status') {
      return json(member ? 200 : 401, { hasAccess: member, entitlements: { standard: member }, source: 'boosty',
        checkedAt: null, stale: false, message: '', boosty: {}, patreon: {}, telegram: {} });
    }
    if (url.pathname.startsWith('/api/')) return json(401, { error: 'guest' });
    response.writeHead(204).end();
  });
  let next; let gateway; let browser;
  try {
    const legacyOrigin = await listenLocal(legacy);
    next = await startNextServer({ legacyOrigin });
    gateway = createPublicWebGateway({ legacyOrigin, nextOrigin: next.origin, enabled: true, pagesEnabled: true });
    const origin = await listenLocal(gateway);
    browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setCookie({ name: 'member', value: '1', url: origin });
    const visit = await assertNeverLocked(page, 'archetype detail', () => Boolean(document.querySelector('.archetype-builds')));
    await visit(`${origin}/standard/archetypes/wild/thief-priest/`);
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway);
    if (next) await next.close();
    await closeLocal(legacy);
  }
});
});
