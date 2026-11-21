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
// 24 decks, as in production on 2026-11-21; one of each eleven classes and both formats. The answer also carries
// fields outside the page's allowlist (an internal source id, an admin note): they are not open fields.
const CLASSES = ['mage', 'priest', 'warrior', 'rogue', 'druid', 'hunter', 'paladin', 'shaman', 'warlock', 'demonhunter', 'deathknight'];
const DECKS = Array.from({ length: 24 }, (_, index) => ({
  title: `Фан-колода ${index + 1}`, deckCode: `FUN_DECK_${index + 1}`, format: index % 5 === 4 ? 'Wild' : 'Standard',
  className: CLASSES[index % CLASSES.length], streamer: index === 0 ? 'Стример Фикстуры' : null, kind: 'brew',
  funScore: 0.71, maxMetaSimilarity: 0.28, nearestArchetype: null, winRate: 53.4, winRateCiLow: 49.1, winRateCiHigh: 57.6,
  games: 1240, reasons: [], why: ['Хайлендер', 'Концепт'], tags: ['highlander', 'concept'], url: null,
  firstSeenAt: `2026-10-${String(30 - index).padStart(2, '0')}T10:00:00.000Z`, lastSeenAt: null, cards: CARDS,
  candidateSourceId: 'SENTINEL_SOURCE_ID', moderationNote: 'SENTINEL_ADMIN_NOTE',
}));
const FUN_DECKS = {
  fetchedAt: '2026-10-31T10:00:00.000Z', stats: { total: 24, standard: 20, wild: 4 },
  methodology: { detectorVersion: 'concept-v8', minFunScore: 0.55, maxMetaSimilarity: 0.42, ladderMemberSim: 0.6 },
  decks: DECKS,
};
// The full list of a deck: the same cards with their rarities (the open list has none).
const resolved = (code, format) => ({
  ok: true, format, heroDbfId: 637, deckCode: code, totalCards: 5, deckSizeLimit: 30, archetype: null, sideboards: [],
  cards: CARDS.map((card, index) => ({ id: card.id, dbfId: 9000 + index, name: card.name, cost: card.cost, count: card.count,
    rarity: 'RARE', elite: false, image: '', pagePath: `/standard/cards/${format}/${card.id}/` })),
});

async function startStack() {
  // `refusal`: what the browser's read of the selection gets (the server's read always gets the selection).
  const state = { next: null, refusal: 0, browserReads: 0, resolveReads: 0 };
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
      return state.refusal ? json(state.refusal, { error: 'refused' }) : json(200, FUN_DECKS);
    }
    if (url.pathname === '/api/deck/resolve') {
      state.resolveReads += 1;
      return json(200, resolved(url.searchParams.get('code'), url.searchParams.get('format')));
    }
    if (url.pathname.startsWith('/api/')) return json(404, { error: 'missing' });
    const upstream = http.request(new URL(state.next), { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  const origin = await listenLocal(server);
  return Object.assign(state, { server, origin });
}

/**
 * Every frame and DOM change once the document is parsed: how many decks the page shows, and whether anything of a
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
    window.__frames.push({
      at: performance.now(),
      decks: section ? section.querySelectorAll(':scope > article').length : 0,
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

async function open(browser, stack, viewport, { subscriber = false } = {}) {
  const page = await (await browser.createBrowserContext()).newPage();
  await page.setViewport(viewport);
  if (subscriber) await page.setCookie({ name: 'fd_session', value: 'reader', url: stack.origin });
  await page.evaluateOnNewDocument(watchFrames);
  // The list is below the first screen: the reader is put on it as soon as the HTML is parsed, before hydration, so
  // the full answer and the full deck lists arrive in view and any shift they cause counts.
  await page.evaluateOnNewDocument(list => document.addEventListener('DOMContentLoaded', () => {
    document.querySelector(list)?.scrollIntoView({ block: 'start' });
  }), SECTION);
  await page.goto(`${stack.origin}/standard/fun-decks/`, { waitUntil: 'networkidle0' });
  // The first deck's full list (its rarities) replaced the open one in place.
  await page.waitForSelector(`${SECTION} > article:first-child .fun-deck-tile.is-rare`, { timeout: 15_000 });
  await delay(300);
  return page;
}

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
    assert.ok(text.includes('<dt>Фан</dt><dd>71%</dd>') && text.includes('Вне меты</dt><dd>72%</dd>'), 'fun index and distance from the meta');
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

    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

    for (const viewport of [DESKTOP, PHONE]) {
      const guest = await open(browser, stack, viewport);
      const subscriber = await open(browser, stack, viewport, { subscriber: true });
      const guestBoxes = await geometry(guest);
      assert.equal(guestBoxes.decks.length, 24, `${viewport.width}px: 24 decks`);
      assert.deepEqual(await geometry(subscriber), guestBoxes, `${viewport.width}px: a subscriber's decks sit exactly where a guest's do`);
      for (const [who, page] of [['guest', guest], ['subscriber', subscriber]]) {
        const cls = await page.evaluate(() => window.__cls);
        assert.ok(cls < 0.01, `${viewport.width}px ${who}: the full answer and the full deck lists replace the server HTML in place (CLS ${cls})`);
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
