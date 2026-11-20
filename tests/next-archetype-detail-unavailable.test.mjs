import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

// An indexable archetype page (#599) whose open builds are all refused and whose catalog surely failed (an error or a
// refusal, no last good copy) would be a thin `index` page: the production Next answers it with a 503 and `Retry-After`.
// A page that does not index, a page with open builds, a catalog that answers, has its copy or is merely slow: a 200.

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

/**
 * A fresh production Next (no copy of any catalog) over a fake Express: its catalog answers as `state.catalog` says
 * (`slow` answers after 2.5 s, past the probe's wait), a detail after `state.detailDelay` ms; reads are counted.
 */
async function startStand(state) {
  const legacy = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const pathname = new URL(request.url, 'http://fixture').pathname;
    if (pathname === '/api/constructed-archetypes/teaser') {
      state.catalogReads.push(request.url);
      if (state.catalog === 'down') { response.writeHead(502).end('{"error":"down"}'); return; }
      if (state.catalog === 'missing') { response.writeHead(404).end('{"error":"missing"}'); return; }
      setTimeout(() => response.end(JSON.stringify(catalog)), state.catalog === 'slow' ? 2500 : 0);
      return;
    }
    const detail = pathname.match(/^\/api\/constructed-archetypes\/teaser\/standard\/([a-z-]+)$/);
    const item = detail && ROWS.find(candidate => candidate.slug === detail[1]);
    if (item) {
      state.detailReads.push(item.slug);
      setTimeout(() => response.end(JSON.stringify(detailOf(item))), state.detailDelay);
      return;
    }
    if (pathname === '/api/auth/me') { response.end('{"user":null,"adminAllowed":false,"contestAdminAllowed":false}'); return; }
    response.writeHead(404).end('{"error":"missing"}');
  });
  const legacyOrigin = await listenLocal(legacy);
  const next = await startNextServer({ legacyOrigin });
  return {
    origin: next.origin,
    close: async () => {
      await next.close();
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

test('an indexable archetype without open builds whose catalog surely failed is a 503, every other page as before', async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const state = { catalog: 'down', catalogReads: [], detailReads: [], detailDelay: 0 };
  const stand = await startStand(state);
  try {
    // The catalog fails and the process never had a copy of it.
    const thin = await page(stand.origin, 'zoolock');
    assert.deepEqual(thin, { status: 503, retryAfter: '60', robotsHeader: null, robots: null, title: 'Данные временно недоступны | HearthPulse' });
    assert.deepEqual(state.catalogReads, ['/api/constructed-archetypes/teaser?format=standard&period=patch_37.0.2']);

    // A page below the index threshold and a page with an open build, in the same outage: 200 as before.
    const weak = await page(stand.origin, 'weak-warlock');
    assert.deepEqual({ status: weak.status, robots: weak.robots }, { status: 200, robots: 'noindex, follow' });
    const withBuilds = await page(stand.origin, 'handlock');
    assert.deepEqual({ status: withBuilds.status, robots: withBuilds.robots }, { status: 200, robots: INDEXABLE });

    // The page takes the probe's read of its detail: each document reads it from Express once.
    state.detailReads.length = 0;
    for (let index = 0; index < 3; index++) assert.equal((await page(stand.origin, 'handlock')).status, 200);
    assert.deepEqual(state.detailReads, ['handlock', 'handlock', 'handlock']);

    // The source refuses the catalog: the same 503; a detail slower than two seconds changes nothing.
    state.catalog = 'missing';
    state.detailDelay = 2500;
    await delay(5100); // the unread probe reads of the 503s above are dropped
    const refused = await page(stand.origin, 'zoolock');
    assert.deepEqual({ status: refused.status, retryAfter: refused.retryAfter }, { status: 503, retryAfter: '60' });
    state.detailDelay = 0;

    // A catalog still on its way when the probe stops waiting is no outage: 200 `index`, as before.
    state.catalog = 'slow';
    await delay(1100);
    const slow = await page(stand.origin, 'zoolock');
    assert.deepEqual({ status: slow.status, robots: slow.robots }, { status: 200, robots: INDEXABLE });

    // The catalog answers, then fails again with its last good copy in the store: 200 `index` both times.
    state.catalog = 'up';
    await delay(1100);
    const ready = await page(stand.origin, 'zoolock');
    assert.deepEqual({ status: ready.status, robots: ready.robots }, { status: 200, robots: INDEXABLE });
    state.catalog = 'down';
    await delay(1100);
    const fromCopy = await page(stand.origin, 'zoolock');
    assert.deepEqual({ status: fromCopy.status, robots: fromCopy.robots }, { status: 200, robots: INDEXABLE });
  } finally {
    await stand.close();
  }
});
