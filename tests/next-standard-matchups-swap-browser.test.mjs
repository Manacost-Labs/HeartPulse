import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
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
  const state = { next: null, protectedReads: 0, protectedFailures: 0 };
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

/** The built chunks that hold the matrix component, so a test can make exactly those fail to load. */
function matrixChunks() {
  const root = path.resolve('apps/public-web/.next/static/chunks');
  const found = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith('.js') && fs.readFileSync(file, 'utf8').includes('standard-matchup-matrix__layer')) found.push(`/_next/static/chunks/${path.relative(root, file)}`);
    }
  };
  walk(root);
  return found;
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
    const chunks = matrixChunks();
    assert.ok(chunks.length > 0, 'the matrix chunk is not in the build');

    // The administrator's subscription grants nothing, and the matrix is theirs all the same.
    const admin = await open(browser, stack, 'admin');
    await admin.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'load' });
    await admin.waitForSelector('.standard-matchups__ledger', { timeout: 20000 });
    assert.equal(await admin.$('.standard-matchups-open__matrix'), null, 'the open view is gone for an administrator');
    await admin.close();

    // A signed-in viewer without a subscription keeps the open view and never asks the protected route.
    const before = stack.protectedReads;
    const plain = await open(browser, stack, 'plain');
    await plain.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'networkidle0' });
    assert.ok(await plain.$('.standard-matchups-open__matrix'));
    assert.equal(await plain.$('.standard-matchups__ledger'), null);
    assert.equal(await plain.$('[data-matchups-swap-error]'), null, 'a refusal is not a failure');
    assert.equal(stack.protectedReads, before);
    await plain.close();

    // The subscriber's data fails: the open view says so, and «Повторить» brings the matrix.
    stack.protectedFailures = 1;
    const broken = await open(browser, stack, 'reader');
    await broken.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'load' });
    await broken.waitForSelector('[data-matchups-swap-error]', { timeout: 20000 });
    assert.ok(await broken.$('.standard-matchups-open__matrix'), 'the open view stays under the message');
    await broken.click('[data-matchups-swap-error] button');
    await broken.waitForSelector('.standard-matchups__ledger', { timeout: 20000 });
    assert.equal(await broken.$('[data-matchups-swap-error]'), null);
    await broken.close();

    // The matrix chunk cannot load (every attempt fails): the message appears after the automatic retries, and
    // once the chunk is back «Повторить» brings the matrix. A reload is not what rescues it here: the stale-asset
    // reload is claimed once per 30 s, and the test has used it up.
    const stale = await open(browser, stack, 'reader');
    await stale.evaluateOnNewDocument(() => { sessionStorage.setItem('hp:chunk-reload-at', String(Date.now())); });
    let chunkDown = true;
    await stale.setRequestInterception(true);
    stale.on('request', request => {
      const { pathname } = new URL(request.url());
      if (chunkDown && chunks.includes(pathname)) void request.abort('failed');
      else void request.continue();
    });
    await stale.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'load' });
    await stale.waitForSelector('[data-matchups-swap-error]', { timeout: 30000 });
    assert.equal(await stale.$('.standard-matchups__ledger'), null);
    chunkDown = false;
    await stale.click('[data-matchups-swap-error] button');
    await stale.waitForSelector('.standard-matchups__ledger', { timeout: 20000 });
    await stale.close();
  } finally {
    if (browser) await browser.close();
    await next.close();
    await closeLocal(stack.server);
  }
});
