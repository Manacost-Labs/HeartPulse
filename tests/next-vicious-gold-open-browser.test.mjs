import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';
import {
  CLOSED_HTML_VALUES, CLOSED_INTEGER_PATTERN, CLOSED_KEYS, closedKeyPattern, MISTAKEN_OPEN_ANSWER,
} from './fixtures/viciousGoldSentinels.mjs';

// /standard/vicious-gold/ (#656) in a real browser against an Express stub. A guest, Googlebot and YandexBot get one
// HTML: the subscriber's report on the open frame (header, classes and archetypes in a neutral order, the rank
// brackets) with a lock in the place of every paid value. A press on a lock opens the Standard offer. A subscriber gets
// the paid report in place, without a lock on screen. A viewer with the Arena plan only, or one whose paid request is
// refused (401/403) or whose session ends, sees no paid value in any frame.

const READER = { id: 'vg-reader', email: 'reader@example.test', name: 'Подписчик', role: 'user' };
const PLANS = {
  standard: { hasAccess: true, entitlements: { arena: true, standard: true } },
  arena: { hasAccess: true, entitlements: { arena: true, standard: false } },
};
const status = plan => ({ ...PLANS[plan], source: 'boosty', checkedAt: null, stale: false, message: '',
  boosty: { checked: true, hasAccess: true }, patreon: {}, telegram: {} });
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const YANDEXBOT_UA = 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)';
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

// The open answer carries every closed field of the report by mistake (tests/fixtures/viciousGoldSentinels.mjs): the
// page rebuilds the frame field by field, so none of them may reach the HTML or the RSC payload.
const OPEN = MISTAKEN_OPEN_ANSWER;
const deck = (deckName, deckLabel, className, classLabel, classIcon, frequency) => ({
  deck: deckName, deckLabel, class: className, classLabel, classIcon, frequency, archetypeSlug: null, build: null });
const PAID = {
  title: 'Vicious Syndicate Gold', format: 'Standard', games: 917_331, source: 'Vicious Syndicate Live',
  sourceUrl: 'https://www.vicioussyndicate.com/data-reaper-live/', updatedAt: '2026-11-20T08:15:00.000Z', minimumDeckFrequency: 0.5,
  timeRanges: { distribution: 'lastDay', tierLadder: 'lastWeek', tierMatchups: 'last2Weeks' },
  classDistribution: [
    { class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior', frequency: 41.37 },
    { class: 'DeathKnight', classLabel: 'Рыцарь смерти', classIcon: 'death-knight', frequency: 33.29 },
    { class: 'Mage', classLabel: 'Маг', classIcon: 'mage', frequency: 25.34 },
  ],
  deckDistribution: [
    deck('Dragon Warrior', 'Драконий Воин', 'Warrior', 'Воин', 'warrior', 17.73),
    deck('Blood Death Knight', 'Рыцарь смерти крови', 'DeathKnight', 'Рыцарь смерти', 'death-knight', 12.61),
    deck('Protoss Mage', 'Протосс Маг', 'Mage', 'Маг', 'mage', 9.47),
    deck('Control Warrior', 'Контроль Воин', 'Warrior', 'Воин', 'warrior', 6.83),
  ],
  tierList: [
    { rankBracket: 'All ranks', rankLabel: 'Все ранги', decks: [
      { ...deck('Protoss Mage', 'Протосс Маг', 'Mage', 'Маг', 'mage'), rank: 1, winrate: 54.91 },
      { ...deck('Dragon Warrior', 'Драконий Воин', 'Warrior', 'Воин', 'warrior'), rank: 2, winrate: 52.17 },
    ] },
    { rankBracket: 'Legend', rankLabel: 'Легенда', decks: [
      { ...deck('Blood Death Knight', 'Рыцарь смерти крови', 'DeathKnight', 'Рыцарь смерти', 'death-knight'), rank: 1, winrate: 56.08 },
    ] },
  ],
  buildCoverage: { found: 0, total: 4 },
};
// Values only the paid report (or a mistake in the open one) carries, as printed in ru-RU.
const PAID_TEXT = /41,37|33,29|17,73|12,61|54,91|52,17|56,08|917[\s  ]?331|SENTINEL_DECK_CODE|0,4917/;
const PAID_RAW = ['41.37', '33.29', '17.73', '54.91', '917331', '917 331', 'SENTINEL_DECK_CODE', '0.4917'];

async function startStack() {
  // `buildsRefusal`: the builds route refuses (401/403) after `buildsDelay` and the subscription lapses with it (`lapsed`).
  const state = { next: null, publicReads: 0, paidReads: 0, paidRefusal: 0, buildsRefusal: 0, buildsDelay: 0, summaryDelay: 500, lapsed: false };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://stack');
    const cookie = request.headers.cookie ?? '';
    const reader = /(?:^|;\s*)vg_session=reader/.test(cookie);
    const plan = state.lapsed || /(?:^|;\s*)vg_plan=arena/.test(cookie) ? 'arena' : 'standard';
    const json = (code, payload) => response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' })
      .end(JSON.stringify(payload));
    const tag = /(?:^|;\s*)hp_viewer=([A-Za-z0-9_-]{22})/.exec(cookie)?.[1] ?? null;
    if (url.pathname === '/api/auth/me') return json(200, { user: reader ? READER : null, viewerSession: tag });
    if (url.pathname === '/api/subscription/status' || url.pathname === '/api/subscription/refresh') {
      return reader ? json(200, status(plan)) : json(401, { error: 'guest' });
    }
    if (url.pathname === '/api/vicious-syndicate-gold/public') {
      state.publicReads += 1;
      return json(200, OPEN);
    }
    if (url.pathname === '/api/vicious-syndicate-gold' || url.pathname === '/api/vicious-syndicate-gold/builds') {
      if (!reader || plan !== 'standard') return json(401, { error: 'subscription required' });
      if (url.pathname.endsWith('/builds')) {
        const refusal = state.buildsRefusal;
        if (!refusal) return json(200, { builds: [], buildCoverage: PAID.buildCoverage });
        return void setTimeout(() => { state.lapsed = true; json(refusal, { error: 'subscription required' }); }, state.buildsDelay);
      }
      state.paidReads += 1;
      if (state.paidRefusal) return json(state.paidRefusal, { error: 'subscription required' });
      return void setTimeout(() => json(200, PAID), state.summaryDelay);
    }
    if (url.pathname.startsWith('/api/')) return json(401, { error: 'guest' });
    const upstream = http.request(new URL(state.next), { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  const origin = await listenLocal(server);
  return Object.assign(state, { server, origin });
}

/** Records every animation frame with its time and whether it shows a paid value. */
const recordFrames = () => {
  window.__frames = [];
  // When the page itself gets the builds refusal (its fetch resolves), not when the network finished: a frame between
  // the two cannot know about the refusal yet.
  const pageFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await pageFetch(...args);
    const url = String(args[0] instanceof Request ? args[0].url : args[0]);
    if (url.endsWith('/api/vicious-syndicate-gold/builds') && (response.status === 401 || response.status === 403)) {
      window.__buildsRefusedAt ??= performance.now();
    }
    return response;
  };
  const loop = () => {
    const paid = Boolean(document.body) && /41,37|33,29|17,73|12,61|54,91|52,17|56,08|917[\s\u00a0\u202f]?331/.test(document.body.textContent);
    window.__frames.push({ at: performance.now(), paid });
    requestAnimationFrame(loop);
  };
  loop();
};

const html = async (origin, userAgent) => (await fetch(`${origin}/standard/vicious-gold/`, { headers: { 'User-Agent': userAgent } })).text();

/** Counts frames that show a paid value or a visible lock from the moment the document starts. */
const watchFrames = () => {
  window.__paidFrames = 0;
  window.__visibleLocks = 0;
  const look = () => {
    if (!document.body) return;
    if (!('__mark' in window)) window.__mark = document.documentElement.dataset.hpViewer ?? null;
    if (/41,37|33,29|17,73|12,61|54,91|52,17|56,08|917[\s  ]?331/.test(document.body.textContent)) window.__paidFrames += 1;
    for (const lock of document.querySelectorAll('.vsgold .paid-lock, .vsgold .paid-filter-lock')) {
      if (getComputedStyle(lock).visibility === 'visible' && lock.getBoundingClientRect().width > 0) { window.__visibleLocks += 1; break; }
    }
  };
  new MutationObserver(look).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  const loop = () => { look(); requestAnimationFrame(loop); };
  loop();
};

test('a guest, a robot, an Arena-only viewer and a subscriber on /standard/vicious-gold/', { timeout: 240_000 }, async () => {
  const stack = await startStack();
  const next = await startNextServer({ legacyOrigin: stack.origin });
  stack.next = next.origin;
  let browser;
  try {
    // The build copy has no data (no Express at build time): the post-deploy route regenerates it from the open frame.
    assert.equal((await fetch(`${next.origin}/health/next/revalidate/`, { method: 'POST' })).status, 200);
    let guestHtml = '';
    for (let attempt = 0; attempt < 40 && !guestHtml.includes('vsgold-deck-row'); attempt += 1) {
      guestHtml = await html(stack.origin, BROWSER_UA);
      if (!guestHtml.includes('vsgold-deck-row')) await delay(250);
    }
    assert.ok(guestHtml.includes('vsgold-deck-row'), `the page was regenerated with the open frame: ${next.output().slice(-400)}`);
    // Two identical copies in a row before comparing: right after a regeneration the head can still differ.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const again = await html(stack.origin, BROWSER_UA);
      if (again === guestHtml) break;
      guestHtml = again;
      await delay(300);
    }
    assert.equal(await html(stack.origin, GOOGLEBOT_UA), guestHtml, 'Googlebot gets the guest HTML');
    assert.equal(await html(stack.origin, YANDEXBOT_UA), guestHtml, 'YandexBot gets the guest HTML');

    // The HTML (with its RSC payload) has the open frame and no paid value.
    const text = guestHtml.replaceAll('<!-- -->', '');
    assert.deepEqual(CLOSED_HTML_VALUES.filter(value => text.includes(value)), [], 'no closed value of the open answer in the HTML or the RSC payload');
    assert.deepEqual([...text.matchAll(CLOSED_INTEGER_PATTERN)].map(match => match[0]), [], 'no closed integer (rank, games, coverage) as a value');
    assert.deepEqual(CLOSED_KEYS.filter(key => closedKeyPattern(key).test(text)), [], 'no closed field name as a key of the RSC payload');
    assert.deepEqual(PAID_RAW.filter(value => text.includes(value)), [], 'no paid value in the HTML or the RSC payload');
    assert.doesNotMatch(text, PAID_TEXT);
    assert.doesNotMatch(text, /arena-paywall/, 'no gate over the page');
    assert.equal((text.match(/class="vsgold-deck-row"/g) ?? []).length, 8, 'every archetype of the open frame is a row');
    // The open frame's neutral order (class, name, slug, deck), not the source's order by share.
    const order = [...text.matchAll(/<strong>([^<]+)<\/strong><small lang="en">([^<]+)<\/small>/g)].map(match => `${match[1]} / ${match[2]}`);
    assert.deepEqual(order, ['Агро Воин / Control Warrior', 'Агро Воин / Aggro Warrior', 'Агро Воин / Face Warrior',
      'Драконий Воин / Dragon Warrior', 'Протосс Маг / Protoss Mage', 'Святой Паладин / Holy Paladin',
      'Циклоразбойник / Cycle Rogue', 'Рыцарь смерти крови / Blood Death Knight']);
    assert.ok(text.includes('href="/standard/archetypes/standard/dragon-warrior/"'), 'an archetype links to our archetype page');
    assert.ok(text.includes('>Все ранги</button>') && text.includes('>Легенда</button>'), 'the rank brackets are named');
    assert.ok(text.includes('href="https://www.vicioussyndicate.com/data-reaper-live/"'), 'the source is linked');
    assert.equal((text.match(/aria-label="Колода Power Tier, строка \d+: по подписке/g) ?? []).length, 8, 'the Power Tier rows are locks without names');
    assert.ok(text.includes('aria-label="Доля Драконий Воин: по подписке'), 'a share is a lock');
    assert.ok(text.includes('aria-label="Лидер Power Tier: по подписке'), 'the leader is a lock');
    assert.ok(text.includes('aria-label="Партий: по подписке'), 'the games are a lock');
    assert.equal(stack.paidReads, 0, 'the server never reads the paid report');

    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });

    // A guest with JavaScript: the locks are visible, a press opens the Standard offer, the class filter works.
    for (const viewport of [DESKTOP, PHONE]) {
      const guest = await browser.newPage();
      await guest.setViewport(viewport);
      await guest.goto(`${stack.origin}/standard/vicious-gold/`, { waitUntil: 'networkidle0' });
      const locks = await guest.$$eval('.vsgold .paid-lock', nodes => nodes.filter(node => getComputedStyle(node).visibility === 'visible').length);
      assert.ok(locks >= 16, `the guest sees the locks at ${viewport.width}px (${locks})`);
      const overflow = await guest.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `no horizontal scroll at ${viewport.width}px (${overflow})`);
      await guest.click('button[aria-label="Лидер Power Tier: по подписке. Узнать, как открыть"]');
      await guest.waitForSelector('[data-testid="arena-paid-offer"]', { timeout: 15_000 });
      const offer = await guest.$eval('[data-testid="arena-paid-offer"]', node => node.textContent);
      assert.match(offer, /Отчёт Vicious Syndicate Gold — по подписке/);
      assert.match(offer, /Уровень «Алмаз» и выше/, 'the offer sells the Standard (Diamond) tier, not the Arena one');
      assert.match(offer, /Войти/, 'a guest is offered to sign in');
      await guest.keyboard.press('Escape');
      await guest.waitForFunction(() => !document.querySelector('[data-testid="arena-paid-offer"]'));
      await guest.click('.vsgold-classbars li:nth-child(2) button');
      await guest.waitForFunction(() => document.querySelectorAll('.vsgold-deck-row').length === 1);
      assert.equal(await guest.$eval('.vsgold-deck-row strong', node => node.textContent), 'Протосс Маг', 'a class filters the archetype list');
      await guest.close();
    }
    assert.equal(stack.paidReads, 0, 'a guest never asks the paid route');

    // Signed in with the Arena plan only: the guest's view with its locks, and the offer names the Diamond tier.
    const arenaOnly = await (await browser.createBrowserContext()).newPage();
    await arenaOnly.setViewport(DESKTOP);
    await arenaOnly.setCookie({ name: 'vg_session', value: 'reader', url: stack.origin }, { name: 'vg_plan', value: 'arena', url: stack.origin });
    await arenaOnly.evaluateOnNewDocument(watchFrames);
    await arenaOnly.goto(`${stack.origin}/standard/vicious-gold/`, { waitUntil: 'networkidle0' });
    await arenaOnly.waitForSelector('.vsgold[data-access-settled]');
    await arenaOnly.click('button[aria-label="Партий: по подписке. Узнать, как открыть"]');
    await arenaOnly.waitForSelector('[data-testid="arena-paid-offer"]', { timeout: 15_000 });
    const arenaOffer = await arenaOnly.$eval('[data-testid="arena-paid-offer"]', node => node.textContent);
    assert.match(arenaOffer, /Уровень «Алмаз» и выше/);
    assert.match(arenaOffer, /Проверить доступ/, 'a signed-in viewer checks access instead of signing in');
    assert.equal(await arenaOnly.evaluate(() => window.__paidFrames), 0, 'the Arena plan never shows a paid value');
    assert.equal(stack.paidReads, 0, 'the Arena plan does not open the paid route');
    await arenaOnly.close();

    // A subscriber: the paid report replaces the frame in place; no lock is visible at any moment, no offer.
    const reader = await (await browser.createBrowserContext()).newPage();
    await reader.setViewport(DESKTOP);
    await reader.setCookie({ name: 'vg_session', value: 'reader', url: stack.origin },
      { name: 'hp_viewer', value: 'AAAAAAAAAAAAAAAAAAAAAA', url: stack.origin });
    await reader.goto(`${stack.origin}/standard/vicious-gold/`, { waitUntil: 'load' });
    await reader.waitForFunction(() => document.body.textContent.includes('17,73'), { timeout: 15_000 });
    assert.equal(await reader.$('.vsgold .paid-lock'), null, 'no lock for a subscriber');
    assert.equal(await reader.$('[data-testid="arena-paid-offer"]'), null, 'no offer for a subscriber');
    assert.deepEqual(await reader.$$eval('.vsgold-deck-row strong', nodes => nodes.map(node => node.textContent)),
      ['Драконий Воин', 'Рыцарь смерти крови', 'Протосс Маг', 'Контроль Воин'], 'a subscriber reads the archetypes by share');
    // The next visit remembers the subscriber: from the first frame no lock may flash before the paid report arrives.
    await reader.waitForFunction(() => localStorage.getItem('hs_arena_viewer_hint') !== null, { timeout: 5_000 });
    await reader.evaluateOnNewDocument(watchFrames);
    await reader.reload({ waitUntil: 'domcontentloaded' });
    await reader.waitForFunction(() => document.body.textContent.includes('17,73'), { timeout: 15_000 });
    assert.equal(await reader.evaluate(() => window.__mark), 'remembered', 'the head script marks the remembered subscriber before the first paint');
    assert.equal(await reader.evaluate(() => window.__visibleLocks), 0, 'a remembered subscriber never sees a lock');
    await reader.close();

    // The paid route refuses the subscriber (401, then 403): no frame shows a paid value, the locks come back, the
    // access check confirms the plan and the report is asked once more; the second refusal keeps the open frame (no loop).
    for (const code of [401, 403]) {
      stack.paidRefusal = code;
      const before = stack.paidReads;
      const refused = await (await browser.createBrowserContext()).newPage();
      await refused.setViewport(DESKTOP);
      await refused.setCookie({ name: 'vg_session', value: 'reader', url: stack.origin });
      await refused.evaluateOnNewDocument(watchFrames);
      await refused.goto(`${stack.origin}/standard/vicious-gold/`, { waitUntil: 'load' });
      await refused.waitForFunction(() => document.querySelector('.vsgold[data-access-settled] .paid-lock'), { timeout: 15_000 });
      await delay(1_500);
      assert.equal(await refused.evaluate(() => window.__paidFrames), 0, `${code}: no frame shows a paid value`);
      assert.equal(stack.paidReads - before, 2, `${code}: one retry after the access check, then the open frame stays`);
      assert.equal(await refused.$$eval('.vsgold-deck-row', rows => rows.length), 8, `${code}: the open frame is what is left`);
      await refused.close();
    }
    stack.paidRefusal = 0;

    // The builds route refuses (401/403) once the subscription has lapsed, in both orders: after the report is shown
    // (no frame after the refusal arrived may show it) and before the report answers (the report never shows).
    for (const [code, order] of [[401, 'report first'], [403, 'report first'], [401, 'builds first'], [403, 'builds first']]) {
      Object.assign(stack, { buildsRefusal: code, lapsed: false,
        summaryDelay: order === 'report first' ? 300 : 1_500, buildsDelay: order === 'report first' ? 2_000 : 0 });
      const lapsing = await (await browser.createBrowserContext()).newPage();
      await lapsing.setViewport(DESKTOP);
      await lapsing.setCookie({ name: 'vg_session', value: 'reader', url: stack.origin });
      await lapsing.evaluateOnNewDocument(recordFrames);
      await lapsing.goto(`${stack.origin}/standard/vicious-gold/`, { waitUntil: 'load' });
      if (order === 'report first') await lapsing.waitForFunction(() => document.body.textContent.includes('17,73'), { timeout: 15_000 });
      // Bounded wait: without the drop the page never gets its locks back, and the frame check below names the failure.
      await lapsing.waitForFunction(() => document.querySelector('.vsgold[data-access-settled] .paid-lock'), { timeout: 8_000 }).catch(() => undefined);
      await delay(2_500);
      const { refusedAt, paidAfter, paidEver } = await lapsing.evaluate(() => {
        const refusal = performance.getEntriesByType('resource').find(entry => entry.name.endsWith('/api/vicious-syndicate-gold/builds'));
        const at = refusal ? window.__buildsRefusedAt ?? Infinity : Infinity;
        return { refusedAt: at, paidAfter: window.__frames.filter(frame => frame.paid && frame.at > at).length,
          paidEver: window.__frames.filter(frame => frame.paid).length };
      });
      assert.ok(Number.isFinite(refusedAt), `${code} ${order}: the builds request was made`);
      assert.equal(paidAfter, 0, `${code} ${order}: no frame after the builds refusal shows the paid report`);
      if (order === 'builds first') assert.equal(paidEver, 0, `${code} ${order}: the report refused before it answered never shows`);
      else assert.ok(paidEver > 0, `${code} ${order}: the report was on screen before the refusal`);
      assert.equal(await lapsing.$$eval('.vsgold-deck-row', rows => rows.length), 8, `${code} ${order}: the open frame is what is left`);
      await lapsing.close();
    }
    Object.assign(stack, { buildsRefusal: 0, lapsed: false, summaryDelay: 500, buildsDelay: 0 });

    // Access is withdrawn while the paid report is on screen (the session ended): from then on no frame shows it.
    const revoked = await (await browser.createBrowserContext()).newPage();
    await revoked.setViewport(DESKTOP);
    await revoked.setCookie({ name: 'vg_session', value: 'reader', url: stack.origin });
    await revoked.goto(`${stack.origin}/standard/vicious-gold/`, { waitUntil: 'load' });
    await revoked.waitForFunction(() => document.body.textContent.includes('17,73'), { timeout: 15_000 });
    await revoked.evaluate(watchFrames);
    await revoked.deleteCookie({ name: 'vg_session', url: stack.origin });
    // A restored page re-checks the session: the server now answers as it does to a guest. Frames are counted from the
    // moment the check starts: the page drops the paid report at once, not when the guest answer comes.
    await revoked.evaluate(() => { window.__paidFrames = 0; window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })); });
    await revoked.waitForSelector('.vsgold[data-access-settled] .paid-lock', { timeout: 15_000 });
    await delay(500);
    assert.equal(await revoked.evaluate(() => window.__paidFrames), 0, 'no paid value after access is withdrawn');
    assert.doesNotMatch(await revoked.evaluate(() => document.body.textContent), PAID_TEXT);
    await revoked.close();
  } finally {
    if (browser) await browser.close();
    await next.close();
    await closeLocal(stack.server);
  }
});
