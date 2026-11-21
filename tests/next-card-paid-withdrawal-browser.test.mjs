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

/** Counts the frames that show a paid figure anywhere in the card page once `window.__armed` is set. */
function watchFrames(paid) {
  const pattern = new RegExp(paid);
  window.__paidFrames = [];
  const look = when => {
    const text = document.querySelector('.constructed-card-detail')?.textContent ?? '';
    const found = text.match(pattern);
    if (window.__armed && found) window.__paidFrames.push({ when, found: found[0] });
  };
  window.__look = look;
  const sample = () => { look('frame'); requestAnimationFrame(sample); };
  requestAnimationFrame(sample);
}

const settled = (page, mode, timeout = 25_000) =>
  page.waitForSelector(`.constructed-card-detail__statistics dl.constructed-cards__stats[data-stats-mode="${mode}"]:not([aria-busy])`, { timeout });
const subscriberPage = async (browser, origin, runtime) => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const [name, value] = runtime.cookie.split('=');
  await page.setCookie({ name, value, url: origin });
  await page.evaluateOnNewDocument(watchFrames, PAID);
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

  // 3. On the open slice the recommended decks' winrates are paid: after a restore a failed or late check shows none.
  test('a restored card page whose access is not confirmed again shows no deck winrate', { timeout: 180_000 },
    () => restoredWithoutConfirmation([['', 'error'], ['', 'late']]));
});
