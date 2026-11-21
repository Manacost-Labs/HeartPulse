import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { DATA_PAGES, hasMarker, visibleText } from '../scripts/lib/post-deploy-data-pages.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

// /standard/fun-decks/ (#675) in a real browser against an Express stub. A guest, Googlebot, YandexBot and a
// subscriber get one page: the subscriber's deck tiles, drawn on the server from the open answer (#566: the whole
// selection is open, so nothing is locked). The geometry is the same for a guest and a subscriber at 1440 and 390 px,
// the full deck lists replace the open ones in place (CLS < 0.01), and a refused answer (401/403), a lost session or a
// page restored from the back-forward cache never leave a frame without the decks or with a lock or an error.
// Every frame is watched from the first one the browser draws; the scenarios with held answers also get the HTML in
// small pieces with pauses, so the browser paints the page while it is still parsing it.

const READER = { id: 'fd-reader', email: 'reader@example.test', name: 'Подписчик', role: 'user' };
const SUBSCRIBER = { hasAccess: true, entitlements: { arena: true, standard: true }, source: 'boosty', checkedAt: null,
  stale: false, message: '', boosty: { checked: true, hasAccess: true }, patreon: {}, telegram: {} };
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const YANDEXBOT_UA = 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)';
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const SECTION = 'section[aria-label="Подборка фан-колод"]';
const BARE = 'https://hearthpulse.net/standard/fun-decks/';

const CARDS = [
  { id: 'FIX_ONE', name: 'Первая карта', cost: 1, count: 2, hasPage: true },
  { id: 'FIX_TWO', name: 'Вторая карта', cost: 2, count: 2, hasPage: true },
  { id: 'FIX_THREE', name: 'Третья карта', cost: 4, count: 1, hasPage: true },
];
// The two newest decks carry sideboards the code holds: the E.T.C. band and Zilliax's two modules with its cosmetic.
const ETC = { id: 'ETC_080', name: 'Э.Т.Ц., менеджер группы', cost: 3, count: 1, hasPage: true };
const ETC_BAND = [
  { id: 'FIX_BAND_A', name: 'Гитарист группы', cost: 2, count: 1, hasPage: true },
  { id: 'FIX_BAND_B', name: 'Барабанщик группы', cost: 4, count: 1, hasPage: true },
  { id: 'FIX_BAND_C', name: 'Солист группы', cost: 6, count: 1, hasPage: true },
];
const ZILLIAX = { id: 'TOY_330', name: 'Зиллиакс Делюкс 3000', cost: 0, count: 1, hasPage: true };
const ZILLIAX_MODULES = [
  { id: 'TOY_330t92', name: 'Модуль: ремонт', cost: 2, count: 1, hasPage: false },
  { id: 'TOY_330t95', name: 'Модуль: перегрев', cost: 3, count: 1, hasPage: false },
  { id: 'TOY_330t5', name: 'Корпус Зиллиакса', cost: 0, count: 1, hasPage: false },
];
// 24 decks, as in production on 2026-11-21: [number, format, class, fun index, win rate, first seen]. The rows are the
// data; every deck also has the same reasons, 1 240 games, 28% likeness to the meta and the three cards above.
const DECK_TABLE = [
  [1, 'Standard', 'mage', 0.5, 57.7, '2026-10-30'],
  [2, 'Standard', 'priest', 0.55, 53.4, '2026-10-29'],
  [3, 'Standard', 'warrior', 0.6, 49.1, '2026-10-28'],
  [4, 'Standard', 'rogue', 0.65, 61.3, '2026-10-27'],
  [5, 'Wild', 'druid', 0.7, 50, '2026-10-26'],
  [6, 'Standard', 'hunter', 0.75, 44.8, '2026-10-25'],
  [7, 'Standard', 'paladin', 0.8, 52.3, '2026-10-24'],
  [8, 'Standard', 'shaman', 0.5, 58.9, '2026-10-23'],
  [9, 'Standard', 'warlock', 0.55, 47.6, '2026-10-22'],
  [10, 'Wild', 'demonhunter', 0.6, 55.5, '2026-10-21'],
  [11, 'Standard', 'deathknight', 0.65, 51.2, '2026-10-20'],
  [12, 'Standard', 'mage', 0.7, 56.7, '2026-10-19'],
  [13, 'Standard', 'priest', 0.75, 62.4, '2026-10-18'],
  [14, 'Standard', 'warrior', 0.8, 48.3, '2026-10-17'],
  [15, 'Wild', 'rogue', 0.5, 54.1, '2026-10-16'],
  [16, 'Standard', 'druid', 0.55, 59.9, '2026-10-15'],
  [17, 'Standard', 'hunter', 0.6, 46.2, '2026-10-14'],
  [18, 'Standard', 'paladin', 0.65, 53.8, '2026-10-13'],
  [19, 'Standard', 'shaman', 0.7, 50.6, '2026-10-12'],
  [20, 'Wild', 'warlock', 0.75, 57.2, '2026-10-11'],
  [21, 'Standard', 'demonhunter', 0.8, 49.9, '2026-10-10'],
  [22, 'Standard', 'deathknight', 0.5, 52.7, '2026-10-09'],
  [23, 'Standard', 'mage', 0.55, 60.3, '2026-10-08'],
  [24, 'Standard', 'priest', 0.6, 45.5, '2026-10-07'],
];
const EXTRAS = {
  1: { streamer: 'Стример Фикстуры', cards: [...CARDS, ETC], sideboards: [{ keyId: ETC.id, cards: ETC_BAND }] },
  2: { cards: [...CARDS, ZILLIAX], sideboards: [{ keyId: ZILLIAX.id, cards: ZILLIAX_MODULES }] },
};
// The answer also carries fields outside the page's allowlist (an internal source id, an admin note): not open fields.
const DECKS = DECK_TABLE.map(([number, format, className, funScore, winRate, firstSeen]) => ({
  title: `Фан-колода ${number}`, deckCode: `FUN_DECK_${number}`, format, className, streamer: null, kind: 'brew',
  funScore, maxMetaSimilarity: 0.28, nearestArchetype: null, winRate, winRateCiLow: 44, winRateCiHigh: 66,
  games: 1240, reasons: [], why: ['Хайлендер', 'Концепт'], tags: ['highlander', 'concept'], url: null,
  firstSeenAt: `${firstSeen}T10:00:00.000Z`, lastSeenAt: null, cards: CARDS,
  candidateSourceId: 'SENTINEL_SOURCE_ID', moderationNote: 'SENTINEL_ADMIN_NOTE',
  ...EXTRAS[number],
}));
const FUN_DECKS = {
  fetchedAt: '2026-10-31T10:00:00.000Z', stats: { total: 24, standard: 20, wild: 4 },
  methodology: { detectorVersion: 'concept-v8', minFunScore: 0.55, maxMetaSimilarity: 0.42, ladderMemberSim: 0.6 },
  decks: DECKS,
};
// The full list of a deck: the same cards and sideboards with their rarities (the open list has none).
const full = (card, dbfId, format) => ({ id: card.id, dbfId, name: card.name, cost: card.cost, count: card.count,
  rarity: 'RARE', elite: false, image: '', pagePath: card.hasPage ? `/standard/cards/${format}/${card.id}/` : null });
const resolved = (code, format) => {
  const deck = DECKS.find(item => item.deckCode === code);
  const cards = deck.cards.map((card, index) => full(card, 9000 + index, format));
  const sideboards = (deck.sideboards ?? []).map(board => {
    const key = cards.find(card => card.id === board.keyId);
    return { keyCardDbfId: key.dbfId, label: key.name, keyCard: key, cards: board.cards.map((card, index) => full(card, 9500 + index, format)) };
  });
  return { ok: true, format, heroDbfId: 637, deckCode: code, totalCards: 5, deckSizeLimit: 30, archetype: null, cards, sideboards };
};

// A 1×1 PNG: the render's box is square whatever its size.
const SQUARE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
// A slow network: the HTML goes out in pieces of this many bytes, one piece per pause.
const TRICKLE = { bytes: 12_000, pauseMs: 90 };

/** The HTML of a page answer, sent to the browser in small pieces with pauses (`TRICKLE`) and not compressed. */
function trickle(answer, response) {
  const headers = { ...answer.headers };
  delete headers['content-length'];
  response.writeHead(answer.statusCode, headers);
  let pending = Buffer.alloc(0);
  let ended = false;
  answer.on('data', chunk => { pending = Buffer.concat([pending, chunk]); });
  answer.on('end', () => { ended = true; });
  const pump = () => {
    if (pending.length) {
      response.write(pending.subarray(0, TRICKLE.bytes));
      pending = pending.subarray(TRICKLE.bytes);
    }
    if (ended && !pending.length) return void response.end();
    setTimeout(pump, TRICKLE.pauseMs);
  };
  pump();
}

async function startStack() {
  // `refusal`: what the browser's read of the selection gets (the server's read always gets the selection).
  // `funDelay`, `resolveDelay`: how long the browser waits for the selection and for each full deck list.
  // `slowHtml`: the page's HTML arrives in pieces (`trickle`).
  const state = { next: null, refusal: 0, browserReads: 0, resolveReads: 0, funDelay: 0, resolveDelay: 0, slowHtml: false };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://stack');
    const reader = /(?:^|;\s*)fd_session=reader/.test(request.headers.cookie ?? '');
    const browser = /Chrome\//.test(request.headers['user-agent'] ?? '');
    const json = (code, payload) => response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' })
      .end(JSON.stringify(payload));
    if (url.pathname === '/api/auth/me') return json(200, { user: reader ? READER : null });
    if (url.pathname === '/api/subscription/status' || url.pathname === '/api/subscription/refresh') {
      return reader ? json(200, SUBSCRIBER) : json(401, { error: 'guest' });
    }
    if (url.pathname === '/api/fun-decks') {
      if (!browser) return json(200, FUN_DECKS);
      state.browserReads += 1;
      return void setTimeout(() => (state.refusal ? json(state.refusal, { error: 'refused' }) : json(200, FUN_DECKS)), state.funDelay);
    }
    if (url.pathname === '/api/deck/resolve') {
      state.resolveReads += 1;
      return void setTimeout(() => json(200, resolved(url.searchParams.get('code'), url.searchParams.get('format'))), state.resolveDelay);
    }
    // The «Картинки» view: the deck's picture, as production serves it (a square render), so its box is the real one.
    if (url.pathname === '/api/deck/render') return json(200, { ok: true, ready: true, imageUrl: '/fixture/deck-render.png' });
    if (url.pathname === '/fixture/deck-render.png') return void response.writeHead(200, { 'Content-Type': 'image/png' }).end(SQUARE_PNG);
    if (url.pathname.startsWith('/api/')) return json(404, { error: 'missing' });
    const slow = state.slowHtml && browser && url.pathname === '/standard/fun-decks/';
    const headers = { ...request.headers };
    if (slow) delete headers['accept-encoding'];
    const upstream = http.request(new URL(state.next), { method: request.method, path: request.url, headers }, answer => {
      if (slow && /text\/html/.test(answer.headers['content-type'] ?? '')) return trickle(answer, response);
      response.writeHead(answer.statusCode, answer.headers);
      answer.pipe(response);
    });
    request.pipe(upstream);
  });
  const origin = await listenLocal(server);
  return Object.assign(state, { server, origin });
}

/**
 * Every frame the browser draws (requestAnimationFrame from the document's start) and every DOM change in between,
 * from the moment the page has content: how many decks the list shows and their titles in order, whether the list is
 * on screen and which view the view switch names, whether the first deck is whole (its copy button is parsed) and shows
 * its E.T.C. band, and whether anything of a paywall (a lock or an offer «по подписке», hidden nodes included) or the
 * error of the selection is in the document. The layout shifts are summed as CLS counts them.
 */
const watchFrames = () => {
  window.__frames = [];
  window.__cls = 0;
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
  }).observe({ type: 'layout-shift', buffered: true });
  const look = () => {
    const body = document.body;
    const heading = body && [...body.querySelectorAll('h1')].find(node => node.textContent === 'Фан-колоды');
    if (!heading) return;
    const section = document.querySelector('section[aria-label="Подборка фан-колод"]');
    const decks = section ? [...section.querySelectorAll(':scope > article')] : [];
    const first = decks[0];
    window.__frames.push({
      at: performance.now(),
      decks: decks.length,
      titles: decks.map(deck => deck.querySelector('h2')?.textContent ?? '').join(' | '),
      listShown: Boolean(section && decks.length && section.checkVisibility({ visibilityProperty: true })),
      view: document.querySelector('[role="group"][aria-label="Вид колод"] [aria-pressed="true"]')?.textContent ?? null,
      firstWhole: Boolean(first && [...first.querySelectorAll('button')].some(button => /Копировать код/.test(button.textContent))),
      band: /Группа E\.T\.C\./.test(first?.textContent ?? ''),
      paywall: Boolean(document.querySelector('[aria-label*="по подписке"]')) || /по подписке/i.test(body.textContent),
      error: /Подборка временно недоступна/.test(body.textContent),
    });
  };
  new MutationObserver(look).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  const loop = () => { look(); requestAnimationFrame(loop); };
  loop();
};

/** Frames since `from` (ms of the page's clock) that lose decks the page already showed, or show a paywall or the error. */
const badFrames = (page, from = 0) => page.evaluate(start => {
  let most = 0;
  return window.__frames.filter(frame => frame.at >= start).flatMap(frame => {
    const lost = frame.decks < most;
    most = Math.max(most, frame.decks);
    return lost || frame.paywall || frame.error ? [{ decks: frame.decks, paywall: frame.paywall, error: frame.error }] : [];
  });
}, from);
const lastFrame = page => page.evaluate(() => window.__frames.at(-1));

/** Each deck's box relative to the list, its title, and the list's own size. */
const geometry = page => page.$eval(SECTION, section => {
  const origin = section.getBoundingClientRect();
  const round = value => Math.round(value * 10) / 10;
  return {
    list: { width: round(origin.width), height: round(origin.height) },
    decks: [...section.querySelectorAll(':scope > article')].map(deck => {
      const box = deck.getBoundingClientRect();
      return { title: deck.querySelector('h2')?.textContent, x: round(box.left - origin.left), y: round(box.top - origin.top),
        width: round(box.width), height: round(box.height) };
    }),
  };
});

const html = async (origin, userAgent, search = '') => (await fetch(`${origin}/standard/fun-decks/${search}`, { headers: { 'User-Agent': userAgent } })).text();
// Resource hints follow the order the render finishes in, which varies between requests: they are not content.
const content = text => text.replace(/<link rel="preload"[^>]*\/>/g, '');
/** What a reader of the HTML without scripts reads, its spaces made plain. */
const readable = page => visibleText(page.replaceAll('<!-- -->', '')).replace(/\s+/g, ' ');
/** Deck titles of the server HTML, in order. */
const titlesOf = page => [...page.matchAll(/<h2 title="([^"]+)">/g)].map(match => match[1]);
const headOf = page => ({
  canonical: page.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? null,
  robots: page.match(/<meta name="robots" content="([^"]+)"/)?.[1] ?? null,
});

/**
 * A fresh browser context on the page. `scroll`: the list is below the first screen, so the reader is put on it once
 * the HTML is parsed, before the full answer and the full deck lists arrive, and any shift they cause counts.
 * `layout`: the deck view this browser keeps from an earlier visit.
 */
async function visit(browser, stack, viewport, { subscriber = false, search = '', scroll = true, layout = null } = {}) {
  const page = await (await browser.createBrowserContext()).newPage();
  await page.setViewport(viewport);
  if (subscriber) await page.setCookie({ name: 'fd_session', value: 'reader', url: stack.origin });
  if (layout) await page.evaluateOnNewDocument(kept => localStorage.setItem('hp:deck-layout', kept), layout);
  await page.evaluateOnNewDocument(watchFrames);
  if (scroll) {
    await page.evaluateOnNewDocument(list => document.addEventListener('DOMContentLoaded', () => {
      document.querySelector(list)?.scrollIntoView({ block: 'start' });
    }), SECTION);
  }
  await page.goto(`${stack.origin}/standard/fun-decks/${search}`, { waitUntil: 'networkidle0' });
  return page;
}

/** `visit`, then until the first full deck list has come and been drawn. */
async function open(browser, stack, viewport, options = {}) {
  const reads = stack.resolveReads;
  const page = await visit(browser, stack, viewport, options);
  await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('/api/deck/resolve')
    && entry.responseEnd > 0), { timeout: 15_000 });
  assert.ok(stack.resolveReads > reads, 'the full deck lists were asked');
  await delay(500);
  return page;
}

const cls = page => page.evaluate(() => window.__cls);

test('a guest, a robot and a subscriber get one fun-decks page', { timeout: 240_000 }, async () => {
  const stack = await startStack();
  const next = await startNextServer({ legacyOrigin: stack.origin });
  stack.next = next.origin;
  let browser;
  try {
    let guestHtml = await html(stack.origin, BROWSER_UA);
    // Two identical copies in a row before comparing: the first answers can still differ in their head.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const again = await html(stack.origin, BROWSER_UA);
      if (content(again) === content(guestHtml)) break;
      guestHtml = again;
      await delay(300);
    }
    assert.equal(content(await html(stack.origin, GOOGLEBOT_UA)), content(guestHtml), 'Googlebot gets the guest HTML');
    assert.equal(content(await html(stack.origin, YANDEXBOT_UA)), content(guestHtml), 'YandexBot gets the guest HTML');

    // What a reader without scripts reads: every deck with its facts, its cards and its code.
    const text = readable(guestHtml);
    assert.equal(titlesOf(guestHtml).length, 24, 'every deck of the selection is in the server HTML');
    assert.equal(text.match(/Копировать код/g)?.length, 24, 'each with its copy button');
    for (const fact of ['Фан-колода 1', 'Маг · Стандарт · Стример Фикстуры', 'Винрейт 57,7%', 'Игры 1 240', 'Фан 50%', 'Вне меты 72%',
      'Хайлендер Концепт', '1 Первая карта ×2', 'FUN_DECK_24', 'Данные на 30 октября 2026 г.', 'Винрейт 50,0%']) {
      assert.ok(text.includes(fact), `the server HTML reads «${fact}»`);
    }
    const links = new Set([...guestHtml.matchAll(/<a [^>]*href="(\/standard\/cards\/[^"]+)"/g)].map(match => match[1]));
    assert.ok(links.has('/standard/cards/standard/FIX_ONE/'), 'a card links to its page');
    assert.ok(links.has('/standard/cards/wild/FIX_ONE/'), 'a Wild deck links to the Wild card pages');
    // The warm-up marker after a deploy is an element of the shared deck tile.
    const marker = DATA_PAGES.find(page => page.path === '/standard/fun-decks/').marker;
    assert.equal(marker, 'fun-deck-tiles__stats');
    assert.equal(hasMarker(guestHtml, marker), true, 'the HTML with data has the warm-up marker');
    // Nothing paid: no lock, no offer, no gate; and no field outside the open allowlist, in the HTML or its RSC payload.
    assert.doesNotMatch(guestHtml, /по подписке|paywalled-/i);
    assert.doesNotMatch(guestHtml, /SENTINEL_SOURCE_ID|SENTINEL_ADMIN_NOTE|candidateSourceId|moderationNote/);
    // A link's filters and sort change the server HTML (#675), but not what is indexed: every variant names the bare page
    // as its canonical and carries the bare page's robots rule.
    assert.equal(headOf(guestHtml).canonical, BARE);
    for (const search of ['?format=wild', '?format=standard', '?class=mage,priest&sort=fun', '?tag=highlander', '?sort=reliable']) {
      assert.deepEqual(headOf(await html(stack.origin, GOOGLEBOT_UA, search)), headOf(guestHtml), `${search}: canonical and robots of the bare page`);
    }

    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

    for (const viewport of [DESKTOP, PHONE]) {
      const guest = await open(browser, stack, viewport);
      const subscriber = await open(browser, stack, viewport, { subscriber: true });
      const guestBoxes = await geometry(guest);
      assert.equal(guestBoxes.decks.length, 24, `${viewport.width}px: 24 decks`);
      assert.deepEqual(await geometry(subscriber), guestBoxes, `${viewport.width}px: a subscriber's decks sit exactly where a guest's do`);
      for (const [who, page] of [['guest', guest], ['subscriber', subscriber]]) {
        const shift = await cls(page);
        assert.ok(shift < 0.01, `${viewport.width}px ${who}: the full answer and the full deck lists replace the server HTML in place (CLS ${shift})`);
        assert.deepEqual(await badFrames(page), [], `${viewport.width}px ${who}: no frame loses decks, shows a lock or the error`);
        assert.equal((await lastFrame(page)).decks, 24, `${viewport.width}px ${who}: 24 decks`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `${viewport.width}px ${who}: no horizontal scroll (${overflow})`);
        const first = await page.$eval(`${SECTION} > article`, deck => deck.innerText.replace(/\s+/g, ' '));
        for (const fact of ['Маг · Стандарт · Стример Фикстуры', 'ВИНРЕЙТ 57,7%', 'ВНЕ МЕТЫ 72%']) {
          assert.ok(first.includes(fact), `${viewport.width}px ${who}: the hydrated card reads «${fact}» (${first.slice(0, 160)})`);
        }
        assert.equal(await page.$eval(`${SECTION} a[aria-label="1 маны · Первая карта ×2"]`, link => new URL(link.href).pathname),
          '/standard/cards/standard/FIX_ONE/', `${viewport.width}px ${who}: a card opens its page`);
      }
      await guest.browserContext().close();
      await subscriber.browserContext().close();
    }

    // The browser's read of the selection is refused: the decks of the server HTML stay, in every frame.
    for (const code of [401, 403]) {
      stack.refusal = code;
      const reads = stack.browserReads;
      const refused = await open(browser, stack, DESKTOP, { subscriber: true });
      assert.equal(stack.browserReads - reads, 1, `${code}: the selection was asked once`);
      assert.deepEqual(await badFrames(refused), [], `${code}: no frame loses decks, shows a lock or the error`);
      assert.equal((await lastFrame(refused)).decks, 24, `${code}: 24 decks`);
      await refused.browserContext().close();
    }
    stack.refusal = 0;

    // The session ends on a page restored from the back-forward cache: the page re-checks access and stays the same.
    const lapsing = await open(browser, stack, DESKTOP, { subscriber: true });
    const before = await geometry(lapsing);
    await lapsing.deleteCookie({ name: 'fd_session', url: stack.origin });
    const from = await lapsing.evaluate(() => {
      const now = performance.now();
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
      return now;
    });
    await delay(1_500);
    assert.deepEqual(await badFrames(lapsing, from), [], 'a lost session: every frame keeps the decks, no lock');
    assert.deepEqual(await geometry(lapsing), before, 'a lost session: nothing moves');
    // A real back-forward navigation: away to another page and back.
    await lapsing.evaluate(() => { window.__leftAt = performance.now(); });
    await lapsing.goto(`${stack.origin}/standard/fun-decks/?format=wild`, { waitUntil: 'networkidle0' });
    await lapsing.goBack({ waitUntil: 'networkidle0' });
    await lapsing.waitForFunction(() => window.__frames.at(-1)?.decks === 24, { timeout: 15_000 });
    // Restored from the back-forward cache, the document keeps its earlier frames: only those after leaving count.
    const since = await lapsing.evaluate(() => window.__leftAt ?? 0);
    assert.deepEqual(await badFrames(lapsing, since), [], 'back to the page: the decks are there, no lock');
    await lapsing.browserContext().close();
  } finally {
    if (browser) await browser.close();
    await next.close();
    await closeLocal(stack.server);
  }
});

// What a reader sees before the page has its answers: the HTML arrives in pieces, the selection is held 2 s, every
// full deck list 1.5 s. Each scenario runs at 1440 and 390 px on its own server.
async function delayedPage(scenario) {
  const stack = await startStack();
  const next = await startNextServer({ legacyOrigin: stack.origin });
  Object.assign(stack, { next: next.origin, funDelay: 2_000, resolveDelay: 1_500, slowHtml: true });
  const browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    for (const viewport of [DESKTOP, PHONE]) await scenario(browser, stack, viewport, `${viewport.width}px`);
  } finally {
    await browser.close();
    await next.close();
    await closeLocal(stack.server);
  }
}

test('sideboards are in the server tile, so the full deck lists add no line', { timeout: 240_000 }, () => delayedPage(async (browser, stack, viewport, at) => {
  const page = await open(browser, stack, viewport);
  const [first, second] = await page.$$eval(`${SECTION} > article`, decks => decks.slice(0, 2).map(deck => deck.textContent));
  assert.match(first, /Группа E\.T\.C\.[\s\S]*Гитарист группы/);
  assert.match(second, /Модули Зиллиакса/);
  await delay(1_000);
  const shift = await cls(page);
  assert.ok(shift < 0.01, `${at}: the full lists with sideboards replace the open ones in place (CLS ${shift})`);
  // The HTML came in pieces: the list was watched while it was still arriving, then whole.
  assert.ok(await page.evaluate(() => window.__frames.some(frame => frame.decks > 0 && frame.decks < 24)), `${at}: frames of a list still arriving`);
  assert.ok(await page.evaluate(() => window.__frames.some(frame => frame.firstWhole)), `${at}: the first deck was seen whole`);
  assert.equal(await page.evaluate(() => window.__frames.filter(frame => frame.firstWhole && !frame.band).length), 0,
    `${at}: from the first frame the first deck is whole, it shows its band`);
  await page.browserContext().close();
}));

test('a link\'s filters and sort are the first frame and stay when the selection arrives', { timeout: 240_000 }, () => delayedPage(async (browser, stack, viewport, at) => {
  for (const [search, titles] of [
    ['?format=wild', 'Фан-колода 5 | Фан-колода 10 | Фан-колода 15 | Фан-колода 20'],
    ['?class=mage,priest&sort=fun', 'Фан-колода 13 | Фан-колода 12 | Фан-колода 24 | Фан-колода 2 | Фан-колода 23 | Фан-колода 1'],
  ]) {
    const reads = stack.browserReads;
    const page = await visit(browser, stack, viewport, { search, scroll: false });
    await delay(2_500);
    assert.equal(stack.browserReads - reads, 1, `${at} ${search}: the selection was asked`);
    // While the HTML is still arriving the list may be cut short, but never shows a deck the link leaves out.
    const wrong = await page.evaluate(expected => [...new Set(window.__frames.filter(frame => !expected.startsWith(frame.titles))
      .map(frame => frame.titles || '(no list)'))], titles);
    assert.deepEqual(wrong, [], `${at} ${search}: every frame shows the linked list`);
    assert.equal((await lastFrame(page)).titles, titles, `${at} ${search}: the linked list, whole`);
    const shift = await cls(page);
    assert.ok(shift < 0.01, `${at} ${search}: the page does not move (CLS ${shift})`);
    await page.browserContext().close();
  }
}));

test('a kept deck view replaces the server tiles before they show', { timeout: 240_000 }, () => delayedPage(async (browser, stack, viewport, at) => {
  for (const [layout, label] of [['rows', 'Строки'], ['images', 'Картинки']]) {
    const page = await visit(browser, stack, viewport, { layout });
    await page.waitForFunction(view => window.__frames.at(-1)?.view === view && window.__frames.at(-1)?.decks === 24,
      { timeout: 15_000 }, label);
    await delay(2_500);
    const shown = await page.evaluate(view => [...new Set(window.__frames.filter(frame => frame.listShown && frame.view !== view)
      .map(frame => frame.view))], label);
    assert.deepEqual(shown, [], `${at} ${layout}: the list shows only in the kept view «${label}»`);
    const shift = await cls(page);
    assert.ok(shift < 0.01, `${at} ${layout}: the kept view and its full lists do not move the page (CLS ${shift})`);
    await page.browserContext().close();
  }
}));

// The kept view hides the server tiles until the page's scripts draw it; scripts that never run must not hide them for
// good: the inline script drops its own mark after DECK_LAYOUT_RESTORE_LIMIT_MS (3 s).
test('the server tiles show by themselves when the page\'s scripts never run', { timeout: 240_000 }, () => delayedPage(async (browser, stack, viewport, at) => {
  stack.slowHtml = false;
  const page = await (await browser.createBrowserContext()).newPage();
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument(() => localStorage.setItem('hp:deck-layout', 'rows'));
  await page.setRequestInterception(true);
  page.on('request', request => (/\/_next\/static\/.*\.js(?:\?|$)/.test(request.url()) ? request.abort() : request.continue()));
  await page.goto(`${stack.origin}/standard/fun-decks/`, { waitUntil: 'domcontentloaded' });
  const look = () => page.$eval(SECTION, section => ({ at: performance.now(), shown: section.checkVisibility({ visibilityProperty: true }),
    view: document.querySelector('[role="group"][aria-label="Вид колод"] [aria-pressed="true"]')?.textContent ?? null }));
  const early = await look();
  assert.ok(early.at < 2_500, `${at}: looked before the limit (${Math.round(early.at)} ms)`);
  assert.equal(early.shown, false, `${at}: the kept view hides the server tiles at first`);
  await page.waitForFunction(() => performance.now() > 3_500, { timeout: 10_000, polling: 100 });
  const late = await look();
  assert.deepEqual([late.shown, late.view], [true, 'Плитки'], `${at}: without the page's scripts the tiles show after 3 s`);
  await page.browserContext().close();
}));

// The address is the reader's input: unknown values, very long ones and markup are ignored, never printed as markup,
// and change nothing of what is indexed.
test('the page reads only its own filters from the address', { timeout: 240_000 }, async () => {
  const stack = await startStack();
  const next = await startNextServer({ legacyOrigin: stack.origin });
  stack.next = next.origin;
  let browser;
  try {
    const bare = await html(stack.origin, GOOGLEBOT_UA);
    const injected = [
      ['?format=%3Cscript%3Ealert(1)%3C/script%3E', 24],
      [`?class=${encodeURIComponent('"><img src=x onerror=alert(1)>')},mage`, 3],
      [`?sort=${'x'.repeat(6_000)}&class=${'priest,'.repeat(600)}`, 3],
      ['?tag=highlander&tag=%3Csvg/onload=alert(1)%3E&unknown=%22%3E%3Cb%20id=injected%3E', 24],
      ['?format=wild&format=standard', 4],
      ['?format=WILD&class=MAGE', 3],
    ];
    for (const [search, decks] of injected) {
      const response = await fetch(`${stack.origin}/standard/fun-decks/${search}`, { headers: { 'User-Agent': GOOGLEBOT_UA } });
      assert.equal(response.status, 200, `${search.slice(0, 60)}: the page answers`);
      const page = await response.text();
      assert.equal(titlesOf(page).length, decks, `${search.slice(0, 60)}: what is left of the filters applies`);
      assert.doesNotMatch(page, /<script>alert\(1\)|<img src=x onerror|<svg\/onload|<b id=injected/i, `${search.slice(0, 60)}: no value is printed as markup`);
      assert.deepEqual(headOf(page), headOf(bare), `${search.slice(0, 60)}: canonical and robots of the bare page`);
    }
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    for (const [search, decks] of injected) {
      const page = await (await browser.createBrowserContext()).newPage();
      const trouble = [];
      page.on('dialog', dialog => { trouble.push(`dialog ${dialog.message()}`); void dialog.dismiss(); });
      page.on('pageerror', error => trouble.push(error.message));
      await page.goto(`${stack.origin}/standard/fun-decks/${search}`, { waitUntil: 'networkidle0' });
      await delay(300);
      assert.deepEqual(trouble, [], `${search.slice(0, 60)}: no script of the address runs, the page does not fail`);
      assert.equal(await page.$$eval(`${SECTION} > article`, list => list.length), decks, `${search.slice(0, 60)}: the decks after hydration`);
      await page.browserContext().close();
    }
  } finally {
    if (browser) await browser.close();
    await next.close();
    await closeLocal(stack.server);
  }
});
