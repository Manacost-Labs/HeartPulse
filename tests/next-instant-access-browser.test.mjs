import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import puppeteer from 'puppeteer';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

// Instant access (docs/specs/instant-viewer-access.md): a browser that has
// verified a viewer for this session shows that viewer, and the paid pages it
// may open, from the first client paint instead of after the session check.
// The session check answers late here, as it does on a phone.
const SESSION_DELAY_MS = 3000;
const SUBSCRIBER = { id: 'instant-reader', email: 'instant@example.test', name: 'Подписчица', role: 'user' };
const SUBSCRIBED = { hasAccess: true, entitlements: { battlegrounds: true, standard: true, arena: true }, source: 'boosty',
  checkedAt: null, stale: false, message: '', boosty: {}, patreon: {}, telegram: {} };
const LAPSED = { ...SUBSCRIBED, hasAccess: false, entitlements: {}, message: 'Подписка не найдена' };
const OTHER_READER = { id: 'instant-other', email: 'other@example.test', name: 'Другая Читательница', role: 'user' };
const TAG = 'instant-session-tag-01';
const FILMSTRIP_DIR = process.env.HP_FILMSTRIP_DIR || '';
// How long a wait for a page to reach a state may take on a loaded CI runner.
// It bounds waiting only; what each state must look like is asserted separately.
const READY_MS = 45_000;
// When the page first offered a retry, by its own clock (ms since it started).
async function offeredRetryAt(page) {
  await page.waitForFunction(() => window.__frames.some(frame => frame.unavailable), { timeout: READY_MS });
  return page.evaluate(() => window.__frames.find(frame => frame.unavailable).at);
}
const PAID_PAGES = [
  ['/battlegrounds/tier-list/', '.bg-tier-list-page'],
  ['/standard/matchups/', '.standard-matchups'],
  ['/standard/vicious-gold/', '.vsgold'],
];

// Cookies choose what the API says: `reader` names the session's account
// (`1` the subscriber, `b` another account), `plan` its subscription, `fail` a
// broken session check (`session`, or `hang`: a body that never ends) or
// status service (`status`: 429, `status401`: the session ended). Like the
// real server, /api/auth/me names the session's tag when the request carried
// it (a guest answer names whatever tag it carried), writes no cookie, and
// forms its answer when the request arrives (a late answer carries what was
// true then).
const TAGS = { 1: TAG, b: 'another-session-tag-02' };
function startGateway(nextOrigin) {
  const next = new URL(nextOrigin);
  const requests = [];
  // Extra cookies a sign-in sets come from the test's own `signin` cookie
  // (`statusdelay`, `status401`, `bodydelay`), so concurrent tests do not share
  // gateway state; requests are recorded with the test's `t` cookie.
  const SIGN_IN_COOKIES = { statusdelay: 'statusdelay=1', status401: 'fail=status401' };
  // `bodydelay=<id>`: the subscription answer's headers go out at once and its
  // body only when the test calls `releaseBody(id)`, so the test decides what
  // happens while the body is on its way.
  const heldBodies = new Map();
  const gateway = {
    releaseBody: id => { heldBodies.get(id)?.(); heldBodies.delete(id); },
    holdsBody: id => heldBodies.has(id),
  };
  const server = http.createServer((request, response) => {
    const cookies = Object.fromEntries(String(request.headers.cookie ?? '').split(/;\s*/).filter(Boolean)
      .map(pair => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]));
    const account = { 1: SUBSCRIBER, b: OTHER_READER }[cookies.reader] ?? null;
    const reader = account === SUBSCRIBER;
    const json = (payload, status = 200, headers = {}) => response.writeHead(status, { 'Content-Type': 'application/json',
      'Cache-Control': 'no-store', ...headers }).end(JSON.stringify(payload));
    if (request.url.startsWith('/api/')) requests.push({ url: request.url, t: cookies.t ?? '' });
    if (request.url === '/api/auth/me') {
      if (cookies.fail === 'session') return json({ error: 'down' }, 503);
      if (cookies.fail === 'hang') {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.write('{"user":');
        return;
      }
      // A guest answer names the tag the request carried; no answer writes cookies.
      const viewerSession = account ? (cookies.hp_viewer === TAGS[cookies.reader] ? TAGS[cookies.reader] : null)
        : cookies.hp_viewer ?? null;
      const tagCookie = {};
      // `guestdelay`: a guest answer that arrives late.
      const delay = account === OTHER_READER ? 0 : !account && cookies.guestdelay === '1' ? 3000 : account ? SESSION_DELAY_MS : 0;
      setTimeout(() => json({ user: account, viewerSession }, 200, tagCookie), delay);
      return;
    }
    if (request.url === '/api/auth/login' && request.method === 'POST') {
      request.resume();
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
        'Set-Cookie': ['reader=1; Path=/', `hp_viewer=${TAG}; Path=/`,
          ...(SIGN_IN_COOKIES[cookies.signin] ? [`${SIGN_IN_COOKIES[cookies.signin]}; Path=/`] : []),
          ...(cookies.signin?.startsWith('bodydelay-') ? [`bodydelay=${cookies.signin}; Path=/`] : [])] });
      response.end(JSON.stringify({ success: true, message: 'ok', authenticated: true, user: SUBSCRIBER,
        adminAllowed: false, contestAdminAllowed: false }));
      return;
    }
    if (request.url === '/api/subscription/status') {
      if (!account) return json({ error: 'guest' }, 401);
      if (cookies.statusdelay === '1' && cookies.fail !== 'status401') {
        setTimeout(() => json(cookies.plan === 'lapsed' || !reader ? LAPSED : SUBSCRIBED), 2500);
        return;
      }
      if (cookies.fail === 'status') return json({ error: 'busy' }, 429);
      if (cookies.fail === 'status401') return json({ error: 'session ended' }, 401);
      if (cookies.fail === 'late401') return setTimeout(() => json({ error: 'session ended' }, 401), 2500);
      if (cookies.bodydelay) {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        const body = JSON.stringify(cookies.plan === 'lapsed' || !reader ? LAPSED : SUBSCRIBED);
        response.write(body.slice(0, 10));
        const release = () => { if (!response.destroyed) response.end(body.slice(10)); };
        const earlier = heldBodies.get(cookies.bodydelay);
        heldBodies.set(cookies.bodydelay, () => { earlier?.(); release(); });
        return;
      }
      return json(cookies.plan === 'lapsed' || !reader ? LAPSED : SUBSCRIBED);
    }
    if (request.url.startsWith('/api/search')) {
      return json({ query: 'гайд', minimumQueryLength: 2, cards: [], articles: [{ id: 'vip-guide', title: 'Гайд по мете',
        excerpt: '', tag: 'Гайд', mode: 'standard', date: '20.10.2026', url: 'https://example.test/guide', image: '', vip: true }] });
    }
    if (reader && request.url.startsWith('/api/bg/tier-lists')) {
      return json({ list: 'heroes', count: 0, tiers: { S: [], A: [], B: [], C: [], D: [] } });
    }
    // Other paid data is out of scope: a subscriber gets an error state, never a gate.
    if (request.url.startsWith('/api/')) return json({ error: reader ? 'unavailable' : 'guest' }, reader ? 503 : 401);
    const upstream = http.request(next, { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  return listenLocal(server).then(origin => Object.assign(gateway, { server, origin, requests }));
}

// Samples every animation frame from the first one, and every DOM change in
// between (so no state is missed on a busy runner): what the visitor could
// see. A placeholder whose text is hidden does not count as "checking".
function recordFrames() {
  window.__frames = [];
  const visible = element => element && getComputedStyle(element).visibility !== 'hidden'
    && element.getClientRects().length > 0;
  const sample = () => {
    if (document.body) {
      const pending = [...document.querySelectorAll('.arena-paywall-pending p')].some(visible);
      const text = document.body.textContent;
      window.__frames.push({
        at: performance.now(),
        marked: document.documentElement.dataset.hpViewer ?? null,
        unavailable: Boolean(document.querySelector('.arena-access-unavailable')),
        gate: Boolean(document.querySelector('.arena-paywall, .arena-inline-paywall')),
        preview: text.includes('Раздел подписчиков'),
        // The element scan runs only when the text is on the page at all, so
        // sampling stays cheap on every DOM change.
        checking: pending || (text.includes('Проверяем доступ') && [...document.querySelectorAll('*')]
          .some(node => node.childElementCount === 0 && /Проверяем доступ/.test(node.textContent) && visible(node))),
        viewer: text.includes('Подписчица'),
        hint: localStorage.getItem('hs_arena_viewer_hint'),
        paid: Boolean(document.querySelector('.arena-paid-view, .bg-tier-list-page, .standard-matchups__table, .vsgold-section, .vsgold__loading, .standard-matchups [class*="loading"], [aria-busy="true"].standard-matchups')),
      });
    }
  };
  const everyFrame = () => { sample(); requestAnimationFrame(everyFrame); };
  requestAnimationFrame(everyFrame);
  new MutationObserver(sample).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
}

// One Next server, gateway and browser for the whole file; every test works
// in its own browser context (its own cookies and storage), so tests can run
// side by side.
let shared = null;
function sharedRuntime() {
  shared ??= (async () => {
    const express = http.createServer((request, response) => response.writeHead(401).end());
    const next = await startNextServer({ legacyOrigin: await listenLocal(express) });
    const gateway = await startGateway(next.origin);
    const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    // Scenarios run side by side in one browser, and a page that loses focus
    // to another closes focus-bound UI (the search panel): every page keeps
    // focus as if it were alone. HP_CPU_THROTTLE=4 also runs every page on a
    // 4x slower CPU, as on a busy CI runner.
    const throttle = Number(process.env.HP_CPU_THROTTLE || 0);
    browser.on('targetcreated', async target => {
      const page = await target.page().catch(() => null);
      if (!page) return;
      const session = await page.createCDPSession().catch(() => null);
      await session?.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
      if (throttle > 1) await page.emulateCPUThrottling(throttle).catch(() => {});
    });
    return { express, next, gateway, browser };
  })();
  return shared;
}
after(async () => {
  if (!shared) return;
  const { express, next, gateway, browser } = await shared;
  await browser.close();
  await closeLocal(gateway.server);
  await next.close();
  await closeLocal(express);
});

async function withBrowser(run) {
  const { browser, gateway } = await sharedRuntime();
  await run({ browser, gateway });
}

async function setCookies(page, origin, cookies) {
  await page.setCookie(...Object.entries(cookies).map(([name, value]) => ({ name, value, url: origin })));
}

// The first visit is an ordinary one: the session check answers and the page
// remembers the viewer for this session.
async function verifyOnce(context, origin, cookies, viewport) {
  const page = await context.newPage();
  await page.setViewport(viewport);
  await setCookies(page, origin, cookies);
  await page.goto(`${origin}/battlegrounds/tier-list/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => localStorage.getItem('hs_arena_viewer_hint'), { timeout: READY_MS });
  await page.close();
}

async function filmstrip(page, name) {
  if (!FILMSTRIP_DIR) return async () => {};
  const frames = [];
  const session = await page.createCDPSession();
  session.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    frames.push({ data, at: metadata.timestamp });
    session.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await session.send('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 1 });
  return async () => {
    await session.send('Page.stopScreencast').catch(() => {});
    const directory = path.join(FILMSTRIP_DIR, name);
    await mkdir(directory, { recursive: true });
    const start = frames[0]?.at ?? 0;
    await Promise.all(frames.map((frame, index) => writeFile(
      path.join(directory, `${String(index).padStart(3, '0')}-${Math.round((frame.at - start) * 1000)}ms.jpg`),
      Buffer.from(frame.data, 'base64'))));
  };
}

const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }];

// Scenarios are independent (each has its own browser context and cookies),
// so they run side by side on the shared runtime to keep the browser suite short.
describe('instant viewer access', { concurrency: 4 }, () => {
test('a remembered subscriber sees the account and the paid pages without a gate or an access check', async () => {
  await withBrowser(async ({ browser, gateway }) => {
    for (const viewport of viewports) {
      const context = await browser.createBrowserContext();
      const cookies = { reader: '1', hp_viewer: TAG };
      await verifyOnce(context, gateway.origin, cookies, viewport);
      for (const [route, root] of PAID_PAGES) {
        const page = await context.newPage();
        await page.setViewport(viewport);
        await page.evaluateOnNewDocument(recordFrames);
        const reactErrors = [];
        page.on('console', message => {
          if (message.type() === 'error' && /hydrat|recoverable|Minified React error/i.test(message.text())) reactErrors.push(message.text());
        });
        page.on('pageerror', error => reactErrors.push(error.message));
        const stop = await filmstrip(page, `subscriber-${viewport.width}${route.replaceAll('/', '_')}`);
        await page.goto(`${gateway.origin}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector(root, { timeout: READY_MS });
        // Wait for the late session check and the subscription answer to settle.
        await page.waitForFunction(() => performance.getEntriesByType('resource')
          .some(entry => entry.name.endsWith('/api/subscription/status')), { timeout: READY_MS });
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
        await stop();
        const { frames, marked, sessionEnd, firstViewer } = await page.evaluate(() => {
          const session = performance.getEntriesByType('resource').find(entry => entry.name.endsWith('/api/auth/me'));
          return { frames: window.__frames, marked: window.__frames[0]?.marked,
            sessionEnd: session?.responseEnd ?? null, firstViewer: window.__frames.find(frame => frame.viewer)?.at ?? null };
        });
        const label = `${route} at ${viewport.width}px`;
        assert.ok(frames.length > 5, `${label} sampled frames`);
        assert.equal(marked, 'remembered', `${label} head script marks the remembered viewer before the first paint`);
        assert.deepEqual(reactErrors, [], `${label} hydrates without errors`);
        assert.deepEqual(frames.filter(frame => frame.gate || frame.preview).slice(0, 1), [], `${label} never shows the gate or its preview`);
        assert.deepEqual(frames.filter(frame => frame.checking).slice(0, 1), [], `${label} never says it checks access`);
        assert.ok(firstViewer !== null && sessionEnd !== null && firstViewer < sessionEnd,
          `${label} shows the account before the session check answers (${firstViewer} vs ${sessionEnd})`);
        await page.close();
      }
      await context.close();
    }
  });
});

test('a revoked subscription replaces the remembered paid page with the gate', async () => {
  await withBrowser(async ({ browser, gateway }) => {
    const context = await browser.createBrowserContext();
    const viewport = viewports[0];
    await verifyOnce(context, gateway.origin, { reader: '1', hp_viewer: TAG }, viewport);
    const page = await context.newPage();
    await page.setViewport(viewport);
    await setCookies(page, gateway.origin, { plan: 'lapsed' });
    await page.goto(`${gateway.origin}/standard/matchups/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.arena-paywall .arena-paywall__dialog', { timeout: READY_MS });
    assert.match(await page.$eval('.arena-paywall', node => node.textContent), /Подписка не найдена/);
    // The next page remembers the lapsed plan: the gate, not the paid page, from the start.
    const hint = await page.evaluate(() => JSON.parse(localStorage.getItem('hs_arena_viewer_hint')));
    assert.equal(hint.access.hasAccess, false);
    assert.deepEqual(hint.access.entitlements, {});
    await page.close();
    await context.close();
  });
});

test('a shared device never shows the previous viewer after the session ends', async () => {
  await withBrowser(async ({ browser, gateway }) => {
    const context = await browser.createBrowserContext();
    const viewport = viewports[1];
    await verifyOnce(context, gateway.origin, { reader: '1', hp_viewer: TAG }, viewport);
    // The session ended (expired, signed out elsewhere): the server dropped
    // both cookies; the previous viewer's memory stays in localStorage.
    const page = await context.newPage();
    await page.setViewport(viewport);
    await page.deleteCookie({ name: 'reader', url: gateway.origin }, { name: 'hp_viewer', url: gateway.origin });
    await page.evaluateOnNewDocument(recordFrames);
    await page.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.arena-paywall .arena-paywall__dialog', { timeout: READY_MS });
    const { frames, hint } = await page.evaluate(() => ({ frames: window.__frames,
      hint: localStorage.getItem('hs_arena_viewer_hint') }));
    assert.deepEqual(frames.filter(frame => frame.marked).slice(0, 1), [], 'no frame marks a remembered viewer');
    assert.deepEqual(frames.filter(frame => frame.viewer || frame.paid).slice(0, 1), [], 'no frame shows the previous viewer');
    assert.equal(hint, null, 'the guest answer forgets the previous viewer');
    await page.close();

    // Another account's session on the same device: another tag, same rule.
    const other = await context.newPage();
    await setCookies(other, gateway.origin, { hp_viewer: 'another-session-tag-02' });
    await other.evaluateOnNewDocument(recordFrames);
    await other.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'domcontentloaded' });
    await other.waitForSelector('.arena-paywall .arena-paywall__dialog', { timeout: READY_MS });
    assert.deepEqual(await other.evaluate(() => window.__frames.filter(frame => frame.viewer).length), 0);
    await other.close();
    await context.close();
  });
});

test('a session check that keeps failing ends in a gate that can retry', async () => {
  await withBrowser(async ({ browser, gateway }) => {
    // With and without this browser's own memory of a session: a failed check
    // is unavailable either way, never a guest's lock.
    // The variants wait out the same deadline, so they run side by side.
    await Promise.all([['session', false, true], ['status', true, true], ['session', false, false]].map(async ([fail, expectsViewer, remembered]) => {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport(viewports[1]);
      const t = `failing-${fail}-${remembered}`;
      await setCookies(page, gateway.origin, { reader: '1', fail, t });
      if (remembered) await page.evaluateOnNewDocument(() => localStorage.setItem('hs_arena_auth_cookie_hint', '1'));
      await page.evaluateOnNewDocument(recordFrames);
      await page.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.arena-paywall-pending', { timeout: READY_MS });
      await page.waitForSelector('.arena-access-unavailable', { timeout: READY_MS });
      // The page's own clock: from its start to the retry offer, within the
      // check's 10 s deadline plus the time to load and render.
      const elapsed = await offeredRetryAt(page);
      assert.ok(elapsed < 20_000, `${fail}: the pending state ends within its deadline (${Math.round(elapsed)} ms)`);
      // A failed check is neither a grant nor a refusal: a retry, never the lock or the subscription pitch.
      assert.match(await page.$eval('.arena-access-unavailable', node => node.textContent), /Не удалось проверить доступ/, fail);
      assert.equal(await page.$('.arena-paywall'), null, `${fail}: no lock for an unconfirmed refusal`);
      assert.deepEqual(await page.evaluate(() => window.__frames.filter(frame => frame.gate).length), 0, `${fail}: no lock frame`);
      const retry = await page.$$eval('.arena-access-unavailable button', buttons => buttons.map(button => button.textContent));
      assert.ok(retry.includes('Повторить проверку'), `${fail}: ${retry}`);
      const header = await page.evaluate(() => document.body.textContent.includes('Подписчица'));
      assert.equal(header, expectsViewer, `${fail}: header shows the confirmed account only`);
      // Bounded: no endless polling once the gate is shown.
      const counted = () => gateway.requests.filter(request => request.t === t
        && request.url === (fail === 'session' ? '/api/auth/me' : '/api/subscription/status')).length;
      // A request sent just before the page gave up can reach the gateway a
      // little later on a busy runner; count from after that, then make sure
      // nothing new comes for longer than the longest retry delay (3 s).
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1_000)));
      const checks = counted();
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 3_500)));
      assert.equal(counted(), checks, `${fail}: no more checks after giving up`);
      assert.ok(checks <= 10, `${fail}: ${checks} checks`);
      // The retry action runs the check again; a recovered server lets the subscriber in.
      await page.deleteCookie({ name: 'fail', url: gateway.origin });
      await page.click('.arena-access-unavailable button');
      await page.waitForSelector('.bg-tier-list-page', { timeout: READY_MS });
      await page.close();
      await context.close();
    }));
  });
});

test('a late answer about the previous session is never shown or remembered for the new one', async () => {
  await withBrowser(async ({ browser, gateway }) => {
    const context = await browser.createBrowserContext();
    const viewport = viewports[0];
    await verifyOnce(context, gateway.origin, { reader: '1', hp_viewer: TAG }, viewport);
    const page = await context.newPage();
    await page.setViewport(viewport);
    await page.evaluateOnNewDocument(recordFrames);
    await page.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'domcontentloaded' });
    // Another tab signs in as another account while this page's session
    // check (sent with the subscriber's session) is still on its way.
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));
    await setCookies(page, gateway.origin, { reader: 'b', hp_viewer: 'another-session-tag-02' });
    await page.waitForFunction(() => document.body.textContent.includes('Другая Читательница'), { timeout: READY_MS });
    await page.waitForSelector('.arena-paywall .arena-paywall__dialog', { timeout: READY_MS });
    const { frames, hint } = await page.evaluate(() => ({ frames: window.__frames,
      hint: JSON.parse(localStorage.getItem('hs_arena_viewer_hint') ?? 'null') }));
    const crossed = frames.map(frame => JSON.parse(frame.hint ?? 'null'))
      .filter(stored => stored?.tag === 'another-session-tag-02' && stored.user.id !== 'instant-other');
    assert.deepEqual(crossed, [], 'the new session never remembers the previous account');
    assert.equal(hint?.user.id, 'instant-other');
    assert.equal(hint?.access.hasAccess, false);
    assert.equal(await page.evaluate(() => document.body.textContent.includes('Подписчица')), false);
    await page.close();
    await context.close();
  });
});

test('a session check whose answer never finishes ends at its deadline without a lock, with no memory of the session', async () => {
  await withBrowser(async ({ browser, gateway }) => {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport(viewports[0]);
    await setCookies(page, gateway.origin, { reader: '1', fail: 'hang' });
    await page.evaluateOnNewDocument(recordFrames);
    await page.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.arena-access-unavailable', { timeout: READY_MS });
    assert.ok(await offeredRetryAt(page) < 20_000, 'the hung check ends within its deadline');
    assert.deepEqual(await page.evaluate(() => window.__frames.filter(frame => frame.gate).length), 0, 'never the lock');
    await context.close();
  });
});

test('a session check whose answer never finishes ends at its deadline and drops the remembered viewer', async () => {
  await withBrowser(async ({ browser, gateway }) => {
    const context = await browser.createBrowserContext();
    const viewport = viewports[1];
    await verifyOnce(context, gateway.origin, { reader: '1', hp_viewer: TAG }, viewport);
    const page = await context.newPage();
    await page.setViewport(viewport);
    await setCookies(page, gateway.origin, { fail: 'hang' });
    await page.evaluateOnNewDocument(recordFrames);
    await page.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.arena-access-unavailable', { timeout: READY_MS });
    const elapsed = await offeredRetryAt(page);
    assert.ok(elapsed < 20_000, `the hung check ends within its deadline (${Math.round(elapsed)} ms)`);
    assert.match(await page.$eval('.arena-access-unavailable', node => node.textContent), /Не удалось проверить доступ/);
    assert.deepEqual(await page.evaluate(() => window.__frames.filter(frame => frame.gate).length), 0, 'never the lock');
    const state = await page.evaluate(() => ({ viewer: document.body.textContent.includes('Подписчица'),
      paid: Boolean(document.querySelector('.bg-tier-list-page')), shownEarlier: window.__frames.some(frame => frame.viewer) }));
    assert.deepEqual(state, { viewer: false, paid: false, shownEarlier: true },
      'the remembered viewer shows at first, and goes when the check cannot confirm it');
    await page.close();
    await context.close();
  });
});

test('a late answer that put back the old session tag is dropped once another tab confirmed another account', async () => {
  await withBrowser(async ({ browser, gateway }) => {
    const context = await browser.createBrowserContext();
    const viewport = viewports[0];
    // Tab 1 checks the subscriber's session; the server, which has no tag
    // cookie from this browser yet, answers with the tag, but late.
    const first = await context.newPage();
    await first.setViewport(viewport);
    await setCookies(first, gateway.origin, { reader: '1' });
    await first.evaluateOnNewDocument(recordFrames);
    await first.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'domcontentloaded' });
    // Meanwhile tab 2 signs in as another account and confirms it.
    const second = await context.newPage();
    await second.setViewport(viewport);
    await setCookies(second, gateway.origin, { reader: 'b', hp_viewer: TAGS.b });
    await second.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'domcontentloaded' });
    await second.waitForFunction(() => document.body.textContent.includes('Другая Читательница'), { timeout: READY_MS });
    // Tab 1's late answer arrives and puts the subscriber's tag back; the
    // visitor returns to tab 1 (a background tab may defer its rendering).
    await first.evaluate(delay => new Promise(resolve => setTimeout(resolve, delay)), SESSION_DELAY_MS + 2_000);
    await first.bringToFront();
    await first.waitForFunction(() => document.body.textContent.includes('Другая Читательница'), { timeout: READY_MS });
    const { frames, hint } = await first.evaluate(() => ({ frames: window.__frames,
      hint: JSON.parse(localStorage.getItem('hs_arena_viewer_hint') ?? 'null') }));
    assert.deepEqual(frames.filter(frame => frame.viewer).slice(0, 1), [], 'the previous account is never shown');
    assert.equal(hint?.user.id ?? 'instant-other', 'instant-other', 'nor remembered');
    assert.equal(hint?.tag ?? TAGS.b, TAGS.b);
    await context.close();
  });
});

test('a session that ends between the session and subscription answers leaves a guest', async () => {
  await withBrowser(async ({ browser, gateway }) => {
    const context = await browser.createBrowserContext();
    const viewport = viewports[1];
    await verifyOnce(context, gateway.origin, { reader: '1', hp_viewer: TAG }, viewport);
    const page = await context.newPage();
    await page.setViewport(viewport);
    await setCookies(page, gateway.origin, { fail: 'status401' });
    await page.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => localStorage.getItem('hs_arena_verified_viewer') === 'guest', { timeout: READY_MS });
    await page.waitForSelector('.arena-paywall .arena-paywall__dialog', { timeout: READY_MS });
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
    const state = await page.evaluate(() => ({ viewer: document.body.textContent.includes('Подписчица'),
      paid: Boolean(document.querySelector('.bg-tier-list-page')),
      hint: localStorage.getItem('hs_arena_viewer_hint'), record: localStorage.getItem('hs_arena_verified_viewer'),
      session: localStorage.getItem('hs_arena_auth_cookie_hint') }));
    assert.deepEqual(state, { viewer: false, paid: false, hint: null, record: 'guest', session: null });
    await context.close();
  });
});

test('a remembered refusal stays pending until the server confirms it', async () => {
  await withBrowser(async ({ browser, gateway }) => {
    const context = await browser.createBrowserContext();
    const viewport = viewports[1];
    // Last visit: no subscription. Since then the subscriber has paid; the
    // subscription answer is late this time.
    await verifyOnce(context, gateway.origin, { reader: '1', hp_viewer: TAG, plan: 'lapsed' }, viewport);
    const page = await context.newPage();
    await page.setViewport(viewport);
    await setCookies(page, gateway.origin, { plan: 'active', statusdelay: '1' });
    await page.evaluateOnNewDocument(recordFrames);
    await page.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.bg-tier-list-page', { timeout: READY_MS });
    const frames = await page.evaluate(() => window.__frames);
    assert.deepEqual(frames.filter(frame => frame.gate || frame.preview).slice(0, 1), [], 'no lock before the server refuses');
    assert.ok(frames.some(frame => frame.viewer), 'the account shows meanwhile');
    await context.close();
  });
});

async function signIn(page, origin, signin = '') {
  if (signin) await setCookies(page, origin, { signin });
  // Typed only once the form has hydrated (a controlled input typed into
  // earlier loses its value), and submitted again if the first press was lost.
  await page.goto(`${origin}/?login`, { waitUntil: 'networkidle0' });
  const email = await page.waitForSelector('.login-field input[type="email"]', { timeout: READY_MS });
  await email.type('reader@example.test');
  await page.type('input[autocomplete="current-password"]', 'secret-password');
  await page.waitForFunction(() => document.querySelector('input[autocomplete="current-password"]')?.value === 'secret-password',
    { timeout: READY_MS });
  for (let attempt = 0; ; attempt += 1) {
    await page.click('.login-submit');
    const signedIn = await page.waitForFunction(() => document.cookie.includes('reader=1'), { timeout: 15_000 })
      .then(() => true, () => false);
    if (signedIn) return;
    assert.ok(attempt < 2, 'the sign-in form must submit');
  }
}

test('a sign-in whose subscription answers late shows no lock on the next paid page', async () => {
  await withBrowser(async ({ browser, gateway }) => {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport(viewports[0]);
    await page.evaluateOnNewDocument(recordFrames);
    await signIn(page, gateway.origin, 'statusdelay');
    await page.evaluate(() => { window.__frames.length = 0; });
    await page.click('.arena-sidebar a[href="/battlegrounds/tier-list/"]');
    await page.waitForSelector('.bg-tier-list-page', { timeout: READY_MS });
    const frames = await page.evaluate(() => window.__frames);
    assert.deepEqual(frames.filter(frame => frame.gate || frame.preview).slice(0, 1), [], 'no lock before the subscription answers');
    await context.close();
  });
});

test('a sign-in whose subscription answer is 401 leaves a guest everywhere', async () => {
  await withBrowser(async ({ browser, gateway }) => {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport(viewports[0]);
    await signIn(page, gateway.origin, 'status401');
    await page.waitForFunction(() => localStorage.getItem('hs_arena_verified_viewer') === 'guest', { timeout: READY_MS });
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
    const state = await page.evaluate(() => ({
      viewer: Boolean(document.querySelector('.arena-sidebar-profile-avatar')),
      session: localStorage.getItem('hs_arena_auth_cookie_hint'), hint: localStorage.getItem('hs_arena_viewer_hint'),
      record: localStorage.getItem('hs_arena_verified_viewer') }));
    assert.deepEqual(state, { viewer: false, session: null, hint: null, record: 'guest' });
    await context.close();
  });
});

test('a late 401 about the previous session leaves the new session\'s memory alone', async () => {
  await withBrowser(async ({ browser, gateway }) => {
    const context = await browser.createBrowserContext();
    const viewport = viewports[0];
    // Tab 1 checks the subscriber's session; its subscription answer (a 401:
    // that session is ending) is on its way when tab 2 signs another account in.
    const first = await context.newPage();
    await first.setViewport(viewport);
    await setCookies(first, gateway.origin, { reader: '1', hp_viewer: TAG, fail: 'late401' });
    await first.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'domcontentloaded' });
    await first.waitForFunction(() => performance.getEntriesByType('resource')
      .some(entry => entry.name.endsWith('/api/auth/me')), { timeout: READY_MS });
    const second = await context.newPage();
    await second.setViewport(viewport);
    await second.deleteCookie({ name: 'fail', url: gateway.origin });
    await setCookies(second, gateway.origin, { reader: 'b', hp_viewer: TAGS.b });
    await second.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'domcontentloaded' });
    await second.waitForFunction(() => JSON.parse(localStorage.getItem('hs_arena_viewer_hint') ?? 'null')?.user.id === 'instant-other',
      { timeout: READY_MS });
    const before = await second.evaluate(() => ({ ...localStorage }));
    // Tab 1's 401 arrives (and its check runs again for the new session).
    await first.bringToFront();
    await first.waitForFunction(() => document.body.textContent.includes('Другая Читательница'), { timeout: READY_MS });
    await first.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));
    const after = await first.evaluate(() => ({ ...localStorage }));
    assert.equal(after.hs_arena_auth_cookie_hint, '1', 'the session hint stays');
    assert.equal(JSON.parse(after.hs_arena_viewer_hint ?? 'null')?.user.id, 'instant-other', 'the new viewer stays remembered');
    assert.equal(after.hs_arena_verified_viewer, before.hs_arena_verified_viewer, 'the confirmed record stays');
    assert.ok(await first.evaluate(() => document.body.textContent.includes('Другая Читательница')));
    await context.close();
  });
});

test('a late guest answer does not take the new session\'s tag away', async () => {
  await withBrowser(async ({ browser, gateway }) => {
    const context = await browser.createBrowserContext();
    const viewport = viewports[0];
    // Tab 1 holds the tag of a session that ended; its guest answer is late.
    const first = await context.newPage();
    await first.setViewport(viewport);
    await setCookies(first, gateway.origin, { hp_viewer: 'ended-session-tag-0001', guestdelay: '1' });
    await first.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'domcontentloaded' });
    // Meanwhile tab 2 signs in as another account.
    const second = await context.newPage();
    await second.setViewport(viewport);
    await second.deleteCookie({ name: 'guestdelay', url: gateway.origin });
    await setCookies(second, gateway.origin, { reader: 'b', hp_viewer: TAGS.b });
    await second.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'domcontentloaded' });
    await second.waitForFunction(() => document.body.textContent.includes('Другая Читательница'), { timeout: READY_MS });
    await first.bringToFront();
    await first.waitForFunction(() => document.body.textContent.includes('Другая Читательница'), { timeout: READY_MS });
    // Past the late guest answer (3 s after tab 1 asked).
    await first.waitForFunction(started => performance.now() - started > 3_500, { timeout: READY_MS }, 0);
    assert.match(await first.evaluate(() => document.cookie), new RegExp(`hp_viewer=${TAGS.b}`), 'the new session keeps its tag');
    assert.ok(await first.evaluate(() => document.body.textContent.includes('Другая Читательница')));
    // B has no subscription: its own, confirmed refusal is the gate tab 1 now shows.
    await context.close();
  });
});

// The previous session's subscription answer: headers at once, body late; the
// other account signs in between. Nothing of it reaches the new session.
for (const path of ['session check', 'sign-in']) {
  test(`a subscription body that arrives after another sign-in is dropped (${path})`, async () => {
    await withBrowser(async ({ browser, gateway }) => {
      const context = await browser.createBrowserContext();
      const viewport = viewports[0];
      const first = await context.newPage();
      await first.setViewport(viewport);
      // The subscriber's answer: headers out, body held until released below.
      const held = `bodydelay-${path.replace(' ', '-')}`;
      if (path === 'sign-in') {
        await setCookies(first, gateway.origin, { t: held });
        await signIn(first, gateway.origin, held);
      } else {
        await setCookies(first, gateway.origin, { reader: '1', hp_viewer: TAG, bodydelay: held, t: held });
        await first.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'domcontentloaded' });
      }
      const statusAsked = () => gateway.requests.some(request => request.t === held && request.url === '/api/subscription/status');
      for (const started = Date.now(); !statusAsked(); await new Promise(resolve => setTimeout(resolve, 50))) {
        assert.ok(Date.now() - started < READY_MS, 'the subscription is asked for');
      }
      // Now another account signs in, while that body is still on its way.
      const second = await context.newPage();
      await second.setViewport(viewport);
      await second.deleteCookie({ name: 'bodydelay', url: gateway.origin });
      await setCookies(second, gateway.origin, { reader: 'b', hp_viewer: TAGS.b });
      await second.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'domcontentloaded' });
      await second.waitForFunction(() => document.body.textContent.includes('Другая Читательница'), { timeout: READY_MS });
      assert.equal(gateway.holdsBody(held), true, 'the subscriber\'s body is still on its way');
      gateway.releaseBody(held);
      // The same document: its late body must not publish the subscriber here.
      await first.bringToFront();
      await first.waitForFunction(() => document.body.textContent.includes('Другая Читательница'), { timeout: READY_MS });
      await first.evaluate(() => new Promise(resolve => setTimeout(resolve, 1_000)));
      const state = await first.evaluate(() => ({ paid: Boolean(document.querySelector('.bg-tier-list-page')),
        hint: JSON.parse(localStorage.getItem('hs_arena_viewer_hint') ?? 'null') }));
      assert.equal(state.paid, false, `${path}: the subscriber's grants never reach the other account`);
      assert.equal(state.hint?.user.id ?? 'instant-other', 'instant-other');
      assert.equal(state.hint?.access.hasAccess ?? false, false);
      await context.close();
    });
  });
}

test('search shows no subscription lock while a remembered refusal is unconfirmed', async () => {
  await withBrowser(async ({ browser, gateway }) => {
    const context = await browser.createBrowserContext();
    const viewport = viewports[0];
    await verifyOnce(context, gateway.origin, { reader: '1', hp_viewer: TAG, plan: 'lapsed' }, viewport);
    const page = await context.newPage();
    await page.setViewport(viewport);
    await setCookies(page, gateway.origin, { plan: 'active', statusdelay: '1' });
    await page.goto(`${gateway.origin}/battlegrounds/tier-list/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.global-search__input', { timeout: READY_MS });
    // Typing reaches the search only once React has hydrated the input.
    await page.waitForFunction(() => Object.keys(document.querySelector('.global-search__input'))
      .some(key => key.startsWith('__reactFiber')), { timeout: READY_MS });
    await page.evaluate(() => {
      window.__searchLocks = [];
      const sample = () => {
        window.__searchLocks.push(Boolean(document.querySelector('.global-search-result [aria-label="Нужна подписка"], .global-search-result__diamond')));
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    // Typed again if the keystrokes were lost on a busy runner (the locks are
    // sampled throughout either way).
    for (let attempt = 0; ; attempt += 1) {
      await page.click('.global-search__input', { clickCount: 3 });
      await page.type('.global-search__input', 'гайд');
      const found = await page.waitForSelector('.global-search-result', { timeout: 8_000 }).then(() => true, () => false);
      if (found) break;
      assert.ok(attempt < 2, 'search shows the article');
    }
    // Through the late subscription answer, which grants the article.
    await page.waitForSelector('.bg-tier-list-page', { timeout: READY_MS });
    assert.equal(await page.evaluate(() => window.__searchLocks.filter(Boolean).length), 0, 'no lock before the server refuses');
    await context.close();
  });
});
});
