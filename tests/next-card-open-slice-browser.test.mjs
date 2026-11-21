import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// The card page's open slice (owner's decision 2026-11-21, #447): a guest reads Platinum · last day, three numbers,
// with a lock on every paid row. Every other rank (Legend included) and period is the same block with a lock on each
// row and no number; a subscriber reads everything. The block does not move while it settles.
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/google-chrome';
const CARD = '/standard/cards/standard/blizzard%3A12345/';
const LOCK = 'по подписке. Узнать, как открыть';

let pilot = null;
const cardPilot = () => (pilot ??= startPublicCardPilot({ pagesEnabled: true }).then(runtime => { runtime.grant(); return runtime; }));
after(async () => { if (pilot) await (await pilot).close(); });

/** What a reader sees in the statistics rows: each metric with its value, or «lock» where a lock stands. */
const readRows = page => page.$$eval('.constructed-card-detail__statistics .constructed-cards__stat', rows => rows.map(row => [
  row.querySelector('dt').textContent,
  row.querySelector('dd button[aria-label$="по подписке. Узнать, как открыть"]') ? 'lock' : row.querySelector('dd').textContent,
]));
const rankShown = page => page.$eval('.constructed-card-detail__statistics-controls', node => node.textContent);

async function open(browser, runtime, { viewer, search = '', viewport = { width: 1440, height: 900 }, intercept }) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(viewport);
  if (viewer === 'subscriber') {
    const [name, value] = runtime.cookie.split('=');
    await page.setCookie({ name, value, url: runtime.origin });
  }
  await page.evaluateOnNewDocument(() => {
    window.__shift = 0;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shift += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  if (intercept) await intercept(page);
  await page.goto(`${runtime.origin}${CARD}${search}`, { waitUntil: 'domcontentloaded' });
  return { page, context };
}

const settled = (page, mode) => page.waitForSelector(`dl.constructed-cards__stats[data-stats-mode="${mode}"]:not([aria-busy])`, { timeout: 25_000 });

describe('card page open slice', { concurrency: 2 }, () => {
  test('a guest on Platinum · last day reads three numbers and finds the rest locked, on a desktop and a phone', { timeout: 180_000 }, async () => {
    const runtime = await cardPilot();
    const browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox'] });
    try {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
        const { page, context } = await open(browser, runtime, { viewer: 'guest', viewport });
        await settled(page, 'locked');
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1500)));
        assert.deepEqual(await readRows(page), [
          ['Популярность', '12,5%'], ['Винрейт колод с картой', '53,0%'], ['Винрейт, если сыграна', 'lock'],
          ['Винрейт, если взята', 'lock'], ['Оставляют в муллигане', 'lock'], ['Винрейт из стартовой руки', 'lock'],
          ['Обычно разыгрывают на ходу', 'lock'], ['Копий в колоде', '1,9'], ['Партий в выборке', 'lock'],
        ], `${viewport.width}px`);
        assert.match(await rankShown(page), /РангПлатина/);
        const shift = await page.evaluate(() => window.__shift);
        assert.ok(shift < 0.01, `${viewport.width}px: CLS ${shift}`);
        await context.close();
      }
    } finally { await browser.close(); }
  });

  test('a guest on Legend or on another period finds a lock on every row and no number', { timeout: 180_000 }, async () => {
    const runtime = await cardPilot();
    const browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox'] });
    try {
      for (const [search, heading] of [['?rank=legend', 'Статистика · Легенда'], ['?period=7d', 'Статистика · Платина']]) {
        const { page, context } = await open(browser, runtime, { viewer: 'guest', search });
        await settled(page, 'locked');
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1500)));
        const rows = await readRows(page);
        assert.equal(rows.length, 9, search);
        assert.deepEqual(rows.filter(([, value]) => value !== 'lock'), [], `${search}: every row is a lock`);
        assert.equal(await page.$eval('.constructed-card-detail__statistics h2', node => node.textContent), heading);
        assert.ok((await page.evaluate(() => window.__shift)) < 0.01, `${search}: CLS`);
        await context.close();
      }
    } finally { await browser.close(); }
  });

  test('a guest picking a closed rank gets the offer and keeps the open slice', { timeout: 120_000 }, async () => {
    const runtime = await cardPilot();
    const browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox'] });
    try {
      const { page, context } = await open(browser, runtime, { viewer: 'guest' });
      await settled(page, 'locked');
      const rank = await page.waitForSelector('xpath/.//*[contains(@class,"constructed-card-detail__statistics-controls")]//button[contains(., "Платина")]');
      await rank.click();
      const legend = await page.waitForSelector(`[role="option"][aria-label="Легенда, по подписке"]`, { visible: true });
      await legend.click();
      await page.waitForSelector('[role="dialog"]', { visible: true, timeout: 10_000 });
      assert.equal(new URL(page.url()).search, '', 'the address keeps the open slice');
      assert.equal((await readRows(page))[0][1], '12,5%');
      await context.close();
    } finally { await browser.close(); }
  });

  test('a subscriber reads every number on Legend; refused access (401, 403) never shows a paid number', { timeout: 180_000 }, async () => {
    const runtime = await cardPilot();
    const browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox'] });
    try {
      const { page, context } = await open(browser, runtime, { viewer: 'subscriber', search: '?rank=legend' });
      await settled(page, 'full');
      const rows = await readRows(page);
      assert.deepEqual(rows.filter(([, value]) => value === 'lock'), [], 'a subscriber sees no lock');
      assert.deepEqual(rows.slice(0, 3), [['Популярность', '12,5%'], ['Винрейт колод с картой', '53,0%'], ['Винрейт, если сыграна', '56,21%']]);
      assert.match(await rankShown(page), /РангЛегенда/);
      await context.close();
      for (const status of [401, 403]) {
        // The session cookie is there, but the access answer refuses it: the page is a guest's, frame by frame.
        const refused = await open(browser, runtime, {
          viewer: 'subscriber',
          intercept: async target => {
            await target.evaluateOnNewDocument(() => {
              window.__paidFrames = 0;
              const sample = () => {
                if (/56,21|54,13|42,6|52,84|20\s000/.test(document.querySelector('.constructed-card-detail__statistics')?.textContent ?? '')) window.__paidFrames += 1;
                requestAnimationFrame(sample);
              };
              requestAnimationFrame(sample);
            });
            await target.setRequestInterception(true);
            target.on('request', request => {
              const { pathname } = new URL(request.url());
              if (['/api/subscription/status', '/api/auth/me'].includes(pathname)) {
                void request.respond({ status, contentType: 'application/json', body: '{"error":"denied"}' }).catch(() => {});
                return;
              }
              void request.continue().catch(() => {});
            });
          },
        });
        await settled(refused.page, 'locked');
        await refused.page.evaluate(() => new Promise(resolve => setTimeout(resolve, 2000)));
        assert.equal(await refused.page.evaluate(() => window.__paidFrames), 0, `${status}: no frame with a paid number`);
        await refused.context.close();
      }
    } finally { await browser.close(); }
  });
});
