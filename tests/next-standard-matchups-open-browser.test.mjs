import assert from 'node:assert/strict';
import http from 'node:http';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';
import { SENTINELS, openAnswer, protectedAnswer } from './helpers/standardMatchupsOpenFixture.ts';

// /standard/matchups/ in a real browser against an Express stub: a guest without JavaScript sees the open matrix,
// a guest with JavaScript gets the rest of the slice, Wild after the switch and the offer behind the locks, a
// subscriber's matrix replaces the open view only when its data and chunk are loaded, and the swap does not shift.

const READER = { id: 'mx-reader', email: 'reader@example.test', name: 'Подписчик', role: 'user' };
const SUBSCRIBED = { hasAccess: true, entitlements: { arena: true, standard: true }, source: 'boosty', checkedAt: null,
  stale: false, message: '', boosty: { checked: true, hasAccess: true }, patreon: {}, telegram: {} };
const PROTECTED_DELAY_MS = 800;
const DESKTOP = { width: 1440, height: 900 };

async function startStack() {
  const state = { next: null, publicReads: [], protectedReads: 0, wildDown: false };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://stack');
    const reader = /(?:^|;\s*)mx_session=reader/.test(request.headers.cookie ?? '');
    const json = (status, payload) => response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' })
      .end(JSON.stringify(payload));
    if (url.pathname === '/api/auth/me') return json(200, { user: reader ? READER : null });
    if (url.pathname === '/api/subscription/status') return reader ? json(200, SUBSCRIBED) : json(401, { error: 'guest' });
    if (url.pathname === '/api/standard/matchups/public') {
      state.publicReads.push(`${url.pathname}${url.search}`);
      if (url.searchParams.get('format') === 'wild' && state.wildDown) {
        return void setTimeout(() => response.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '60' })
          .end(JSON.stringify({ error: 'no snapshot' })), 1200);
      }
      return json(200, openAnswer({ noise: true, format: url.searchParams.get('format') === 'wild' ? 'wild' : 'standard' }));
    }
    if (url.pathname === '/api/standard/matchups') {
      if (!reader) return json(401, { error: 'subscription required' });
      state.protectedReads += 1;
      return void setTimeout(() => json(200, protectedAnswer()), PROTECTED_DELAY_MS);
    }
    if (url.pathname.startsWith('/api/')) return json(401, { error: 'guest' });
    const upstream = http.request(new URL(state.next), { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  const origin = await listenLocal(server);
  return Object.assign(state, { server, origin });
}

test('a guest and a subscriber on /standard/matchups/ in a real browser', { timeout: 300_000 }, async () => {
  const stack = await startStack();
  const next = await startNextServer({ legacyOrigin: stack.origin,
    env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
  stack.next = next.origin;
  let browser;
  try {
    // The page is a five-minute ISR page the warm-up route does not cover: move the server's clock past that
    // window and request until the regenerated copy has the matrix.
    let warm = false;
    for (let attempt = 0; attempt < 40 && !warm; attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      warm = (await (await fetch(`${next.origin}/standard/matchups/`)).text()).includes('standard-matchups-open__matrix');
      if (!warm) await delay(250);
    }
    assert.ok(warm, 'the page was not regenerated with the matrix');
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });

    // Without JavaScript: the most played archetypes of the general slice, no paid value.
    const bare = await browser.newPage();
    await bare.setJavaScriptEnabled(false);
    await bare.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'load' });
    const bareHtml = await bare.content();
    assert.equal((bareHtml.match(/class="standard-matchups-open__row"/g) ?? []).length, 30);
    assert.deepEqual(SENTINELS.filter(value => bareHtml.includes(value)), []);
    await bare.close();

    // A guest with JavaScript: the tail of the slice arrives, Wild reads the same open route, the locks bring the offer.
    const guest = await browser.newPage();
    await guest.setViewport(DESKTOP);
    const errors = [];
    guest.on('pageerror', error => errors.push(error.message));
    await guest.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'networkidle0' });
    assert.equal(await guest.$$eval('.standard-matchups-open__row', rows => rows.length), 36, 'the browser completes the slice');
    assert.equal(stack.protectedReads, 0, 'a guest never asks the protected route');
    assert.equal(await guest.$('.arena-paywall'), null, 'no gate until a lock is pressed');
    await guest.click('[data-locked-filter]');
    await guest.waitForSelector('#standard-matchups-paywall');
    await guest.evaluate(() => [...document.querySelectorAll('.standard-matchups__segmented button')].at(1).click());
    await guest.waitForFunction(() => document.querySelector('.standard-matchups-open__line')?.textContent.includes('Вольный'), { timeout: 15000 });
    assert.equal(stack.publicReads.at(-1), '/api/standard/matchups/public?format=wild');
    const guestText = await guest.evaluate(() => document.body.textContent);
    assert.deepEqual(SENTINELS.filter(value => guestText.includes(value)), []);
    assert.deepEqual(errors, []);
    await guest.close();

    // Wild is slow and then fails: the Standard numbers must not stay on the screen under the chosen Wild.
    stack.wildDown = true;
    const slow = await browser.newPage();
    await slow.setViewport(DESKTOP);
    await slow.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'networkidle0' });
    assert.ok(await slow.$('.standard-matchups-open__matrix'), 'Standard is up first');
    await slow.evaluate(() => [...document.querySelectorAll('.standard-matchups__segmented button')].at(1).click());
    await slow.waitForFunction(() => document.querySelector('.standard-matchups__segmented button[aria-pressed="true"]')?.textContent.includes('Вольный'));
    assert.equal(await slow.$('.standard-matchups-open__matrix'), null, 'no Standard matrix while Wild loads');
    assert.equal(await slow.$('.standard-matchups-open__row'), null, 'no Standard row while Wild loads');
    await slow.waitForSelector('.standard-matchups__error', { timeout: 15000 });
    assert.equal(await slow.$('.standard-matchups-open__matrix'), null, 'no Standard matrix after Wild failed');
    assert.equal(await slow.$('.standard-matchups-open__row'), null, 'no Standard row after Wild failed');
    assert.ok(!(await slow.evaluate(() => document.querySelector('.standard-matchups-open__line')?.textContent ?? '')).includes('Стандарт'),
      'the line does not describe Standard under Wild');
    await slow.close();
    stack.wildDown = false;

    // A subscriber: the open view stays until the matrix is ready, then the matrix replaces it without shifting.
    const reader = await browser.newPage();
    await reader.setViewport(DESKTOP);
    await reader.evaluateOnNewDocument(() => {
      window.__shifts = [];
      new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shifts.push(entry.value); })
        .observe({ type: 'layout-shift', buffered: true });
    });
    await reader.setCookie({ name: 'mx_session', value: 'reader', url: stack.origin });
    await reader.goto(`${stack.origin}/standard/matchups/`, { waitUntil: 'load' });
    await reader.waitForSelector('.standard-matchups-open__matrix');
    assert.equal(await reader.$('.standard-matchups__ledger'), null, 'the paid view is not up before its data');
    await reader.waitForSelector('.standard-matchups__ledger', { timeout: 20000 });
    assert.equal(await reader.$('.standard-matchups-open__matrix'), null, 'the open view is gone once the matrix is up');
    assert.equal(await reader.$('.standard-matchups [data-skeleton], .standard-matchups .matchups-skeleton'), null, 'no skeleton between the two');
    assert.ok(stack.protectedReads >= 1);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const shift = await reader.evaluate(() => window.__shifts.reduce((sum, value) => sum + value, 0));
    console.log(`subscriber CLS ${shift.toFixed(4)}`);
    assert.ok(shift < 0.01, `the subscriber page shifted by ${shift.toFixed(4)}`);
    await reader.close();
  } finally {
    if (browser) await browser.close();
    await next.close();
    await closeLocal(stack.server);
  }
});
