import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// Two browsers of one subscriber on the real backend: A1 ends A2's session
// from the account page. A2's next session check answers as a guest, its
// remembered viewer is forgotten, and no frame on the way shows A2 the paid
// card statistics (docs/specs/account-sessions.md).
const CARD = '/standard/cards/standard/blizzard%3A12345/';
// The statistics head says when the data was updated only when the server sent
// the paid statistics for this viewer; locked and pending rows never say it.
const PAID_STATS = '.constructed-card-detail__statistics:not(.is-locked) > [data-tour-id="card-statistics"] span';
const paidShown = selector => [...document.querySelectorAll(selector)].some(node => node.textContent.includes('обновлено'));
const LOCKS = '.constructed-cards__stats-lock, .constructed-cards__locked-value, .arena-inline-paywall, .arena-paywall';
const sha = value => createHash('sha256').update(value).digest('hex');
const viewerTag = token => createHash('sha256').update(`hearthpulse-viewer-session:${token}`).digest('base64url').slice(0, 22);

function recordFrames(paidSelector, lockSelector) {
  window.__frames = [];
  const paidShown = selector => [...document.querySelectorAll(selector)].some(node => node.textContent.includes('обновлено'));
  const sample = () => {
    if (!document.body) return;
    window.__frames.push({
      at: Math.round(performance.now()),
      paid: paidShown(paidSelector),
      lock: Boolean(document.querySelector(lockSelector)),
      marked: document.documentElement.dataset.hpViewer ?? null,
    });
  };
  const everyFrame = () => { sample(); requestAnimationFrame(everyFrame); };
  requestAnimationFrame(everyFrame);
  new MutationObserver(sample).observe(document, { childList: true, subtree: true, attributes: true });
}

test('ending another browser\'s session makes it a guest at its next check, without paid statistics on the way', { timeout: 240_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  runtime.grant();
  const now = new Date().toISOString();
  const addSession = token => runtime.backend.database.prepare(`INSERT INTO sessions (token_hash, user_id, email, expires_at, created_at)
    VALUES (?, 'card-reader', 'card-reader@example.test', ?, ?)`).run(sha(token), Date.now() + 3_600_000, now);
  const a1 = runtime.cookie.split('=')[1];
  const a2 = 'second-browser-session-token';
  const a3 = 'third-browser-session-token';
  addSession(a2);
  addSession(a3);
  const host = new URL(runtime.origin).hostname;
  const signIn = (context, token) => context.setCookie(
    { name: 'manacost_auth_token', value: token, domain: host, path: '/' },
    { name: 'hp_viewer', value: viewerTag(token), domain: host, path: '/' });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });

    // A2 has seen the paid statistics, so it remembers the subscriber for its session.
    const second = await browser.createBrowserContext();
    await signIn(second, a2);
    const earlier = await second.newPage();
    await earlier.goto(`${runtime.origin}${CARD}`, { waitUntil: 'domcontentloaded' });
    await earlier.waitForFunction(paidShown, { timeout: 30_000 }, PAID_STATS);
    await earlier.waitForFunction(() => localStorage.getItem('hs_arena_viewer_hint'), { timeout: 30_000 });
    await earlier.close();

    // A1 lists the sessions and ends A2's.
    const first = await browser.createBrowserContext();
    await signIn(first, a1);
    const account = await first.newPage();
    for (const width of [390, 1440]) {
      await account.setViewport({ width, height: 900 });
      await account.goto(`${runtime.origin}/?login`, { waitUntil: 'domcontentloaded' });
      await account.waitForFunction(() => document.querySelectorAll('.account-sessions__row').length === 3, { timeout: 30_000 });
      // The account stylesheet arrives with its lazy chunk.
      await account.waitForFunction(() => getComputedStyle(document.querySelector('.account-sessions')).borderTopStyle === 'solid'
        && getComputedStyle(document.querySelector('.account-sessions .account-button')).minHeight !== '0px', { timeout: 15_000 });
      assert.equal(await account.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `no overflow at ${width}px`);
      const small = await account.$$eval('.account-sessions button', buttons => buttons
        .filter(button => button.getBoundingClientRect().height < 40).map(button => button.textContent));
      assert.deepEqual(small, [], `touch targets at ${width}px`);
    }
    const rows = () => account.$$eval('.account-sessions__row', items => items.map(item => item.textContent));
    assert.match((await rows())[0], /Этот браузер/, 'this browser comes first and cannot be ended here');
    assert.equal(await account.$$eval('.account-sessions__row:first-child button', buttons => buttons.length), 0);
    const a2Row = await account.$$eval('.account-sessions__row', items => items.findIndex(item => /активен/.test(item.textContent) && !/Этот браузер/.test(item.textContent)));
    assert.ok(a2Row > 0, 'the browser that was just active shows when');
    await account.click(`.account-sessions__row:nth-child(${a2Row + 1}) button`);
    await account.waitForFunction(() => document.querySelectorAll('.account-sessions__row').length === 2, { timeout: 15_000 });
    assert.match(await account.$eval('.account-message', node => node.textContent), /Сеанс завершён/);

    // A2's next page: the session check answers as a guest; paid statistics never appear.
    const page = await second.newPage();
    await page.evaluateOnNewDocument(recordFrames, PAID_STATS, LOCKS);
    await page.goto(`${runtime.origin}${CARD}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !localStorage.getItem('hs_arena_viewer_hint') && !/hp_viewer=/.test(document.cookie), { timeout: 30_000 });
    await page.waitForSelector(LOCKS, { timeout: 30_000 });
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));
    const frames = await page.evaluate(() => window.__frames);
    assert.ok(frames.length > 5, 'frames were sampled');
    assert.deepEqual(frames.filter(frame => frame.paid).slice(0, 1), [], 'no frame shows A2 the paid statistics');
    assert.equal(await page.evaluate(() => fetch('/api/auth/me').then(response => response.json()).then(body => body.user)), null);
    assert.equal(await page.evaluate(() => fetch('/api/subscription/status').then(response => response.status)), 401);
    await page.close();

    // The remembered viewer is gone for good: the following page shows nobody before its check.
    const later = await second.newPage();
    await later.evaluateOnNewDocument(recordFrames, PAID_STATS, LOCKS);
    await later.goto(`${runtime.origin}${CARD}`, { waitUntil: 'domcontentloaded' });
    await later.waitForSelector(LOCKS, { timeout: 30_000 });
    const laterFrames = await later.evaluate(() => window.__frames);
    assert.deepEqual(laterFrames.filter(frame => frame.marked || frame.paid).slice(0, 1), [], 'no remembered viewer, no paid frame');
    await second.close();

    // «Выйти на всех других устройствах» asks first, then ends the rest and keeps this browser.
    await account.click('.account-sessions__others');
    await account.waitForSelector('.account-sessions__confirm');
    assert.equal(await account.$$eval('.account-sessions__row', items => items.length), 2, 'nothing ends before the confirmation');
    await account.click('.account-sessions__confirm .account-button:not(.account-button--secondary)');
    await account.waitForFunction(() => document.querySelectorAll('.account-sessions__row').length === 1, { timeout: 15_000 });
    assert.equal(await account.$$('.account-sessions__others').then(found => found.length), 0);
    const me = token => fetch(`${runtime.origin}/api/auth/me`, { headers: { Cookie: `manacost_auth_token=${token}` } })
      .then(response => response.json());
    assert.equal((await me(a3)).user, null);
    assert.equal((await me(a1)).user?.id, 'card-reader');
    await first.close();
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
