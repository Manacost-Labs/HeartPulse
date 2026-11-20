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
// Both sides of every width where a paid section's skeleton changes its layout (1120: history, 980: analysis, 820: all).
const THRESHOLDS = [1121, 1120, 981, 980, 821, 820];
// The subscriber's full list of a build and its paid numbers, which a lost access must take off the page at once.
const SENTINEL_CARD = 'СЕНТИНЕЛ-карта';
const SENTINEL_SIDEBOARD = 'Доп. карты';
const SENTINEL_GAMES = 97531;

/**
 * The Next build with a fixture Express behind the public gateway. `state` steers the fixture: the viewer, the paid list
 * of builds, the sections held back (answered by `release()`), a refusal of the paid sections and the paid full lists.
 */
async function startStand() {
  const state = { member: false, paidOnly: false, hold: new Set(), deny: 0, sentinel: false };
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
      const section = url.searchParams.get('section');
      const answer = () => {
        if (response.destroyed) return;
        if (!state.member) { response.writeHead(403).end('{"error":"denied"}'); return; }
        if (state.deny && section !== 'core') { response.writeHead(state.deny).end('{"error":"access revoked"}'); return; }
        if (section === 'core') {
          const builds = OPEN.map(({ cards: _cards, ...build }) => ({ ...build, games: state.sentinel ? SENTINEL_GAMES : build.games, sourceUrl: '', classKey: 'warlock' }));
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
      // The full list of a build: its open list (the tiles keep their content, only the list of builds may differ), or
      // with `sentinel` a card and a sideboard the open list never has.
      const card = (card, index) => ({ id: card.id, dbfId: index + 1, name: card.name, cost: card.cost, rarity: 'COMMON', elite: false, count: card.count, image: '' });
      const extra = { id: 'TST_PAID', name: SENTINEL_CARD, cost: 2, count: 1 };
      send({ ok: true, cards: (state.sentinel ? [...CARDS, extra] : CARDS).map(card), totalCards: state.sentinel ? 4 : 3, deckSizeLimit: 30,
        sideboards: state.sentinel ? [{ keyCardDbfId: 1, label: SENTINEL_SIDEBOARD, cards: [card({ ...extra, id: 'TST_SIDE' }, 9)] }] : [] });
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
  const close = async () => {
    release();
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway);
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    await closeLocal(legacy);
  };
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
    /**
     * A fresh page that sums the layout shifts not caused by input from its first frame; `before` runs in every
     * document before the page's own scripts.
     */
    const open = async (width, before = () => undefined, argument = null) => {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport({ width, height: 900 });
      await page.evaluateOnNewDocument(() => {
        window.__cls = 0;
        new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value; })
          .observe({ type: 'layout-shift', buffered: true });
      });
      await page.evaluateOnNewDocument(before, argument);
      await page.goto(`${origin}${PATH}`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts.ready);
      return { page, close: () => context.close() };
    };
    return { state, release, open, close };
  } catch (error) {
    await close();
    throw error;
  }
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
/** What of a locked frame does not fit in it (heading, lock area, lock), and whether the page scrolls sideways. */
const overflow = page => page.evaluate(() => [
  ...[...document.querySelectorAll('[data-paid-frame]')].flatMap(frame => {
    const box = frame.getBoundingClientRect();
    return [...frame.querySelectorAll('header, .archetype-paid-frame__body, .paid-lock')].filter(node => {
      const inner = node.getBoundingClientRect();
      return inner.top < box.top - 0.5 || inner.bottom > box.bottom + 0.5 || inner.left < box.left - 0.5 || inner.right > box.right + 0.5;
    }).map(node => `${frame.dataset.paidFrame}: ${node.className || node.tagName}`);
  }),
  ...(document.documentElement.scrollWidth > innerWidth ? ['the page scrolls sideways'] : []),
]);

/** The guest's locked parts and the subscriber's loading skeletons at one width. */
async function lockedAndLoading(stand, width) {
  Object.assign(stand.state, { member: false, paidOnly: false, deny: 0, sentinel: false }); stand.state.hold.clear();
  const guest = await stand.open(width);
  await guest.page.waitForSelector('[data-paid-frame="history"]');
  await settle(guest.page);
  const locked = { header: await height(guest.page, '.archetype-dossier'), parts: await paidParts(guest.page, LOCKED), overflow: await overflow(guest.page),
    trendLocks: await guest.page.$$eval('.archetype-dossier .paid-lock', nodes => nodes.length) };
  await guest.close();
  Object.assign(stand.state, { member: true }); stand.state.hold = new Set(['analysis', 'ranks', 'history']);
  const pending = await stand.open(width);
  await pending.page.waitForSelector('.loading-surface .constructed-matchup-ledger li');
  await settle(pending.page);
  const loading = { header: await height(pending.page, '.archetype-dossier'), parts: await paidParts(pending.page, LOADING) };
  return { locked, loading, pending };
}

function assertSameParts(width, locked, loading) {
  assert.deepEqual(locked.overflow, [], `${width}px: every locked frame holds its heading and lock`);
  for (const [index, part] of locked.parts.entries()) {
    const skeleton = loading.parts[index];
    assert.ok(part && skeleton && Math.abs(part[0] - skeleton[0]) <= 2 && Math.abs(part[1] - skeleton[1]) <= 2,
      `${width}px: locked part ${index} spans ${part}, its loading skeleton ${skeleton}`);
  }
}

test('the archetype page keeps its geometry from guest to subscriber and while the paid answers arrive', { timeout: 300_000 }, async () => {
  const stand = await startStand();
  const { state } = stand;
  try {
    for (const width of WIDTHS) {
      const { locked, loading, pending } = await lockedAndLoading(stand, width);
      assert.equal(locked.trendLocks, 3, `${width}px: a lock in place of each trend`);
      assertSameParts(width, locked, loading);
      // The history arrives: the change lines fill the room the header kept for them.
      const before = await cls(pending.page);
      stand.release();
      await pending.page.waitForSelector('.archetype-dossier .ui-kpi-group__delta');
      await settle(pending.page);
      const memberHeader = await height(pending.page, '.archetype-dossier');
      const historyShift = Math.round((await cls(pending.page) - before) * 10_000) / 10_000;
      await pending.close();
      assert.equal(locked.header, memberHeader, `${width}px: the guest's header is the subscriber's`);
      assert.equal(loading.header, memberHeader, `${width}px: the header keeps the change's room until the history arrives`);
      assert.ok(historyShift < 0.001, `${width}px: the history arriving shifts the page by ${historyShift}`);

      // A subscriber whose paid list of builds is the open one, or differs from it: the tiles stay where they are.
      for (const paidOnly of [false, true]) {
        Object.assign(state, { member: true, paidOnly }); state.hold.clear();
        const member = await stand.open(width);
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
    // On both sides of each layout change of the skeletons the locked frames still stand where the skeletons will.
    for (const width of THRESHOLDS) {
      const { locked, loading, pending } = await lockedAndLoading(stand, width);
      await pending.close();
      assertSameParts(width, locked, loading);
    }
    // A narrow phone with the text enlarged: the frames grow with their content, nothing is cut or pushes the page wider.
    Object.assign(state, { member: false }); state.hold.clear();
    const large = await stand.open(320);
    await large.page.waitForSelector('[data-paid-frame="history"]');
    await large.page.evaluate(() => { document.documentElement.style.fontSize = '125%'; });
    await settle(large.page);
    assert.deepEqual(await overflow(large.page), [], '320px with 125% text: every locked frame holds its heading and lock');
    await large.close();
  } finally {
    await stand.close();
  }
});

test('a subscriber who loses access without a reload never sees the paid full lists again, not for one frame', { timeout: 300_000 }, async () => {
  const stand = await startStand();
  const { state } = stand;
  try {
    for (const layout of ['tiles', 'rows', 'images']) {
      for (const loss of [403, 401, 'session']) {
        Object.assign(state, { member: true, paidOnly: false, deny: 0, sentinel: true }); state.hold = new Set(['ranks']);
        // Every DOM change and every frame after the loss (the «access changed» line, or the locks back) is checked
        // for the paid full list (its card and sideboard, hidden ones included) and the paid numbers.
        const view = await stand.open(1440, ([card, sideboard, games]) => {
          window.__paidAfterLoss = [];
          const paidGames = new RegExp(`${games.slice(0, 2)}\\D?${games.slice(2)}`);
          const check = when => {
            const body = document.body;
            if (!body || !(body.textContent.includes('Доступ изменился') || document.querySelector('[data-paid-frame]'))) return;
            if (body.innerHTML.includes(card) || body.innerHTML.includes(sideboard) || paidGames.test(body.textContent)) window.__paidAfterLoss.push(when);
          };
          new MutationObserver(() => check('dom')).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
          const frame = () => { check('frame'); requestAnimationFrame(frame); };
          requestAnimationFrame(frame);
        }, [SENTINEL_CARD, SENTINEL_SIDEBOARD, String(SENTINEL_GAMES)]);
        const { page } = view;
        const label = `${layout}, ${loss}`;
        const paidList = (selector, text) => page.waitForFunction((where, what) => document.querySelector(where)?.innerHTML.includes(what),
          { timeout: 15_000 }, selector, text);
        // The subscriber's gallery shows the full list (its extra card and sideboard) and the paid numbers, then the reader
        // picks the layout: rows draw the sideboard as a group of portraits, images keep the list under the picture.
        await paidList('.archetype-builds', SENTINEL_CARD);
        await page.waitForFunction(() => /97\D?531/.test(document.querySelector('.archetype-builds')?.textContent ?? ''));
        if (layout !== 'tiles') {
          await page.$$eval('.archetype-builds .fun-decks-layout button', (nodes, name) => nodes.find(node => node.textContent.trim() === name)?.click(),
            layout === 'rows' ? 'Строки' : 'Картинки');
          await paidList(layout === 'rows' ? '.archetype-builds .fun-deck-rowcard' : '.archetype-builds .archetype-deck-card', layout === 'rows' ? SENTINEL_SIDEBOARD : SENTINEL_CARD);
        }
        const tile = await page.$('.archetype-builds article');
        if (loss === 'session') {
          // The session ends elsewhere; the page hears of it when it is shown again (a page restored from the back-forward cache).
          state.member = false;
          await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
          await page.waitForSelector('[data-paid-frame]');
        } else {
          state.deny = loss;
          stand.release();
          await page.waitForFunction(() => document.body.textContent.includes('Доступ изменился'));
        }
        await settle(page);
        const after = await page.evaluate(([card, sideboard]) => ({
          paid: window.__paidAfterLoss,
          dom: document.body.innerHTML.includes(card) || document.body.innerHTML.includes(sideboard) || /97\D?531/.test(document.body.textContent),
          open: document.querySelector('.archetype-builds')?.innerHTML.includes('Тестовый удар') && /3\D?000/.test(document.querySelector('.archetype-builds')?.textContent ?? ''),
        }), [SENTINEL_CARD, SENTINEL_SIDEBOARD]);
        // A refused section takes the access away in place: the tiles stay the same nodes, back on the open list.
        const sameTile = loss === 'session' ? null : await page.evaluate(node => node.isConnected && node === document.querySelector('.archetype-builds article'), tile);
        state.hold.clear(); stand.release();
        await view.close();
        assert.deepEqual(after.paid, [], `${label}: no DOM change or frame after the loss holds paid data`);
        assert.equal(after.dom, false, `${label}: no paid data in the DOM`);
        assert.equal(after.open, true, `${label}: the tiles show the open list and numbers`);
        if (sameTile !== null) assert.equal(sameTile, true, `${label}: the tile is not remounted`);
      }
    }
  } finally {
    await stand.close();
  }
});
