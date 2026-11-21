import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { DATA_PAGES, hasMarker } from '../scripts/lib/post-deploy-data-pages.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

// /standard/fun-decks/ (#675) in a real browser against an Express stub. A guest, Googlebot, YandexBot and a
// subscriber get one page: the subscriber's deck tiles, drawn on the server from the open answer (#566: the whole
// selection is open, so nothing is locked). The geometry is the same for a guest and a subscriber at 1440 and 390 px,
// the full deck lists replace the open ones in place (CLS < 0.01), and a refused answer (401/403), a lost session or a
// page restored from the back-forward cache never leave a frame without the decks or with a lock or an error.

const READER = { id: 'fd-reader', email: 'reader@example.test', name: 'Подписчик', role: 'user' };
const SUBSCRIBER = { hasAccess: true, entitlements: { arena: true, standard: true }, source: 'boosty', checkedAt: null,
  stale: false, message: '', boosty: { checked: true, hasAccess: true }, patreon: {}, telegram: {} };
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const YANDEXBOT_UA = 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)';
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const SECTION = 'section[aria-label="Подборка фан-колод"]';

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
const SIDEBOARDS = { 0: [ETC, ETC_BAND], 1: [ZILLIAX, ZILLIAX_MODULES] };
// 24 decks, as in production on 2026-11-21; one of each eleven classes and both formats, fun indexes from 50% to 80%.
// The answer also carries fields outside the page's allowlist (an internal source id, an admin note): not open fields.
const CLASSES = ['mage', 'priest', 'warrior', 'rogue', 'druid', 'hunter', 'paladin', 'shaman', 'warlock', 'demonhunter', 'deathknight'];
const DECKS = Array.from({ length: 24 }, (_, index) => ({
  title: `Фан-колода ${index + 1}`, deckCode: `FUN_DECK_${index + 1}`, format: index % 5 === 4 ? 'Wild' : 'Standard',
  className: CLASSES[index % CLASSES.length], streamer: index === 0 ? 'Стример Фикстуры' : null, kind: 'brew',
  funScore: 0.5 + (index % 7) * 0.05, maxMetaSimilarity: 0.28, nearestArchetype: null, winRate: 53.4, winRateCiLow: 49.1, winRateCiHigh: 57.6,
  games: 1240, reasons: [], why: ['Хайлендер', 'Концепт'], tags: ['highlander', 'concept'], url: null,
  firstSeenAt: `2026-10-${String(30 - index).padStart(2, '0')}T10:00:00.000Z`, lastSeenAt: null,
  cards: SIDEBOARDS[index] ? [...CARDS, SIDEBOARDS[index][0]] : CARDS,
  ...(SIDEBOARDS[index] ? { sideboards: [{ keyId: SIDEBOARDS[index][0].id, cards: SIDEBOARDS[index][1] }] } : {}),
  candidateSourceId: 'SENTINEL_SOURCE_ID', moderationNote: 'SENTINEL_ADMIN_NOTE',
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

async function startStack() {
  // `refusal`: what the browser's read of the selection gets (the server's read always gets the selection).
  // `funDelay`, `resolveDelay`: how long the browser waits for the selection and for each full deck list.
  const state = { next: null, refusal: 0, browserReads: 0, resolveReads: 0, funDelay: 0, resolveDelay: 0 };
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
    const upstream = http.request(new URL(state.next), { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  const origin = await listenLocal(server);
  return Object.assign(state, { server, origin });
}

/**
 * Every frame and DOM change once the document is parsed: how many decks the page shows and their titles in order,
 * whether the server's tile view is on screen, whether the first deck shows its E.T.C. band, and whether anything of a
 * paywall (a lock, an offer, «по подписке», hidden nodes included) or the error of the selection is in the document.
 * The layout shifts are summed as CLS counts them.
 */
const watchFrames = () => {
  window.__frames = [];
  window.__cls = 0;
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
  }).observe({ type: 'layout-shift', buffered: true });
  const look = () => {
    // While the parser still reads the streamed HTML the list is only partly in the document; from then on it is whole.
    if (document.readyState === 'loading') return;
    const section = document.querySelector('section[aria-label="Подборка фан-колод"]');
    const page = document.querySelector('.fun-decks-page');
    if (!page) return;
    const text = page.textContent;
    const tiles = page.querySelector('.fun-decks-tiles-grid');
    window.__frames.push({
      at: performance.now(),
      decks: section ? section.querySelectorAll(':scope > article').length : 0,
      titles: section ? [...section.querySelectorAll(':scope > article h2')].map(title => title.textContent).join(' | ') : '',
      tilesShown: Boolean(tiles && tiles.children.length && getComputedStyle(tiles).visibility === 'visible'),
      band: /Группа E\.T\.C\./.test(section?.querySelector(':scope > article')?.textContent ?? ''),
      paywall: Boolean(document.querySelector('.paid-lock, .paid-filter-lock, [data-testid="arena-paid-offer"], .arena-paywall'))
        || /по подписке/i.test(document.body.textContent),
      error: /Подборка временно недоступна/.test(text),
    });
  };
  new MutationObserver(look).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  const loop = () => { look(); requestAnimationFrame(loop); };
  loop();
};

/** Frames since `from` (ms of the page's clock) that do not show the 24 decks, or show a paywall or the error. */
const badFrames = (page, from = 0) => page.evaluate(start => window.__frames.filter(frame => frame.at >= start
  && (frame.decks !== 24 || frame.paywall || frame.error)).map(frame => ({ decks: frame.decks, paywall: frame.paywall, error: frame.error })), from);

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

const html = async (origin, userAgent) => (await fetch(`${origin}/standard/fun-decks/`, { headers: { 'User-Agent': userAgent } })).text();
// Resource hints follow the order the render finishes in, which varies between requests: they are not content.
const content = text => text.replace(/<link rel="preload"[^>]*\/>/g, '');

/**
 * A fresh browser context on the page. `scroll`: the list is below the first screen, so the reader is put on it as
 * soon as the HTML is parsed, before the full answer and the full deck lists arrive, and any shift they cause counts.
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

async function open(browser, stack, viewport, options = {}) {
  const page = await visit(browser, stack, viewport, options);
  // The first deck's full list (its rarities) replaced the open one in place.
  await page.waitForSelector(`${SECTION} > article:first-child .fun-deck-tile.is-rare`, { timeout: 15_000 });
  await delay(300);
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

    const text = guestHtml.replaceAll('<!-- -->', '');
    assert.equal(text.match(/<article class="fun-deck-tiles"/g)?.length, 24, 'every deck of the selection is a deck tile of the server HTML');
    assert.ok(text.includes('<h2 title="Фан-колода 1">Фан-колода 1</h2>'));
    assert.ok(text.includes('<span>Маг · Стандарт · Стример Фикстуры</span>'), 'class, format and streamer');
    assert.ok(text.includes('<dt>Винрейт</dt><dd>53%</dd>'), 'win rate');
    assert.match(text, /<dt>Игры<\/dt><dd>1\s240<\/dd>/, 'games');
    assert.ok(text.includes('<dt>Фан</dt><dd>50%</dd>') && text.includes('Вне меты</dt><dd>72%</dd>'), 'fun index and distance from the meta');
    assert.ok(text.includes('aria-label="Почему фан"><li>Хайлендер</li><li>Концепт</li></ul>'), 'the reasons');
    assert.ok(text.includes('href="/standard/cards/standard/FIX_ONE/" aria-label="1 маны · Первая карта ×2"'), 'the cards, linked to their pages');
    assert.ok(text.includes('href="/standard/cards/wild/FIX_ONE/"'), 'a Wild deck links to the Wild card pages');
    assert.ok(text.includes('<code class="fun-deck-code">FUN_DECK_24</code>'), 'the deck code as text');
    assert.ok(text.includes('Данные на <time dateTime="2026-10-30T10:00:00.000Z">30 октября 2026 г.</time>'), 'the date of the data');
    // The warm-up marker after a deploy is an element of the shared deck tile.
    const marker = DATA_PAGES.find(page => page.path === '/standard/fun-decks/').marker;
    assert.equal(marker, 'fun-deck-tiles__stats');
    assert.equal(hasMarker(guestHtml, marker), true, 'the HTML with data has the warm-up marker');
    // Nothing paid: no lock, no offer, no gate; and no field outside the open allowlist, in the HTML or its RSC payload.
    assert.doesNotMatch(text, /paid-lock|paid-filter-lock|arena-paywall|paywalled-|по подписке/i);
    assert.doesNotMatch(text, /SENTINEL_SOURCE_ID|SENTINEL_ADMIN_NOTE|candidateSourceId|moderationNote/);
    // A link's filters and sort change the server HTML (#675), but not what is indexed: every variant names the bare page
    // as its canonical and carries the bare page's robots rule.
    const head = page => ({
      canonical: page.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? null,
      robots: page.match(/<meta name="robots" content="([^"]+)"/)?.[1] ?? null,
    });
    assert.equal(head(guestHtml).canonical, 'https://hearthpulse.net/standard/fun-decks/');
    for (const search of ['?format=wild', '?format=standard', '?class=mage,priest&sort=fun', '?tag=highlander', '?sort=reliable']) {
      const variant = await (await fetch(`${stack.origin}/standard/fun-decks/${search}`, { headers: { 'User-Agent': GOOGLEBOT_UA } })).text();
      assert.deepEqual(head(variant), head(guestHtml), `${search}: canonical and robots of the bare page`);
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
        assert.deepEqual(await badFrames(page), [], `${viewport.width}px ${who}: every frame shows the 24 decks, no lock and no error`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `${viewport.width}px ${who}: no horizontal scroll (${overflow})`);
        assert.equal(await page.$eval(`${SECTION} > article:first-child .fun-deck-tiles__head p span`, node => node.textContent),
          'Маг · Стандарт · Стример Фикстуры', `${viewport.width}px ${who}: the hydrated card keeps the server's facts`);
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
      assert.deepEqual(await badFrames(refused), [], `${code}: no frame without the decks, with a lock or with the error`);
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
    await lapsing.goto(`${stack.origin}/standard/fun-decks/?format=wild`, { waitUntil: 'networkidle0' });
    await lapsing.goBack({ waitUntil: 'networkidle0' });
    await lapsing.waitForSelector(`${SECTION} > article:nth-child(24)`, { timeout: 15_000 });
    assert.deepEqual(await badFrames(lapsing, await lapsing.evaluate(() => (window.__frames.at(-1)?.at ?? 1) - 1)), [],
      'back to the page: the decks are there, no lock');
    await lapsing.browserContext().close();
  } finally {
    if (browser) await browser.close();
    await next.close();
    await closeLocal(stack.server);
  }
});

// What a reader sees before the page has its answers: the selection is held 2 s, every full deck list 1.5 s. Each
// scenario runs at 1440 and 390 px on its own server.
async function delayedPage(scenario) {
  const stack = await startStack();
  const next = await startNextServer({ legacyOrigin: stack.origin });
  Object.assign(stack, { next: next.origin, funDelay: 2_000, resolveDelay: 1_500 });
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
  assert.match(await page.$eval(`${SECTION} > article:nth-child(1)`, deck => deck.textContent), /Группа E\.T\.C\..*Гитарист группы/);
  assert.match(await page.$eval(`${SECTION} > article:nth-child(2)`, deck => deck.textContent), /Модули Зиллиакса/);
  await delay(1_000);
  const shift = await cls(page);
  assert.ok(shift < 0.01, `${at}: the full lists with sideboards replace the open ones in place (CLS ${shift})`);
  assert.equal(await page.evaluate(() => window.__frames.filter(frame => frame.decks && !frame.band).length), 0,
    `${at}: the band is on the first deck from the first frame`);
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
    const wrong = await page.evaluate(expected => [...new Set(window.__frames.filter(frame => frame.titles !== expected)
      .map(frame => frame.titles || '(no list)'))], titles);
    assert.deepEqual(wrong, [], `${at} ${search}: every frame shows the linked list`);
    const shift = await cls(page);
    assert.ok(shift < 0.01, `${at} ${search}: the page does not move (CLS ${shift})`);
    await page.browserContext().close();
  }
}));

test('a kept deck view replaces the server tiles before they show', { timeout: 240_000 }, () => delayedPage(async (browser, stack, viewport, at) => {
  for (const [layout, grid] of [['rows', 'section.fun-decks-rows'], ['images', 'section.fun-decks-grid']]) {
    const page = await visit(browser, stack, viewport, { layout });
    await page.waitForSelector(`${grid} > article:nth-child(24)`, { timeout: 15_000 });
    await delay(2_500);
    assert.equal(await page.evaluate(() => window.__frames.filter(frame => frame.tilesShown).length), 0,
      `${at} ${layout}: no frame shows the server tiles`);
    const shift = await cls(page);
    assert.ok(shift < 0.01, `${at} ${layout}: the kept view and its full lists do not move the page (CLS ${shift})`);
    await page.browserContext().close();
  }
}));

// The kept view hides the server tiles until the page's scripts draw it; scripts that never run must not hide them for
// good: the inline script drops its own mark after DECK_LAYOUT_RESTORE_LIMIT_MS (3 s).
test('the server tiles show by themselves when the page\'s scripts never run', { timeout: 240_000 }, () => delayedPage(async (browser, stack, viewport, at) => {
  const page = await (await browser.createBrowserContext()).newPage();
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument(() => localStorage.setItem('hp:deck-layout', 'rows'));
  await page.setRequestInterception(true);
  page.on('request', request => (/\/_next\/static\/.*\.js(?:\?|$)/.test(request.url()) ? request.abort() : request.continue()));
  await page.goto(`${stack.origin}/standard/fun-decks/`, { waitUntil: 'domcontentloaded' });
  const look = () => page.evaluate(() => {
    const tiles = document.querySelector('.fun-decks-tiles-grid');
    return { at: performance.now(), mark: document.documentElement.dataset.deckLayoutRestore ?? null,
      visible: Boolean(tiles) && getComputedStyle(tiles).visibility === 'visible' };
  });
  const early = await look();
  assert.ok(early.at < 2_500, `${at}: looked before the limit (${Math.round(early.at)} ms)`);
  assert.deepEqual([early.mark, early.visible], ['rows', false], `${at}: the kept view hides the server tiles at first`);
  await page.waitForFunction(() => performance.now() > 3_500, { timeout: 10_000, polling: 100 });
  const late = await look();
  assert.deepEqual([late.mark, late.visible], [null, true], `${at}: without the page's scripts the tiles show after 3 s`);
  assert.equal(await page.$('section.fun-decks-rows'), null, `${at}: the scripts really never ran`);
  await page.browserContext().close();
}));
