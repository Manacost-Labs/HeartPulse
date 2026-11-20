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
  plain: { id: 'sw-plain', email: 'plain@example.test', name: 'Без подписки', role: 'user', adminAllowed: false, contestAdminAllowed: false },
};
const SUBSCRIBED = { hasAccess: true, entitlements: { arena: true, standard: true }, source: 'boosty', checkedAt: null,
  stale: false, message: '', boosty: { checked: true, hasAccess: true }, patreon: {}, telegram: {} };
const NONE = { hasAccess: false, entitlements: {}, source: 'none', checkedAt: null, stale: false, message: '',
  boosty: {}, patreon: {}, telegram: {} };
const DESKTOP = { width: 1440, height: 900 };

async function startStack() {
  const state = { next: null, protectedReads: 0, protectedFailures: 0, protectedHangs: 0 };
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
    if (url.pathname === '/api/subscription/status') return user ? json(200, who === 'reader' ? SUBSCRIBED : NONE) : json(401, { error: 'guest' });
    if (url.pathname === '/api/standard/matchups/public') return json(200, openAnswer({ format: url.searchParams.get('format') === 'wild' ? 'wild' : 'standard' }));
    if (url.pathname === '/api/standard/matchups') {
      if (!user || (who === 'plain')) return json(401, { error: 'subscription required' });
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

const MATRIX = '::-p-aria(Режим просмотра[role="group"])';
const OPEN_MATRIX = '::-p-aria(История матчапов[role="button"])';
const FAILURE = '::-p-text(Не удалось загрузить вашу матрицу матчапов)';
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
      warm = (await (await fetch(`${next.origin}/standard/matchups/`)).text()).includes('standard-matchups-open__matrix');
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
    assert.ok(await plain.$(OPEN_MATRIX));
    assert.equal(await plain.$(MATRIX), null);
    assert.equal(await plain.$(FAILURE), null, 'a refusal is not a failure');
    assert.equal(stack.protectedReads, before);
    await plain.close();

    // The administrator's subscription grants nothing, and the matrix is theirs all the same.
    const admin = await open(browser, stack, 'admin');
    const adminChunks = lazyChunks(admin);
    await admin.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'load' });
    await admin.waitForSelector(MATRIX, { timeout: 20000 });
    assert.equal(await admin.$(OPEN_MATRIX), null, 'the open view is gone for an administrator');
    await admin.close();
    // What only the matrix needs: the chunks it brings that a signed-in viewer without it never asks for.
    const matrixOnly = new Set([...adminChunks].filter(chunk => !plainChunks.has(chunk)));
    assert.ok(matrixOnly.size > 0, 'the matrix loaded no chunk of its own');

    // The subscriber's data fails: the open view says so, and «Повторить» brings the matrix.
    stack.protectedFailures = 1;
    const broken = await open(browser, stack, 'reader');
    await broken.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'load' });
    await broken.waitForSelector(FAILURE, { timeout: 20000 });
    assert.ok(await broken.$(OPEN_MATRIX), 'the open view stays under the message');
    await broken.click(RETRY);
    await broken.waitForSelector(MATRIX, { timeout: 20000 });
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
    await hung.waitForSelector(MATRIX, { timeout: 20000 });
    await hung.close();

    // The matrix chunk cannot load (every attempt fails): the message appears after the automatic retries, and
    // once the chunk is back «Повторить» brings the matrix. A reload is not what rescues it here: the stale-asset
    // reload is claimed once per 30 s, and the test has used it up.
    const stale = await open(browser, stack, 'reader');
    await stale.evaluateOnNewDocument(() => { sessionStorage.setItem('hp:chunk-reload-at', String(Date.now())); });
    let chunkDown = true;
    await stale.setRequestInterception(true);
    stale.on('request', request => {
      const { pathname } = new URL(request.url());
      if (chunkDown && matrixOnly.has(pathname)) void request.abort('failed');
      else void request.continue();
    });
    await stale.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'load' });
    await stale.waitForSelector(FAILURE, { timeout: 30000 });
    assert.equal(await stale.$(MATRIX), null);
    chunkDown = false;
    await stale.click(RETRY);
    await stale.waitForSelector(MATRIX, { timeout: 20000 });
    await stale.close();
  } finally {
    if (browser) await browser.close();
    await next.close();
    await closeLocal(stack.server);
  }
});
