import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import express from 'express';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { createCardAssembleRouter } from '../server/modules/constructedCards/public.ts';

// The built /standard/assemble/ page against the real /api/card-assemble/* router whose upstream answers slower than the 600 ms
// first-paint budget (as the Data API does for a cold read) and whose clock is ours. Once the answers are cached and their ten
// minutes have passed, the page must still get both of them at once (the list and the card) and draw «Что выпало?» and
// «Лучшие сборки»: the expired answer is served and renewed in the background, nobody waits for the upstream.

const BE044 = JSON.parse(readFileSync(new URL('./fixtures/card-assemble-contract-be044.json', import.meta.url), 'utf8')).data;
const CHECKED = '2026-11-20T03:10:00+00:00';
const ROW = { card: { card_id: 'BE_044', dbf_id: 128892, name: 'РЕ-3-ВЕР', name_ru: 'РЕ-3-ВЕР', card_class: 'NEUTRAL', cost: 3, type: 'MINION', rarity: 'RARE' },
  formats: ['standard', 'wild'], state: 'ok', checked_at: CHECKED, stale: false, bases_total: 38, win_rate: 48.6 };
const upstreamAnswer = url => {
  if (url.pathname === '/v1/hsreplay/assemble/cards') return { data: [ROW], meta: { fetched_at: CHECKED, stale: false, count: 1 } };
  return { data: { ...BE044, card: { ...BE044.card, ...ROW.card }, format: url.searchParams.get('format'),
    summary: { bases_total: 38, win_rate: 48.6 }, donor_pool_status: { state: 'ok', class_dependent: true, player_class: null } }, meta: {} };
};

test('after the cache expires the tool page still gets the list and the card at once and draws the whole tool', { timeout: 120000 }, async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  let clock = 0;
  let upstreamDelayMs = 0;
  const upstreamReads = [];
  const app = express();
  app.get('/api/auth/me', (_request, response) => response.json({ user: null }));
  app.use('/api', createCardAssembleRouter({
    request: async path => {
      upstreamReads.push(path);
      await delay(upstreamDelayMs);
      return new Response(JSON.stringify(upstreamAnswer(new URL(path, 'http://upstream.invalid'))), { status: 200 });
    },
    now: () => clock,
    onError: () => undefined,
  }));
  const legacy = app.listen(0, '127.0.0.1');
  await once(legacy, 'listening');
  const legacyOrigin = `http://127.0.0.1:${legacy.address().port}`;
  const next = await startNextServer({ legacyOrigin });
  try {
    const page = async () => {
      const response = await fetch(`${next.origin}/standard/assemble/`);
      assert.equal(response.status, 200);
      return response.text();
    };
    const complete = html => html.includes('Что выпало?') && html.includes('Лучшие сборки');
    // The first request loads the route's modules; the warm-up then reads both answers from the slow upstream into the cache.
    await page();
    upstreamDelayMs = 900;
    for (const path of ['/api/card-assemble/standard', '/api/card-assemble/standard/BE_044?base=top']) {
      assert.equal((await fetch(`${legacyOrigin}${path}`)).status, 200, path);
    }
    assert.equal(complete(await page()), true, 'a warm cache gives the whole tool');

    // Ten minutes later the answers are expired and the upstream is still slow: the old ones are served, and renewed in the background.
    clock = 11 * 60_000;
    const reads = upstreamReads.length;
    const started = Date.now();
    const html = await page();
    assert.equal(complete(html), true, 'the list and the card of an expired cache are both in the first HTML');
    assert.ok(Date.now() - started < 600, `the page does not wait for the slow upstream: ${Date.now() - started} ms`);
    assert.equal(upstreamReads.length - reads, 2, 'one background renewal per answer');
    await delay(1500);
    assert.equal(complete(await page()), true, 'and still whole once the renewal has landed');
  } finally {
    await next.close();
    legacy.closeAllConnections();
    await new Promise(done => legacy.close(done));
  }
});
