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

// Regression (issue 694): a subscriber's archetype gallery draws the open lists from the server's HTML, then takes
// each build's full list (`/api/deck/resolve`) as the build comes near. The open lists carry the sideboards of the
// codes (the E.T.C. band, Zilliax's modules), so the full lists add no line and the gallery does not move while the
// reader scrolls through it. A Wild highlander archetype like `xl-hl-igneous-warrior`: 40 cards a build.
const PATH = '/standard/archetypes/wild/xl-band-warrior/';
const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const deckOf = index => `AAEBAQcG${'ABCDEFGH'[index]}KiBALxogTzogQAAQXzogSB8QTzogTyogSK8QSB8QSL8QSC8QSM8QSC8QQAAA==`;
const ETC = { id: 'ETC_080', name: 'Э.Т.Ц., менеджер группы', cost: 3, rarity: 'LEGENDARY', count: 1, hasPage: true };
const ZILLIAX = { id: 'TOY_330', name: 'Зиллиакс Делюкс 3000', cost: 0, rarity: 'LEGENDARY', count: 1, hasPage: true };
const FILLER = Array.from({ length: 38 }, (_, index) => ({ id: `TST_${100 + index}`, name: `Тестовая карта ${index + 1}`,
  cost: 1 + (index % 8), rarity: 'COMMON', count: 1, hasPage: true }));
const CARDS = [ZILLIAX, ...FILLER, ETC];
const BAND = [{ id: 'CORE_CFM_790', name: 'Гитарист группы', cost: 2, rarity: 'RARE', count: 1, hasPage: true },
  { id: 'LOOT_516', name: 'Барабанщица группы', cost: 3, rarity: 'EPIC', count: 1, hasPage: true },
  { id: 'TID_714', name: 'Певец группы', cost: 4, rarity: 'LEGENDARY', count: 1, hasPage: true }];
const MODULES = [{ id: 'TOY_330t11', name: 'Зиллиакс Делюкс 3000', cost: 0, rarity: 'LEGENDARY', count: 1, hasPage: false },
  { id: 'TOY_330t97', name: 'Ядерный модуль', cost: 3, rarity: 'COMMON', count: 1, hasPage: false },
  { id: 'TOY_330t99', name: 'Модуль-клинок', cost: 2, rarity: 'COMMON', count: 1, hasPage: false }];
const SIDEBOARDS = [{ keyId: ETC.id, cards: BAND }, { keyId: ZILLIAX.id, cards: MODULES }];
// Eight builds, a page. Six carry the band and the modules; two carry none. The full list of `RENAMED` names one
// card otherwise than the open list (as `TIME_609` / `TIME_609t2` of `n-zoth-mech-hunter`): the same number of lines.
const RENAMED = 2;
const RENAMED_NAME = 'Посвященный следопыт Вериса';
const OPEN = Array.from({ length: 8 }, (_, index) => ({ deckCode: deckOf(index), games: 3000 - index * 10, winrate: 55.5,
  updatedAt: '2026-11-19T00:00:00.000Z', sampleRank: 'all', samplePeriod: 'past_week', cards: CARDS,
  ...(index < 6 ? { sideboards: SIDEBOARDS } : {}) }));
const item = { slug: 'xl-band-warrior', archetype: 'XL Band Warrior', archetypeLabel: 'XL Воин группы', translated: true, classKey: 'warrior',
  format: 'wild', games: 14800, winrate: 61.2, popularity: 20.4, turns: 7.9, durationMinutes: 8, climbingSpeed: 1.24, deckCount: OPEN.length,
  sourceUrl: 'https://www.hsguru.com/meta' };
const base = { format: 'wild', formatLabel: 'Вольный', patch: '36.0.3', minimumGames: 50, updatedAt: '2026-11-19T12:00:00.000Z' };
const teaser = { ...base, item: { ...item, builds: OPEN }, featuredBuild: null, buildsTotal: OPEN.length, buildsOffset: 0, nextOffset: null };
const placeholder = readFileSync(new URL('../public/arena-logo-icon.webp', import.meta.url));
const LAYOUTS = [['tiles', 'Плитки'], ['rows', 'Строки'], ['images', 'Картинки']];
const WIDTHS = [390, 1440];
const DELAYS = [0, 300, 1200];

/** The full list of a build as `/api/deck/resolve` gives it: the open lines with their dbf ids, rarities and sideboards. */
function fullDeck(code) {
  const index = OPEN.findIndex(build => build.deckCode === code);
  const build = OPEN[Math.max(index, 0)];
  const dbfOf = id => 90_000 + [...CARDS, ...BAND, ...MODULES].findIndex(card => card.id === id);
  const resolved = card => ({ id: card.id, dbfId: dbfOf(card.id), name: card.name, cost: card.cost, rarity: card.rarity,
    elite: card.rarity === 'LEGENDARY', count: card.count, image: '' });
  const cards = build.cards.map(card => (index === RENAMED && card.id === 'TST_100' ? { ...resolved(card), id: 'TIME_609t2', name: RENAMED_NAME } : resolved(card)));
  const sideboards = (build.sideboards ?? []).map(board => {
    const key = resolved(CARDS.find(card => card.id === board.keyId));
    return { keyCardDbfId: key.dbfId, label: key.name, keyCard: key, cards: board.cards.map(resolved) };
  });
  return { ok: true, format: 'wild', heroDbfId: 7, deckCode: code, cards, sideboards, totalCards: 40, deckSizeLimit: 40, archetype: null };
}

/** The Next build with a fixture Express behind the public gateway; `state` sets the viewer and the wait of each full list. */
async function startStand() {
  const state = { member: false, resolveDelay: 0, resolves: 0, inFlight: 0 };
  const legacy = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const url = new URL(request.url, 'http://fixture');
    const { pathname } = url;
    const send = body => response.end(JSON.stringify(body));
    if (pathname === `/api/constructed-archetypes/teaser/wild/${item.slug}`) { send(teaser); return; }
    if (pathname === '/api/constructed-archetypes/teaser') { send({ ...base, coverage: {}, items: [{ ...item, builds: [] }] }); return; }
    if (pathname.startsWith('/api/constructed-archetypes/teaser/')) { response.writeHead(404).end('{"error":"missing"}'); return; }
    if (pathname === `/api/constructed-archetypes/wild/${item.slug}`) {
      if (!state.member) { response.writeHead(403).end('{"error":"denied"}'); return; }
      const section = url.searchParams.get('section');
      if (section === 'core') {
        send({ ...base, item: { ...item, builds: OPEN.map(({ cards: _cards, sideboards: _boards, ...build }) => ({ ...build, sourceUrl: '', classKey: 'warrior' })) },
          history: [], analysis: null, featuredBuild: null });
      } else if (section === 'history') send({ history: [] });
      else if (section === 'ranks') send({ ranks: { ranks: [], periods: [], cells: [], updatedAt: null } });
      else send({ analysis: null });
      return;
    }
    if (pathname === '/api/constructed-archetype-stats') { response.writeHead(404).end('{"error":"missing"}'); return; }
    if (pathname === '/api/subscription/status') { send({ hasAccess: state.member, active: state.member, entitlements: { standard: state.member, wild: state.member } }); return; }
    if (pathname === '/api/auth/me') {
      send(state.member ? { user: { id: 'test-member', name: 'Тест', email: 'member@example.test', role: 'user', adminAllowed: false } }
        : { user: null, adminAllowed: false, contestAdminAllowed: false });
      return;
    }
    if (pathname === '/api/deck/render') { send({ ok: true, ready: true, imageUrl: '/arena-logo-icon.webp', renderer: 'rust', style: 'parchment' }); return; }
    if (pathname === '/api/deck/resolve') {
      state.resolves += 1; state.inFlight += 1;
      setTimeout(() => { state.inFlight -= 1; if (!response.destroyed) send(fullDeck(url.searchParams.get('code'))); }, state.resolveDelay);
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
     * A fresh page in `layout` (kept in this browser) that sums, from its first frame, the layout shifts not caused by
     * input that move something of the gallery (`.archetype-builds`). A shift elsewhere (the archetype's header as a
     * loaded runner lays it out, see PR 698) is recorded with its sources but is not this gallery's.
     */
    const open = async (width, layout) => {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport({ width, height: 900 });
      // `CPU_THROTTLE=4`: a slow machine, as a loaded CI runner (the timings of hydration and of the full lists move).
      if (process.env.CPU_THROTTLE) await page.emulateCPUThrottling(Number(process.env.CPU_THROTTLE));
      await page.evaluateOnNewDocument(kept => {
        try { localStorage.setItem('hp:deck-layout', kept); } catch { /* the default view */ }
        window.__cls = 0;
        // Every shift with what moved (a selector of each node, its box before and after), printed when a check fails.
        window.__shifts = [];
        const inGallery = node => Boolean(node && document.querySelector('.archetype-builds')?.contains(node));
        const selectorOf = node => {
          const parts = [];
          for (let at = node instanceof Element ? node : node?.parentElement; at && at !== document.body && parts.length < 5; at = at.parentElement) {
            parts.unshift(`${at.tagName.toLowerCase()}${at.id ? `#${at.id}` : ''}${typeof at.className === 'string' && at.className.trim()
              ? `.${at.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`);
          }
          return parts.join(' > ') || String(node?.nodeName);
        };
        const box = rect => rect && [rect.x, rect.y, rect.width, rect.height].map(Math.round).join(',');
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (entry.hadRecentInput) continue;
            const gallery = (entry.sources ?? []).some(source => inGallery(source.node));
            if (gallery) window.__cls += entry.value;
            window.__shifts.push({ at: Math.round(entry.startTime), value: Math.round(entry.value * 10_000) / 10_000, gallery, scrollY: Math.round(scrollY),
              sources: (entry.sources ?? []).map(source => ({ node: selectorOf(source.node), from: box(source.previousRect), to: box(source.currentRect) })) });
          }
        }).observe({ type: 'layout-shift', buffered: true });
      }, layout);
      await page.goto(`${origin}${PATH}`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts.ready);
      return { page, close: () => context.close() };
    };
    const html = async userAgent => (await fetch(`${origin}${PATH}`, { headers: { 'User-Agent': userAgent } })).text();
    return { state, open, html, close };
  } catch (error) {
    await close();
    throw error;
  }
}

const settle = page => page.evaluate(() => new Promise(resolve => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 400)));
/** The layout shift of the gallery since the first frame (see `open`). */
const cls = page => page.evaluate(() => Math.round(window.__cls * 10_000) / 10_000);
/** The shifts of the page and what moved in each, for a failure message. */
const shifts = page => page.evaluate(() => JSON.stringify(window.__shifts));
const ARTICLES = '.archetype-builds article';
/**
 * The builds of the gallery in `layout`, once the page has hydrated and draws them in that view (the server's tiles
 * are in the HTML before the page watches them come near).
 */
const galleryIn = (page, layout) => page.waitForFunction(kind => {
  const selector = { tiles: '.fun-deck-tiles', rows: '.fun-deck-rowcard', images: '.archetype-deck-card' }[kind];
  const builds = document.querySelectorAll(`.archetype-builds ${selector}`);
  return builds.length === 8 && Object.keys(builds[0]).some(key => key.startsWith('__reactFiber'));
}, { timeout: 20_000 }, layout);
/** Every build in the centre of the screen in turn, a step of 250 ms, as a reader scrolls the gallery. */
async function scrollGallery(page) {
  for (const build of await page.$$(ARTICLES)) {
    await build.evaluate(node => node.scrollIntoView({ block: 'center' }));
    await delay(250);
  }
}
async function fullListsIn(stand, page, at) {
  for (let attempt = 0; attempt < 300 && (stand.state.resolves < 8 || stand.state.inFlight > 0); attempt++) await delay(50);
  assert.ok(stand.state.resolves >= 8 && stand.state.inFlight === 0, `${at}: every full list is read (${stand.state.resolves} read, ${stand.state.inFlight} waiting)`);
  await page.waitForFunction(name => document.querySelector('.archetype-builds')?.innerHTML.includes(name), { timeout: 10_000 }, RENAMED_NAME);
  await settle(page);
}

test('a subscriber\'s full lists with sideboards replace the open ones without moving the gallery', { timeout: 600_000 }, async () => {
  const stand = await startStand();
  try {
    for (const [layout, label] of LAYOUTS) {
      for (const width of WIDTHS) {
        for (const resolveDelay of DELAYS) {
          const at = `${label}, ${width}px, resolve ${resolveDelay} ms`;
          Object.assign(stand.state, { member: true, resolveDelay, resolves: 0, inFlight: 0 });
          const view = await stand.open(width, layout);
          await galleryIn(view.page, layout);
          await scrollGallery(view.page);
          await fullListsIn(stand, view.page, at);
          const shift = await cls(view.page);
          const moved = await shifts(view.page);
          // The tiles print a sideboard's heading, the rows give it to the group of portraits as its title.
          const markup = await view.page.$eval('.archetype-builds', node => node.innerHTML);
          await view.close();
          assert.ok(shift < 0.01, `${at}: the full lists replace the open ones in place (CLS ${shift}): ${moved}`);
          if (layout !== 'images') assert.match(markup, /Группа E\.T\.C\.[\s\S]*Модули Зиллиакса|Модули Зиллиакса[\s\S]*Группа E\.T\.C\./, `${at}: the sideboards are drawn`);
        }
      }
    }
  } finally {
    await stand.close();
  }
});

test('the open lists already have every line the full lists have: no build changes its height', { timeout: 300_000 }, async () => {
  const stand = await startStand();
  try {
    for (const [layout, label] of LAYOUTS) {
      for (const width of WIDTHS) {
        Object.assign(stand.state, { member: true, resolveDelay: 0, resolves: 0, inFlight: 0 });
        const view = await stand.open(width, layout);
        await galleryIn(view.page, layout);
        await settle(view.page);
        const heights = () => view.page.$$eval(ARTICLES, nodes => nodes.map(node => Math.round(node.getBoundingClientRect().height)));
        const before = await heights();
        await scrollGallery(view.page);
        await fullListsIn(stand, view.page, `${label}, ${width}px`);
        const after = await heights();
        await view.close();
        assert.deepEqual(after, before, `${label}, ${width}px: each build keeps its height when its full list arrives`);
      }
    }
  } finally {
    await stand.close();
  }
});

test('a guest sees the sideboards of the open lists, reads no full list, and gets the robot\'s HTML', { timeout: 300_000 }, async () => {
  const stand = await startStand();
  try {
    Object.assign(stand.state, { member: false, resolveDelay: 0, resolves: 0, inFlight: 0 });
    // Resource hints follow the order the render finishes in, which varies between requests: they are not content.
    const content = text => text.replace(/<link rel="preload"[^>]*\/>/g, '');
    // Compare only after two identical copies in a row: the first copy of the page streams while it is generated.
    let guestHtml = await stand.html(BROWSER_UA);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const again = await stand.html(BROWSER_UA);
      if (content(again) === content(guestHtml)) break;
      guestHtml = again;
      await delay(300);
    }
    assert.equal(content(await stand.html(GOOGLEBOT_UA)), content(guestHtml), 'Googlebot gets the guest HTML');
    // The server's tiles already hold the band and the modules of the six builds that have them.
    assert.equal(guestHtml.match(/<span>Группа E\.T\.C\.<\/span>/g)?.length, 6, 'the band of each build with one is in the HTML');
    assert.equal(guestHtml.match(/<span>Модули Зиллиакса<\/span>/g)?.length, 6, 'the modules of each build with them are in the HTML');
    for (const [layout, label] of LAYOUTS) {
      for (const width of WIDTHS) {
        const view = await stand.open(width, layout);
        await galleryIn(view.page, layout);
        await scrollGallery(view.page);
        await settle(view.page);
        const shift = await cls(view.page);
        const moved = await shifts(view.page);
        const markup = await view.page.$eval('.archetype-builds', node => node.innerHTML);
        await view.close();
        assert.ok(shift < 0.01, `guest, ${label}, ${width}px: CLS ${shift}: ${moved}`);
        if (layout !== 'images') assert.match(markup, /Группа E\.T\.C\.[\s\S]*Модули Зиллиакса|Модули Зиллиакса[\s\S]*Группа E\.T\.C\./, `guest, ${label}: the sideboards are drawn`);
      }
    }
    assert.equal(stand.state.resolves, 0, 'no full list is read for a guest');
  } finally {
    await stand.close();
  }
});
