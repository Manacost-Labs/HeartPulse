import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { createPublicWebGateway } from '../scripts/public-web-gateway.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';
import { isMenuBackgroundRead, MENU_PATCH_ARCHIVE } from './helpers/menuBackgroundReads.mjs';

// A guest's archetype page is the subscriber's page with the paid parts behind locks: the header, the builds and every
// locked frame stand where the subscriber's data (or its loading skeleton) will stand, so access arriving moves nothing.
const PATH = '/standard/archetypes/standard/zoolock/';
const CARDS = [{ id: 'TST_001', name: 'Тестовый удар', cost: 1, count: 2, hasPage: true }, { id: 'TST_002', name: 'Тестовый страж', cost: 4, count: 1, hasPage: true }];
const deckOf = index => `AAECAf0GAfKiBALxogTzogQ${'ABCDEFGHIJKLMNOP'[index]}AA==`;
// Twelve builds, a page of eight; `PAID_ONLY` is a build the open page does not have (refused by the allowlist, or the
// open copy is older than the live paid answer) and the paid answer ranks it first.
const OPEN = Array.from({ length: 12 }, (_, index) => ({ deckCode: deckOf(index), games: 3000 - index * 10, winrate: 55.5,
  updatedAt: '2026-11-19T00:00:00.000Z', sampleRank: 'all', samplePeriod: 'past_week', cards: CARDS }));
const PAID_ONLY = { deckCode: 'AAECAf0GAfKiBALxogTzogQZZAA==', games: 4000, winrate: 56.5, updatedAt: '2026-11-19T00:00:00.000Z',
  sampleRank: 'all', samplePeriod: 'past_week' };
const item = { slug: 'zoolock', archetype: 'Zoolock', archetypeLabel: 'Зоолок', translated: true, classKey: 'warlock', format: 'standard',
  games: 14800, winrate: 61.2, popularity: 20.4, turns: 7.9, durationMinutes: 8, climbingSpeed: 1.24, deckCount: OPEN.length,
  sourceUrl: 'https://www.hsguru.com/meta' };
const base = { format: 'standard', formatLabel: 'Стандарт', patch: '36.0.3', minimumGames: 50, updatedAt: '2026-11-19T12:00:00.000Z' };
const teaserOf = offset => ({ ...base, item: { ...item, builds: OPEN.slice(offset, offset + 8) }, featuredBuild: null,
  buildsTotal: OPEN.length, buildsOffset: offset, nextOffset: offset + 8 < OPEN.length ? offset + 8 : null });
const HISTORY = [0, 1, 2, 3].map(day => ({ recordedAt: `2026-11-1${day}T00:00:00.000Z`, games: 12000 + day * 900, winrate: 60 + day * 0.4,
  popularity: 19 + day * 0.4, turns: 7.9, durationMinutes: 8, climbingSpeed: 1.2, patch: null }));
const placeholder = readFileSync(new URL('../public/arena-logo-icon.webp', import.meta.url));
const WIDTHS = [1440, 390];

test('the archetype page keeps its geometry from guest to subscriber and while the paid answers arrive', { timeout: 240_000 }, async () => {
  const state = { member: false, paidOnly: false, hold: new Set() };
  const held = [];
  const release = () => { for (const answer of held.splice(0)) answer(); };
  const legacy = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const url = new URL(request.url, 'http://fixture');
    const { pathname } = url;
    const send = body => response.end(JSON.stringify(body));
    if (pathname === '/api/constructed-archetypes/teaser/standard/zoolock') { send(teaserOf(Number(url.searchParams.get('buildsOffset') ?? 0))); return; }
    if (pathname === '/api/constructed-archetypes/teaser') {
      send({ ...base, coverage: {}, items: [{ ...item, builds: [] }, { ...item, slug: 'handlock', archetype: 'Handlock', archetypeLabel: 'Ханделок',
        games: 5000, winrate: 52, popularity: 5, deckCount: 0, builds: [] }] }); return;
    }
    if (pathname.startsWith('/api/constructed-archetypes/teaser/')) { response.writeHead(404).end('{"error":"missing"}'); return; }
    if (pathname === '/api/constructed-archetypes/standard/zoolock') {
      if (!state.member) { response.writeHead(403).end('{"error":"denied"}'); return; }
      const section = url.searchParams.get('section');
      const answer = () => {
        if (response.destroyed) return;
        if (section === 'core') {
          const builds = OPEN.map(({ cards: _cards, ...build }) => ({ ...build, sourceUrl: '', classKey: 'warlock' }));
          send({ ...base, item: { ...item, builds: state.paidOnly ? [{ ...PAID_ONLY, sourceUrl: '', classKey: 'warlock' }, ...builds] : builds },
            history: [], analysis: null, featuredBuild: null });
        } else if (section === 'history') send({ history: HISTORY });
        else if (section === 'ranks') send({ ranks: { ranks: [], periods: [], cells: [], updatedAt: null } });
        else send({ analysis: null });
      };
      if (state.hold.has(section)) held.push(answer); else answer();
      return;
    }
    if (pathname === '/api/constructed-archetype-stats') { response.writeHead(404).end('{"error":"missing"}'); return; }
    if (pathname === '/api/subscription/status') { send({ hasAccess: state.member, active: state.member, entitlements: { standard: state.member } }); return; }
    if (pathname === '/api/auth/me') {
      send(state.member ? { user: { id: 'test-member', name: 'Тест', email: 'member@example.test', role: 'user', adminAllowed: false } }
        : { user: null, adminAllowed: false, contestAdminAllowed: false });
      return;
    }
    if (pathname === '/api/deck/render') { send({ ok: true, ready: true, imageUrl: '/arena-logo-icon.webp', renderer: 'rust', style: 'parchment' }); return; }
    if (pathname === '/api/deck/resolve') {
      // The full list of every build is its open list: the tiles keep their content, only the list of builds may differ.
      send({ ok: true, cards: CARDS.map((card, index) => ({ id: card.id, dbfId: index + 1, name: card.name, cost: card.cost, rarity: 'COMMON',
        elite: false, count: card.count, image: '' })), sideboards: [], totalCards: 3, deckSizeLimit: 30 });
      return;
    }
    if (isMenuBackgroundRead(pathname)) { send(MENU_PATCH_ARCHIVE); return; }
    if (/\.(?:webp|png|jpg|jpeg)$/.test(pathname)) { response.setHeader('Content-Type', 'image/webp'); response.end(placeholder); return; }
    if (pathname.startsWith('/api/')) { response.writeHead(401).end('{"error":"guest"}'); return; }
    response.writeHead(204).end();
  });
  const legacyOrigin = await listenLocal(legacy);
  const reservation = http.createServer(); const nextOrigin = await listenLocal(reservation); await closeLocal(reservation);
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/public-web',
    '--hostname', '127.0.0.1', '--port', new URL(nextOrigin).port], {
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', RUNTIME_CLIENT_CONFIG_FILE: '', LEGACY_WEB_ORIGIN: legacyOrigin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; let gateway; let browser;
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 200 && !ready; attempt++) {
      if (child.exitCode !== null) throw new Error(`Next exited: ${output}`);
      ready = await fetch(`${nextOrigin}/health/next/`).then(response => response.ok, () => false);
      if (!ready) await delay(50);
    }
    assert.ok(ready, `Next did not start: ${output}`);
    gateway = createPublicWebGateway({ legacyOrigin, nextOrigin, enabled: true, pagesEnabled: true });
    const origin = await listenLocal(gateway);
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });

    /** A fresh page that sums the layout shifts not caused by input, from its first frame. */
    async function open(width) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport({ width, height: 900 });
      await page.evaluateOnNewDocument(() => {
        window.__cls = 0;
        new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value; })
          .observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(`${origin}${PATH}`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts.ready);
      return { page, close: () => context.close() };
    }
    const settle = page => page.evaluate(() => new Promise(resolve => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 400)));
    const cls = page => page.evaluate(() => Math.round(window.__cls * 10_000) / 10_000);
    const height = (page, selector) => page.$eval(selector, node => Math.round(node.getBoundingClientRect().height * 10) / 10);
    // The paid parts below the builds in page order, as [top, bottom] of the page: the guest's locked frames (matchups
    // and mulligan together stand for the subscriber's one analysis section) and the subscriber's loading skeletons.
    const paidParts = (page, groups) => page.evaluate(selectors => selectors.map(([first, last = first]) => {
      const [top, bottom] = [document.querySelector(first), document.querySelector(last)];
      return top && bottom ? [top.getBoundingClientRect().top + scrollY, bottom.getBoundingClientRect().bottom + scrollY].map(value => Math.round(value)) : null;
    }), groups);
    const LOCKED = [['[data-paid-frame="matchups"]', '[data-paid-frame="mulligan"]'], ['[data-paid-frame="ranks"]'], ['[data-paid-frame="history"]']];
    const LOADING = [['section[aria-label="Матчапы и муллиган"]'], ['section[aria-label="Винрейт по рангам"] .archetype-ranks'],
      ['section[aria-label="История архетипа"] .archetype-history']];

    for (const width of WIDTHS) {
      // Guest: the page as the server prints it, with locks.
      Object.assign(state, { member: false, paidOnly: false }); state.hold.clear();
      const guest = await open(width);
      await guest.page.waitForSelector('[data-paid-frame="history"]');
      await settle(guest.page);
      const guestHeader = await height(guest.page, '.archetype-dossier');
      const guestParts = await paidParts(guest.page, LOCKED);
      assert.equal(await guest.page.$$eval('.archetype-dossier .paid-lock', nodes => nodes.length), 3, `${width}px: a lock in place of each trend`);
      await guest.close();

      // Subscriber, every paid section still on its way: the skeletons stand where the guest's locks stood.
      Object.assign(state, { member: true, paidOnly: false }); state.hold = new Set(['analysis', 'ranks', 'history']);
      const pending = await open(width);
      await pending.page.waitForSelector('.loading-surface .constructed-matchup-ledger li');
      await settle(pending.page);
      const pendingHeader = await height(pending.page, '.archetype-dossier');
      const pendingParts = await paidParts(pending.page, LOADING);
      // The history arrives: the change lines fill the room the header kept for them.
      const before = await cls(pending.page);
      release();
      await pending.page.waitForSelector('.archetype-dossier .ui-kpi-group__delta');
      await settle(pending.page);
      const memberHeader = await height(pending.page, '.archetype-dossier');
      const historyShift = Math.round((await cls(pending.page) - before) * 10_000) / 10_000;
      await pending.close();
      assert.equal(guestHeader, memberHeader, `${width}px: the guest's header is the subscriber's`);
      assert.equal(pendingHeader, memberHeader, `${width}px: the header keeps the change's room until the history arrives`);
      assert.ok(historyShift < 0.001, `${width}px: the history arriving shifts the page by ${historyShift}`);
      for (const [index, part] of guestParts.entries()) {
        const skeleton = pendingParts[index];
        assert.ok(part && skeleton && Math.abs(part[0] - skeleton[0]) <= 2 && Math.abs(part[1] - skeleton[1]) <= 2,
          `${width}px: locked part ${index} spans ${part}, its loading skeleton ${skeleton}`);
      }

      // A subscriber whose paid list of builds is the open one, or differs from it: the tiles stay where they are.
      for (const paidOnly of [false, true]) {
        Object.assign(state, { member: true, paidOnly }); state.hold.clear();
        const member = await open(width);
        await member.page.waitForSelector('.archetype-history');
        // The paid answer is in: its list counts the build the open page lacked.
        await member.page.waitForFunction(count => document.querySelector('.archetype-builds .archetype-section-heading__count')?.textContent === count,
          {}, `${paidOnly ? 13 : 12} сборок`);
        await settle(member.page);
        const shift = await cls(member.page);
        const tiles = await member.page.$$eval('.archetype-builds button[data-deck-code]', nodes => nodes.map(node => node.getAttribute('data-deck-code')));
        await member.close();
        assert.ok(shift < 0.01, `${width}px, the paid list ${paidOnly ? 'differs from' : 'is'} the open one: CLS ${shift}`);
        assert.deepEqual(tiles, OPEN.slice(0, 8).map(build => build.deckCode), `${width}px: every tile keeps its build`);
      }
    }
  } finally {
    release();
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway);
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    await closeLocal(legacy);
  }
});
