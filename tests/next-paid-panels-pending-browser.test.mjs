import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import puppeteer from 'puppeteer';
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
  '.arena-inline-paywall', '.arena-paywall', '.archetype-build-preview'];
const LOCK_TEXT = ['Статистика доступна с тарифом', 'доступны подписчикам'];
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/google-chrome';

function recordLocks(selectors, texts) {
  window.__locks = [];
  const sample = () => {
    if (document.body) {
      const selector = selectors.find(candidate => document.querySelector(candidate));
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

test('constructed card statistics stay in their loading state, never locked, for a late subscription answer', { timeout: 180_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    runtime.grant();
    browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
    const [name, value] = runtime.cookie.split('=');
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
      for (const [path, settled] of [
        ['/standard/cards/standard/blizzard%3A12345/',
          () => Boolean(document.querySelector('.constructed-card-detail__statistics dl:not([aria-busy])'))],
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
    await runtime.close();
  }
});

// A subscription service that keeps failing (503 until the check's deadline)
// is neither a grant nor a refusal: the card statistics never lock. The card
// API confirms access by itself here, so its statistics appear; without that
// the panel would offer a retry.
test('card statistics never lock when the subscription answer fails', { timeout: 180_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    runtime.grant();
    browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
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
      || document.querySelector('.constructed-card-detail__statistics dl:not([aria-busy])'), { timeout: 25_000 });
    // Past the check's deadline (10 s) the access state is final: still no lock.
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 11_000)));
    assert.deepEqual(await page.evaluate(() => window.__locks.slice(0, 3)), [], 'no frame shows a lock');
    await context.close();
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});

// Back restores a card page from the back/forward cache. Its statistics were
// paid data for the viewer then; until the server confirms the viewer again
// they must not show, whether the answers are late or fail.
test('a restored card page hides its paid statistics until access is confirmed again', { timeout: 240_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
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
    runtime.grant();
    const origin = await listenLocal(server);
    browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
    const [name, value] = runtime.cookie.split('=');
    for (const mode of ['late', 'error']) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.setCookie({ name, value, url: origin });
      proxy.mode = 'pass';
      await page.goto(`${origin}/standard/cards/standard/blizzard%3A12345/`, { waitUntil: 'load' });
      await page.waitForSelector('.constructed-card-detail__statistics dl:not([aria-busy])', { timeout: 20_000 });
      await page.evaluate(() => {
        window.__restoreMarker = true;
        addEventListener('pageshow', event => {
          if (!event.persisted) return;
          const paid = () => Boolean(document.querySelector('.constructed-card-detail__statistics dl:not([aria-busy])')
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
        await page.waitForSelector('.constructed-card-detail__statistics dl:not([aria-busy])', { timeout: 20_000 });
      } else {
        await page.waitForSelector('.constructed-card-detail__statistics-unavailable button', { timeout: 25_000 });
      }
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    await closeLocal(server);
    await runtime.close();
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
    browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setCookie({ name: 'member', value: '1', url: origin });
    const visit = await assertNeverLocked(page, 'archetype detail', () => Boolean(document.querySelector('.archetype-main-build')));
    await visit(`${origin}/standard/archetypes/wild/thief-priest/`);
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway);
    if (next) await next.close();
    await closeLocal(legacy);
  }
});
