import assert from 'node:assert/strict';
import http from 'node:http';
import { after, describe, test } from 'node:test';
import { encode } from '@firestone-hs/deckstrings';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

// A subscriber's paid card numbers leave the page in the frame their access goes (GPT review of 07a50d0d, #625):
// the card route refusing a later request (401, 403), a check that does not confirm access again after the page
// comes back from the back/forward cache, on Legend and on the open slice, and the recommended decks' winrates.
// Every frame from the event on is read, hidden nodes included (`textContent` of the whole card page).
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/google-chrome';
const CARD = '/standard/cards/standard/blizzard%3A12345/';

// Legend has its own numbers, so a Legend value shown as an «open» one is told from Platinum's (12,5% / 53% / 1,9).
const legendStats = {
  id: 'blizzard:12345', dbfId: 12345, deck_popularity: '31.7%', deck_winrate: '47.9%', times_played: 7300, avg_copies: 1.6,
  winrate_when_played: '63.42%', winrate_when_drawn: '61.18%', keep_percentage: '27.3%', opening_hand_winrate: '58.77%',
  avg_turns_in_hand: 3.1, avg_turn_played_on: 6.2,
};
const deckCode = encode({ cards: [[12345, 2], ...Array.from({ length: 14 }, (_, index) => [20001 + index, 2])], heroes: [7], format: 2 });
const deck = { id: 'qa-deck-1', deck_code: deckCode, format: 'standard', class: 'MAGE', archetype: 'Контрольный маг',
  title: 'Контрольный маг', win_rate: 61.37, score: '61,37% · 4 210 игр', source_id: 'hsguru_decks', updated_at: '2026-11-20T10:00:00Z' };
const externalRoutes = {
  '/demo/view/hsreplay_cards_legend_1d': () => ({ fetched_at: new Date().toISOString(), url: 'https://hsreplay.net/cards/', view: { cards: [legendStats] } }),
  '/v1/constructed/decks': () => ({ data: [deck], meta: { count: 1, offset: 0, limit: 200 } }),
};

/** Paid figures of either slice and of the deck; Legend's open three are paid too (only Platinum · last day is open). */
const PAID = String.raw`56,21|54,13|42,6\s?%|52,84|20\s000|63,42|61,18|27,3|58,77|7\s300|31,7|47,9|61,37|4\s210`;

let pilot = null;
const cardPilot = () => (pilot ??= startPublicCardPilot({ pagesEnabled: true, externalRoutes }).then(runtime => { runtime.grant(); return runtime; }));
after(async () => { if (pilot) await (await pilot).close(); });

/** Counts the frames that show a paid figure anywhere in the page's content (hidden nodes included) once `window.__armed` is set. */
function watchFrames(paid) {
  const pattern = new RegExp(paid);
  window.__paidFrames = [];
  const look = when => {
    const text = (document.querySelector('main') ?? document.body)?.textContent ?? '';
    const found = text.match(pattern);
    if (window.__armed && found) {
      window.__paidFrames.push({ when, found: found[0], mode: document.querySelector('dl.constructed-cards__stats')?.dataset.statsMode });
    }
  };
  window.__look = look;
  const sample = () => { look('frame'); requestAnimationFrame(sample); };
  requestAnimationFrame(sample);
}

const settled = (page, mode, timeout = 25_000) =>
  page.waitForSelector(`.constructed-card-detail__statistics dl.constructed-cards__stats[data-stats-mode="${mode}"]:not([aria-busy])`, { timeout });
const subscriberPage = async (browser, origin, runtime, paid = PAID) => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const [name, value] = runtime.cookie.split('=');
  await page.setCookie({ name, value, url: origin });
  await page.evaluateOnNewDocument(watchFrames, paid);
  return { context, page };
};
const pageText = page => page.$eval('.constructed-card-detail', node => node.textContent);

/**
 * Back restores the page; the check of the viewer then fails (`error`) or is late (`late`). Until access is confirmed
 * again no frame shows a paid figure, hidden nodes included.
 */
async function restoredWithoutConfirmation(cases) {
  const runtime = await cardPilot();
  const target = new URL(runtime.origin);
  const proxy = { mode: 'pass' };
  const server = http.createServer((request, response) => {
    const { pathname } = new URL(request.url, 'http://proxy');
    const forward = () => {
      const upstream = http.request(target, { method: request.method, path: request.url, headers: request.headers },
        answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
      upstream.on('error', () => response.destroy());
      request.pipe(upstream);
    };
    if (proxy.mode !== 'pass' && ['/api/auth/me', '/api/subscription/status', '/api/subscription/refresh'].includes(pathname)) {
      if (proxy.mode === 'error' && pathname !== '/api/auth/me') {
        response.writeHead(503, { 'Content-Type': 'application/json' }).end('{"error":"unavailable"}');
        return;
      }
      setTimeout(forward, 2500);
      return;
    }
    forward();
  });
  const browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const origin = await listenLocal(server);
    for (const [search, mode] of cases) {
      const label = `${search || 'open slice'}, ${mode}`;
      const { context, page } = await subscriberPage(browser, origin, runtime);
      proxy.mode = 'pass';
      await page.goto(`${origin}${CARD}${search}`, { waitUntil: 'load' });
      await settled(page, 'full');
      assert.match(await pageText(page), search ? /63,42%/ : /56,21%/, `${label}: the paid numbers are loaded first`);
      assert.match(await pageText(page), /61,37/, `${label}: and the deck winrate`);
      await page.evaluate(() => {
        window.__restoreMarker = true;
        // Registered after the page's own listener: the page has reacted when this one reads it.
        addEventListener('pageshow', event => {
          if (!event.persisted) return;
          window.__armed = true;
          window.__look('pageshow');
        });
      });
      await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.evaluate(() => { setTimeout(() => { location.href = '/faq/'; }, 0); })]);
      proxy.mode = mode;
      await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.evaluate(() => { setTimeout(() => history.back(), 0); })]);
      await page.waitForFunction(() => document.readyState === 'complete' && Boolean(document.querySelector('.constructed-card-detail')), { timeout: 10_000 }).catch(() => {});
      assert.equal(await page.evaluate(() => window.__restoreMarker === true), true, `${label}: the page comes back from the back/forward cache`);
      if (mode === 'error') {
        await page.waitForSelector('.constructed-card-detail__statistics-unavailable button', { timeout: 25_000 });
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1000)));
        assert.deepEqual(await page.evaluate(() => window.__paidFrames.slice(0, 3)), [], `${label}: no frame with a paid number`);
      } else {
        // Late: paid numbers may come back only once the access is confirmed (the rows are `full` again).
        await page.waitForFunction(() => {
          if (document.querySelector('dl.constructed-cards__stats[data-stats-mode="full"]')) return true;
          window.__beforeConfirmed = window.__paidFrames.length;
          return false;
        }, { timeout: 25_000, polling: 'raf' });
        assert.equal(await page.evaluate(() => window.__beforeConfirmed ?? window.__paidFrames.length), 0, `${label}: no paid number before access is confirmed`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await closeLocal(server);
  }
}

/**
 * Picks an option of the card page's «Период» select from the keyboard (the sticky header cannot cover it). A viewer the
 * page holds for a guest gets the offer for a closed option; it is closed again and the page stays where it was.
 */
async function pickPeriod(page, option) {
  const select = 'xpath/.//*[contains(@class,"constructed-card-detail__statistics-controls")]//*[contains(@class,"constructed-cards__filter")][span[normalize-space()="Период"]]//button';
  await (await page.waitForSelector(select, { timeout: 10_000 })).focus();
  await page.keyboard.press('ArrowDown');
  const choice = await page.waitForSelector(`xpath/.//*[@role="option"][starts-with(normalize-space(), "${option}")]`, { visible: true, timeout: 10_000 });
  await choice.evaluate(node => node.click());
  if (await page.waitForSelector('[role="dialog"]', { visible: true, timeout: 500 }).catch(() => null)) {
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="dialog"]', { hidden: true, timeout: 5_000 });
  }
}

/**
 * Marks the moment the page itself learns that the server no longer serves it paid numbers: its `fetch` resolves with a
 * refusal (401, 403), or a paid card answer it reads says `statsAccess: false` (a guest's answer). A frame before that
 * cannot know; every frame from then on counts (`window.__armed`).
 */
function markWithdrawal() {
  const pageFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await pageFetch(...args);
    const url = String(args[0] instanceof Request ? args[0].url : args[0]);
    if (!url.includes('/api/constructed-cards')) return response;
    if (response.status === 401 || response.status === 403) window.__armed = true;
    const readJson = response.json.bind(response);
    response.json = async () => {
      const payload = await readJson();
      if (window.__paidAsked && payload?.statsAccess === false) window.__armed = true;
      return payload;
    };
    return response;
  };
}

/**
 * 4. Paid answers held by the page are no confirmation. Slices A (Platinum · last day) and B (Platinum · 3 days) are
 * read with access; then the server stops serving paid numbers in one of three ways:
 * - `401` / `403`: the card route refuses the viewer (slice C, 7 days);
 * - `guest`: the card route answers as to a guest (`statsAccess: false`: the session no longer reaches it) from slice C
 *   on, while the subscription check still grants access;
 * - `unconfirmed`: Back restores the page and the check fails; then the card route answers as to a guest and
 *   «Повторить проверку» confirms access again.
 * From then on no frame shows a paid number: back on A and on B by the select, after Back from a client navigation
 * (breadcrumb «Стандарт» and `history.back()`) and after Back from the back/forward cache.
 */
async function cachedSlicesAfterWithdrawal(trigger) {
  const runtime = await cardPilot();
  const target = new URL(runtime.origin);
  const proxy = { card: 'pass', status: 'pass' };
  // A proxy, not request interception: an intercepted page does not enter the back/forward cache.
  const server = http.createServer((request, response) => {
    const { pathname } = new URL(request.url, 'http://proxy');
    if (typeof proxy.card === 'number' && pathname.startsWith('/api/constructed-cards/blizzard')) {
      response.writeHead(proxy.card, { 'Content-Type': 'application/json' }).end('{"error":"Статистика доступна по подписке"}');
      return;
    }
    if (proxy.status === 'error' && ['/api/subscription/status', '/api/subscription/refresh'].includes(pathname)) {
      response.writeHead(503, { 'Content-Type': 'application/json' }).end('{"error":"unavailable"}');
      return;
    }
    // `guest`: the card route gets no session, so it answers as to a guest.
    const headers = { ...request.headers };
    if (proxy.card === 'guest' && pathname.startsWith('/api/constructed-cards')) delete headers.cookie;
    const upstream = http.request(target, { method: request.method, path: request.url, headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    upstream.on('error', () => response.destroy());
    request.pipe(upstream);
  });
  const browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const origin = await listenLocal(server);
    const { context, page } = await subscriberPage(browser, origin, runtime);
    await page.evaluateOnNewDocument(markWithdrawal);
    const backFromCache = async where => {
      await page.evaluate(() => { window.__restoreMarker = true; });
      await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.evaluate(() => { setTimeout(() => { location.href = '/faq/'; }, 0); })]);
      await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.evaluate(() => { setTimeout(() => history.back(), 0); })]);
      await page.waitForFunction(() => document.readyState === 'complete' && Boolean(document.querySelector('.constructed-card-detail')), { timeout: 10_000 }).catch(() => {});
      assert.equal(await page.evaluate(() => window.__restoreMarker === true), true, `${trigger}: Back restores the page from the back/forward cache ${where}`);
    };
    const noPaidFrame = async where => {
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 2000)));
      assert.deepEqual(await page.evaluate(() => window.__paidFrames.slice(0, 3)), [], `${trigger}: no paid number ${where}`);
    };

    await page.goto(origin + CARD, { waitUntil: 'load' });
    await settled(page, 'full');
    assert.match(await pageText(page), /56,21%/, `${trigger}: slice A is read with its paid numbers`);
    await pickPeriod(page, 'Последние 3 дня');
    await settled(page, 'full');
    assert.match(await pageText(page), /56,21%/, `${trigger}: slice B too`);

    if (trigger === 'unconfirmed') {
      proxy.status = 'error';
      await backFromCache('with the check failing');
      await page.evaluate(() => { window.__armed = true; });
      await page.waitForSelector('.constructed-card-detail__statistics-unavailable button', { timeout: 25_000 });
      await noPaidFrame('while access is not confirmed');
      proxy.card = 'guest';
      proxy.status = 'pass';
      await (await page.waitForSelector('xpath/.//button[normalize-space()="Повторить проверку"]')).click();
      await page.waitForFunction(() => !document.querySelector('.constructed-card-detail__statistics-unavailable'), { timeout: 20_000 });
      await noPaidFrame('after the check grants again');
    } else {
      proxy.card = trigger;
      await page.evaluate(() => { window.__paidAsked = true; });
      await pickPeriod(page, 'Последние 7 дней');
      await page.waitForFunction(() => window.__armed === true, { timeout: 15_000 });
      await noPaidFrame('after the server stopped serving paid numbers');
    }
    await pickPeriod(page, 'Последний день');
    await noPaidFrame('back on slice A');
    await pickPeriod(page, 'Последние 3 дня');
    await noPaidFrame('back on slice B');
    await pickPeriod(page, 'Последний день');
    await page.evaluate(() => { window.__clientMarker = true; });
    // A reader's click on the link (the sticky search bar may cover it on screen).
    await (await page.waitForSelector('xpath/.//nav[@aria-label="Breadcrumb"]//a[normalize-space()="Стандарт"]')).evaluate(node => node.click());
    await page.waitForFunction(() => location.pathname === '/standard/cards/standard/' && Boolean(document.querySelector('h1')), { timeout: 20_000 })
      .catch(error => { throw new Error(`${error.message}; at ${page.url()}`); });
    assert.equal(await page.evaluate(() => window.__clientMarker === true), true, `${trigger}: the catalog opened by client navigation`);
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => location.pathname.startsWith('/standard/cards/standard/blizzard'), { timeout: 20_000 });
    await page.waitForSelector('.constructed-card-detail__statistics dl.constructed-cards__stats', { timeout: 20_000 });
    await noPaidFrame('after Back from a client navigation');
    await backFromCache('at the end');
    await noPaidFrame('after Back from the back/forward cache');
    assert.doesNotMatch(await pageText(page), new RegExp(PAID), `${trigger}: the page ends without paid numbers`);
    await context.close();
  } finally {
    await browser.close();
    await closeLocal(server);
  }
}

/** The catalog's paid figures for the fixture cards: popularity, deck winrate and games (all locked for a guest). */
const CATALOG_PAID = String.raw`12,5\s?%|53,0\s?%|20\s000`;

/**
 * 5. The catalog shows paid numbers; the reader rests on another rank in the menu and the warm request of that slice is
 * refused (401, 403) or answered as to a guest, while the subscription check still grants access. The shown list
 * turns into its open view in the frame the page reads that answer: no paid number in any later frame, hidden nodes
 * included.
 */
async function catalogAfterWarmRefusal(trigger) {
  const runtime = await cardPilot();
  const target = new URL(runtime.origin);
  const proxy = { list: 'pass' };
  const server = http.createServer((request, response) => {
    const { pathname } = new URL(request.url, 'http://proxy');
    const list = pathname === '/api/constructed-cards';
    if (list && typeof proxy.list === 'number') {
      response.writeHead(proxy.list, { 'Content-Type': 'application/json' }).end('{"error":"Статистика доступна по подписке"}');
      return;
    }
    const headers = { ...request.headers };
    if (list && proxy.list === 'guest') delete headers.cookie;
    const upstream = http.request(target, { method: request.method, path: request.url, headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    upstream.on('error', () => response.destroy());
    request.pipe(upstream);
  });
  const browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const origin = await listenLocal(server);
    const { context, page } = await subscriberPage(browser, origin, runtime, CATALOG_PAID);
    await page.evaluateOnNewDocument(markWithdrawal);
    const warmed = [];
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/constructed-cards') warmed.push(new URL(request.url()).searchParams.get('rank')); });
    await page.goto(`${origin}/standard/cards/standard/?view=table`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(paid => new RegExp(paid).test(document.querySelector('.constructed-cards__table')?.textContent ?? ''),
      { timeout: 25_000 }, CATALOG_PAID);
    await page.click('.constructed-cards__advanced-toggle');
    await page.click('.constructed-cards__rank-filter .constructed-cards__filter-trigger');
    const option = await page.waitForSelector('.constructed-cards__rank-filter [role="option"][aria-selected="false"]', { visible: true });
    proxy.list = trigger;
    await page.evaluate(() => { window.__paidAsked = true; });
    const box = await option.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
    await page.waitForFunction(() => window.__armed === true, { timeout: 15_000 });
    assert.ok(warmed.length > 0, `${trigger}: resting on a rank warms its slice`);
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 2000)));
    assert.deepEqual(await page.evaluate(() => window.__paidFrames.slice(0, 3)), [], `${trigger}: no paid number in the catalog after the warm answer`);
    await page.keyboard.press('Escape');
    const table = await page.$eval('.constructed-cards__table', node => node.textContent);
    assert.doesNotMatch(table, new RegExp(CATALOG_PAID), `${trigger}: the shown list is its open view`);
    assert.ok(await page.$('.constructed-cards__table [aria-label*="Тариф"], .constructed-cards__table .constructed-cards__locked-value, .constructed-cards__table button[aria-label*="по подписке"]'),
      `${trigger}: the paid columns stand as locks`);
    await context.close();
  } finally {
    await browser.close();
    await closeLocal(server);
  }
}

describe('paid card numbers leave with the access', { concurrency: 2 }, () => {
  // 1. The card route refuses the next request (the subscription ended on the server): the paid numbers already on the
  // page go in the frame the refusal arrives, before any check answers.
  test('a refused card request (401, 403) hides the paid numbers already loaded', { timeout: 180_000 }, async () => {
    const runtime = await cardPilot();
    const browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox'] });
    try {
      for (const status of [401, 403]) {
        const { context, page } = await subscriberPage(browser, runtime.origin, runtime);
        // The refusal is marked the moment the browser has it, before the page's own code sees the response.
        await page.evaluateOnNewDocument(() => {
          const realFetch = window.fetch.bind(window);
          window.fetch = async (...args) => {
            const response = await realFetch(...args);
            // Every frame from here on counts; the page's code reads the response after this returns.
            if ([401, 403].includes(response.status) && String(args[0]).includes('/api/constructed-cards/')) window.__armed = true;
            return response;
          };
        });
        let refuse = false;
        await page.setRequestInterception(true);
        page.on('request', request => {
          if (refuse && new URL(request.url()).pathname.startsWith('/api/constructed-cards/blizzard')) {
            void request.respond({ status, contentType: 'application/json', body: '{"error":"Статистика доступна по подписке"}' }).catch(() => {});
            return;
          }
          void request.continue().catch(() => {});
        });
        await page.goto(runtime.origin + CARD, { waitUntil: 'domcontentloaded' });
        await settled(page, 'full');
        assert.match(await pageText(page), /56,21%/, 'the paid numbers are loaded first');
        assert.match(await pageText(page), /61,37/, 'and the deck winrate');
        refuse = true;
        await (await page.waitForSelector('xpath/.//*[contains(@class,"constructed-card-detail__statistics-controls")]//button[contains(., "Последний день")]')).click();
        await (await page.waitForSelector('xpath/.//*[@role="option"][normalize-space()="Последние 3 дня"]', { visible: true })).click();
        await page.waitForFunction(() => window.__armed === true, { timeout: 15_000 });
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 3000)));
        assert.deepEqual(await page.evaluate(() => window.__paidFrames.slice(0, 3)), [], `${status}: no frame with a paid number after the refusal`);
        assert.doesNotMatch(await pageText(page), new RegExp(PAID), `${status}: the page ends without paid numbers`);
        await context.close();
      }
    } finally { await browser.close(); }
  });

  // 2. Legend's numbers are paid, its three «open» rows included: after a restore a check that fails or is late shows none.
  test('a restored Legend page whose access is not confirmed again shows none of its numbers', { timeout: 180_000 },
    () => restoredWithoutConfirmation([['?rank=legend', 'error'], ['?rank=legend', 'late']]));

  for (const trigger of [401, 403, 'guest']) {
    test(`a shown paid catalog turns open when the warm request of another slice is refused (${trigger})`, { timeout: 180_000 },
      () => catalogAfterWarmRefusal(trigger));
  }
  for (const trigger of [401, 403, 'guest', 'unconfirmed']) {
    test(`held paid answers show nothing after the server stops serving paid numbers (${trigger})`, { timeout: 180_000 },
      () => cachedSlicesAfterWithdrawal(trigger));
  }

  // 3. On the open slice the recommended decks' winrates are paid: after a restore a failed or late check shows none.
  test('a restored card page whose access is not confirmed again shows no deck winrate', { timeout: 180_000 },
    () => restoredWithoutConfirmation([['', 'error'], ['', 'late']]));
});
