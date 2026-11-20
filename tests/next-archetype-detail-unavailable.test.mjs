import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

// An indexable archetype page (#599) whose catalog has no answer and no last good copy, and whose open builds are
// all refused, would be a thin `index` page: the production Next answers it with a 503 and `Retry-After` instead.
// A page that does not index, a page with open builds, and a page whose catalog (or its copy) answers stay a 200.

const INDEXABLE = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const row = (slug, games) => ({
  slug, archetype: slug, archetypeLabel: `Архетип ${slug}`, translated: true, classKey: 'warlock', format: 'standard',
  games, winrate: 53.1, popularity: games > 1000 ? 5 : 0.1, turns: 8, durationMinutes: 8, climbingSpeed: 1, deckCount: 3,
  sourceUrl: 'https://www.hsguru.com/meta', builds: [{ deckCode: 'PRIVATE_DECK' }],
});
const ROWS = [row('zoolock', 14800), row('handlock', 9000), row('weak-warlock', 600)];
const OPEN_BUILD = { deckCode: 'AAECAZ8FAAAAzoolockAAA=', games: 700, winrate: 60.1, updatedAt: '2026-07-24T00:00:00.000Z',
  sampleRank: 'all', samplePeriod: 'patch_37.0.2', cards: [{ id: 'TST_001', name: 'Тестовый удар', cost: 1, count: 2, hasPage: true }] };
// Zoolock's builds are all refused by the page's allowlist (a code it cannot show); handlock has an open build.
const detailOf = item => ({
  format: 'standard', formatLabel: 'Стандарт', patch: '37.0.2', minimumGames: 10, updatedAt: '2026-07-24T12:38:57.727Z',
  item: { ...item, builds: item.slug === 'handlock' ? [OPEN_BUILD] : [{ deckCode: 'not a deck code', games: 10, winrate: 50, cards: null }] },
  buildsTotal: 1, buildsOffset: 0, nextOffset: null, featuredBuild: null,
});
const catalog = { format: 'standard', formatLabel: 'Стандарт', patch: '37.0.2', minimumGames: 10,
  updatedAt: '2026-07-24T12:38:57.727Z', coverage: {}, items: ROWS };

/** A fresh production Next (no copy of any catalog) over a fake Express whose catalog answers as `state.catalog` says. */
async function startStand(state) {
  const pending = [];
  const legacy = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const pathname = new URL(request.url, 'http://fixture').pathname;
    if (pathname === '/api/constructed-archetypes/teaser') {
      state.catalogReads.push(request.url);
      if (state.catalog === 'stall') { pending.push(response); return; }
      if (state.catalog === 'down') { response.writeHead(502).end('{"error":"down"}'); return; }
      response.end(JSON.stringify(catalog));
      return;
    }
    const detail = pathname.match(/^\/api\/constructed-archetypes\/teaser\/standard\/([a-z-]+)$/);
    const item = detail && ROWS.find(candidate => candidate.slug === detail[1]);
    if (item) { response.end(JSON.stringify(detailOf(item))); return; }
    if (pathname === '/api/auth/me') { response.end('{"user":null,"adminAllowed":false,"contestAdminAllowed":false}'); return; }
    response.writeHead(404).end('{"error":"missing"}');
  });
  const legacyOrigin = await listenLocal(legacy);
  const next = await startNextServer({ legacyOrigin });
  return {
    origin: next.origin,
    close: async () => {
      await next.close();
      for (const response of pending) response.destroy();
      legacy.closeAllConnections();
      await closeLocal(legacy);
    },
  };
}

async function page(origin, slug) {
  const response = await fetch(`${origin}/standard/archetypes/standard/${slug}/`);
  const html = await response.text();
  return {
    status: response.status,
    retryAfter: response.headers.get('retry-after'),
    robotsHeader: response.headers.get('x-robots-tag'),
    robots: html.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? null,
    title: html.match(/<title>([^<]*)<\/title>/)?.[1] ?? null,
  };
}

test('an indexable archetype without a catalog, its copy and open builds is a 503, every other page as before', async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const state = { catalog: 'stall', catalogReads: [] };
  const stand = await startStand(state);
  try {
    // The catalog hangs and the process never had a copy of it.
    const thin = await page(stand.origin, 'zoolock');
    assert.deepEqual({ status: thin.status, retryAfter: thin.retryAfter, robotsHeader: thin.robotsHeader, robots: thin.robots },
      { status: 503, retryAfter: '60', robotsHeader: null, robots: null });
    assert.equal(thin.title, 'Данные временно недоступны | HearthPulse');
    assert.ok(state.catalogReads.includes('/api/constructed-archetypes/teaser?format=standard&period=patch_37.0.2'),
      'the window of the detail is the catalog asked for');

    // The catalog fails outright: the same 503.
    state.catalog = 'down';
    await delay(1100);
    const failed = await page(stand.origin, 'zoolock');
    assert.deepEqual({ status: failed.status, retryAfter: failed.retryAfter }, { status: 503, retryAfter: '60' });

    // An archetype below the index threshold in the same outage stays the page it was: 200, `noindex, follow`.
    const weak = await page(stand.origin, 'weak-warlock');
    assert.deepEqual({ status: weak.status, robots: weak.robots }, { status: 200, robots: 'noindex, follow' });

    // An indexable archetype with an open build in the same outage is worth its index: 200.
    const withBuilds = await page(stand.origin, 'handlock');
    assert.deepEqual({ status: withBuilds.status, robots: withBuilds.robots }, { status: 200, robots: INDEXABLE });

    // The catalog answers: 200 `index`.
    state.catalog = 'up';
    await delay(1100);
    const ready = await page(stand.origin, 'zoolock');
    assert.deepEqual({ status: ready.status, robots: ready.robots }, { status: 200, robots: INDEXABLE });

    // The catalog fails again, but its last good copy is in the store: still 200 `index`.
    state.catalog = 'down';
    await delay(1100);
    const fromCopy = await page(stand.origin, 'zoolock');
    assert.deepEqual({ status: fromCopy.status, robots: fromCopy.robots }, { status: 200, robots: INDEXABLE });
  } finally {
    await stand.close();
  }
});
