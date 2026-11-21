import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { OPEN_FRAME } from './fixtures/viciousGoldSentinels.mjs';

// /standard/vicious-gold/ on the built Next server while vS is down (#677). Express answers a prerender read 503, so a
// regeneration falls back to the last frame the page accepted. With none — no memory copy (it is older than a week)
// and no file (the state directory is unusable) — the regeneration throws: Next keeps its earlier copy of the page
// with the data and never publishes the stub over it. The whole outage costs one warning of the page.

const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const ROBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const ARCHETYPE = 'Драконий Воин';
const WARNING = /\[vicious-gold\] open frame unavailable/g;

test('with no frame in memory or on disk and vS down, a regeneration keeps the earlier page with its data', { timeout: 300_000 }, async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const state = { down: true, reads: 0 };
  const express = createServer((request, response) => {
    const url = new URL(request.url, 'http://express');
    const json = (status, body) => response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    if (url.pathname === '/api/auth/me') return json(200, { user: null });
    if (url.pathname !== '/api/vicious-syndicate-gold/public') return json(404, {});
    state.reads += 1;
    return state.down ? json(503, { error: 'Данные Vicious Syndicate временно недоступны' }) : json(200, OPEN_FRAME);
  });
  express.listen(0, '127.0.0.1');
  await once(express, 'listening');
  // A file where the directory should be: no copy of the page is ever written or read.
  const root = mkdtempSync(join(tmpdir(), 'vicious-gold-isr-'));
  const unusable = join(root, 'not-a-directory');
  writeFileSync(unusable, '');
  const next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${express.address().port}`, readyTimeoutMs: 30_000,
    env: { PAGE_LAST_GOOD_DIR: unusable, NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
  const page = async (userAgent = BROWSER_UA) => {
    const response = await fetch(`${next.origin}/standard/vicious-gold/`, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(30_000) });
    return { status: response.status, html: (await response.text()).replaceAll('<!-- -->', '') };
  };
  // Every SIGUSR2 moves the server's clock an hour ahead (tests/helpers/shiftableClock.cjs).
  const shift = async hours => {
    for (let hour = 0; hour < hours; hour += 1) {
      process.kill(next.pid, 'SIGUSR2');
      await delay(10);
    }
  };
  try {
    assert.equal((await page()).html.includes(ARCHETYPE), false, 'the build copy, made without Express, has no frame');
    state.down = false;
    let html = '';
    for (let attempt = 0; attempt < 40 && !html.includes(ARCHETYPE); attempt += 1) {
      await shift(1);
      ({ html } = await page());
      if (!html.includes(ARCHETYPE)) await delay(250);
    }
    assert.ok(html.includes(ARCHETYPE), `the page was regenerated with the frame: ${next.output().slice(-300)}`);

    // vS goes down and stays down for more than a week: the memory copy is too old to serve and there is no file.
    state.down = true;
    await shift(8 * 24);
    const readsBefore = state.reads;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await shift(1);
      for (const userAgent of [BROWSER_UA, ROBOT_UA]) {
        const kept = await page(userAgent);
        assert.equal(kept.status, 200, next.output().slice(-300));
        assert.ok(kept.html.includes(ARCHETYPE), `the earlier page with the frame stays (${userAgent === ROBOT_UA ? 'robot' : 'guest'})`);
      }
      await delay(300);
    }
    assert.ok(state.reads > readsBefore, 'the page was regenerated against the source that is down');
    assert.equal((next.output().match(WARNING) ?? []).length, 1, `one warning for the outage: ${next.output().slice(-600)}`);
  } finally {
    await next.close();
    express.closeAllConnections();
    await new Promise(done => express.close(done));
    rmSync(root, { recursive: true, force: true });
  }
});
