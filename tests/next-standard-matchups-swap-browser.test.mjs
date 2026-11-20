import assert from 'node:assert/strict';
import http from 'node:http';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';
import { openAnswer, protectedAnswer } from './helpers/standardMatchupsOpenFixture.ts';

// Who gets the interactive matrix on /standard/matchups/ (E21 swap), in a real browser against an Express stub:
// a subscriber, and an administrator whose subscription grants nothing (as the server sends them), see the
// matrix; a signed-in viewer without a subscription keeps the open view; and when the subscriber's data or the
// matrix chunk cannot arrive, the open view says so and a retry brings the matrix, instead of a silent open view.

const USERS = {
  reader: { id: 'sw-reader', email: 'reader@example.test', name: 'Подписчик', role: 'user', adminAllowed: false, contestAdminAllowed: false },
  admin: { id: 'sw-admin', email: 'owner@example.test', name: 'Владелец', role: 'admin', adminAllowed: true, contestAdminAllowed: true },
  late: { id: 'sw-late', email: 'late@example.test', name: 'Позже', role: 'user', adminAllowed: false, contestAdminAllowed: false },
  plain: { id: 'sw-plain', email: 'plain@example.test', name: 'Без подписки', role: 'user', adminAllowed: false, contestAdminAllowed: false },
};
const SUBSCRIBED = { hasAccess: true, entitlements: { arena: true, standard: true }, source: 'boosty', checkedAt: null,
  stale: false, message: '', boosty: { checked: true, hasAccess: true }, patreon: {}, telegram: {} };
const STANDARD_ONLY = { ...SUBSCRIBED, entitlements: { arena: false, standard: true } };
const NONE = { hasAccess: false, entitlements: {}, source: 'none', checkedAt: null, stale: false, message: '',
  boosty: {}, patreon: {}, telegram: {} };
const DESKTOP = { width: 1440, height: 900 };

async function startStack() {
  const state = { next: null, lateGranted: false, protectedReads: 0, protectedFailures: 0, protectedHangs: 0 };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://stack');
    const who = /(?:^|;\s*)sw_session=(\w+)/.exec(request.headers.cookie ?? '')?.[1];
    const user = USERS[who] ?? null;
    const json = (status, payload) => response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' })
      .end(JSON.stringify(payload));
    if (url.pathname === '/api/auth/me') {
      return json(200, user ? { success: true, user, adminAllowed: user.adminAllowed, contestAdminAllowed: user.contestAdminAllowed }
        : { user: null, adminAllowed: false, contestAdminAllowed: false });
    }
    if (url.pathname === '/api/subscription/status' || url.pathname === '/api/subscription/refresh') return user ? json(200, who === 'reader' ? SUBSCRIBED : who === 'late' && state.lateGranted ? STANDARD_ONLY : NONE) : json(401, { error: 'guest' });
    if (url.pathname === '/api/standard/matchups/public') return json(200, openAnswer({ format: url.searchParams.get('format') === 'wild' ? 'wild' : 'standard' }));
    if (url.pathname === '/api/standard/matchups') {
      if (!user || who === 'plain' || (who === 'late' && !state.lateGranted)) return json(401, { error: 'subscription required' });
      state.protectedReads += 1;
      if (state.protectedHangs > 0) {
        state.protectedHangs -= 1;
        return; // no status, ever
      }
      if (state.protectedFailures > 0) {
        state.protectedFailures -= 1;
        return json(503, { error: 'Standard matchups unavailable' });
      }
      return json(200, protectedAnswer());
    }
    if (url.pathname.startsWith('/api/')) return json(401, { error: 'guest' });
    const upstream = http.request(new URL(state.next), { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  const origin = await listenLocal(server);
  return Object.assign(state, { server, origin });
}

// The page is the subscriber's component for everyone. The open slice says «Все ранги» and the guest's locks stand
// in the filters; the subscriber's slice (the stub's «Легенда») replaces it inside the same component.
const PAID = '::-p-text(Стандарт · Легенда)';
const OPEN = '::-p-text(Стандарт · Все ранги)';
const RANK_LOCK = '::-p-aria([name="Рейтинг (фильтр): по подписке. Узнать, как открыть"][role="button"])';
const FAILURE = '::-p-text(Не удалось загрузить формат)';
const RETRY = '::-p-aria(Повторить[role="button"])';

/** The scripts the page's own HTML names: every other script is a lazy chunk, loaded after the page is up. */
async function initialScripts(origin) {
  const html = await (await fetch(`${origin}/standard/matchups/`)).text();
  return new Set([...html.matchAll(/static\/chunks\/[\w./%-]+\.js/g)].map(match => `/_next/${match[0]}`));
}

async function open(browser, stack, who) {
  const page = await browser.newPage();
  await page.setViewport(DESKTOP);
  if (who) await page.setCookie({ name: 'sw_session', value: who, url: stack.origin });
  return page;
}

test('who sees the interactive matrix on /standard/matchups/, and what a failure looks like', { timeout: 420_000 }, async () => {
  const stack = await startStack();
  const next = await startNextServer({ legacyOrigin: stack.origin,
    env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
  stack.next = next.origin;
  let browser;
  try {
    let warm = false;
    for (let attempt = 0; attempt < 40 && !warm; attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      warm = (await (await fetch(`${next.origin}/standard/matchups/`)).text()).includes('Открытый архетип 20');
      if (!warm) await delay(250);
    }
    assert.ok(warm, 'the page was not regenerated with the matrix');
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const initial = await initialScripts(stack.origin);
    assert.ok(initial.size > 0, 'the page names no scripts');

    // Chunks a page asks for beyond the ones its HTML names, as the network shows them.
    const lazyChunks = page => {
      const seen = new Set();
      page.on('request', request => {
        const { pathname } = new URL(request.url());
        if (request.resourceType() === 'script' && pathname.startsWith('/_next/static/chunks/') && !initial.has(pathname)) seen.add(pathname);
      });
      return seen;
    };

    // A signed-in viewer without a subscription keeps the open view and never asks the protected route.
    const before = stack.protectedReads;
    const plain = await open(browser, stack, 'plain');
    const plainChunks = lazyChunks(plain);
    await plain.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'networkidle0' });
    assert.ok(await plain.$(OPEN));
    assert.ok(await plain.$(RANK_LOCK), 'the locks stand in the filters');
    assert.equal(await plain.$(PAID), null);
    assert.equal(await plain.$(FAILURE), null, 'a refusal is not a failure');
    assert.equal(stack.protectedReads, before);
    await plain.close();

    // The administrator's subscription grants nothing, and the matrix is theirs all the same.
    const admin = await open(browser, stack, 'admin');
    const adminChunks = lazyChunks(admin);
    await admin.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'load' });
    await admin.waitForSelector(PAID, { timeout: 20000 });
    assert.equal(await admin.$(RANK_LOCK), null, 'no lock for an administrator');
    await admin.close();
    // The chunks the page brings after its own scripts (the matrix and its kit): the same for everyone.
    const lazyOnly = new Set([...plainChunks, ...adminChunks]);
    assert.ok(lazyOnly.size > 0, 'the page loaded no lazy chunk');

    // A reader who has «standard» but not «arena»: the offer opened from a lock closes once access is confirmed, and the
    // paid slice is theirs.
    const late = await open(browser, stack, 'late');
    await late.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'networkidle0' });
    const OFFER = '::-p-aria([role="heading"][name="Ранги, периоды и порог игр — в подписке"])';
    let offer = null;
    for (let attempt = 0; attempt < 20 && !offer; attempt += 1) {
      await (await late.waitForSelector(RANK_LOCK)).click();
      offer = await late.waitForSelector(OFFER, { timeout: 1500 }).catch(() => null);
    }
    assert.ok(offer, 'the lock opens the offer');
    stack.lateGranted = true;
    await (await late.waitForSelector('::-p-aria(Проверить доступ[role="button"])')).click();
    await late.waitForSelector(OFFER, { hidden: true, timeout: 20000 });
    await late.waitForSelector(PAID, { timeout: 20000 });
    await late.close();

    // The subscriber's data fails: the open view says so, and «Повторить» brings the matrix.
    stack.protectedFailures = 1;
    const broken = await open(browser, stack, 'reader');
    await broken.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'load' });
    await broken.waitForSelector(FAILURE, { timeout: 20000 });
    assert.ok(await broken.$(OPEN), 'the open slice stays under the message');
    await broken.click(RETRY);
    await broken.waitForSelector(PAID, { timeout: 20000 });
    assert.equal(await broken.$(FAILURE), null);
    await broken.close();

    // The subscriber's request never gets a status: after the deadline the same message appears, and «Повторить» works.
    stack.protectedHangs = 1;
    const hung = await open(browser, stack, 'reader');
    // The matrix the earlier pages cached would be shown at once: this reader has never seen one.
    await hung.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch { /* none */ } });
    await hung.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'load' });
    await hung.waitForSelector(FAILURE, { timeout: 45000 });
    await hung.click(RETRY);
    await hung.waitForSelector(PAID, { timeout: 20000 });
    await hung.close();

    // The matrix chunk cannot load (a tab that outlived a deploy): the page keeps its leaders and filters and says so
    // in place of the matrix; once the chunk is back a reload brings it.
    const stale = await open(browser, stack, 'reader');
    let chunkDown = true;
    await stale.setRequestInterception(true);
    stale.on('request', request => {
      const { pathname } = new URL(request.url());
      if (chunkDown && lazyOnly.has(pathname)) void request.abort('failed');
      else void request.continue();
    });
    await stale.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'load' });
    await stale.waitForSelector('::-p-text(Раздел нужно обновить)', { timeout: 30000 });
    assert.ok(await stale.$('::-p-text(Сильнейшие архетипы)'), 'the rest of the page stays');
    const notice = await (await stale.waitForSelector('::-p-aria([role="alert"])')).boundingBox();
    assert.ok(notice.height >= 100, `the notice is a styled block, not bare text: ${notice.height}px`);
    chunkDown = false;
    await stale.click('::-p-aria(Обновить страницу[role="button"])');
    await stale.waitForSelector(PAID, { timeout: 20000 });
    await stale.close();
  } finally {
    if (browser) await browser.close();
    await next.close();
    await closeLocal(stack.server);
  }
});
