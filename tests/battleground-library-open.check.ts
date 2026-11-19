import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import { projectPublicBattlegroundLibraryCard } from '../server/battlegroundLibrarySeoRoutes.js';
import { createBattlegroundLibraryListingRouter } from '../server/battlegroundLibraryListing.js';
import { createLibraryStatsStore, projectLibraryStatsSlice } from '../server/battlegroundLibraryOpenStats.js';
import { parsePublicLibraryListing } from '../apps/public-web/lib/publicBattlegroundLibraryListingData.js';
import { CLOSED, fetchImpl, leaks, slug, state, statsPayload } from './helpers/battlegroundLibraryOpenFixture.js';

// The open library (E21): what a guest and a robot may read of the Battlegrounds library, and the sentinel check that
// nothing closed leaves with it. Every closed figure of the source (impact, combat win rate, the rounds, purchases,
// board positions, history, the sample without the minion) has a value of its own; the checks look for them in the
// projection, the route answers and the page parsers. Copying a closed field into a projection makes them fail.

const opened: Server[] = [];
const listen = async (app: express.Express) => {
  const server = app.listen(0, '127.0.0.1');
  opened.push(server);
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
};
const closeAll = () => Promise.all(opened.map(server => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); })));

let clock = 1_000;
try {
  // 1. The statistics projection: the open figures by name, the sample threshold, the base range only.
  const slice = projectLibraryStatsSlice(statsPayload());
  assert.deepEqual([...slice.byDbf.keys()], [1001, 1002], 'a minion below 30 games has no figures, never a zero');
  assert.deepEqual(slice.byDbf.get(1001), { avgPlacementWith: 3.9, avgPlacementWithout: 4.2, popularity: 7.5, gamesWith: 900 });
  assert.deepEqual(leaks(JSON.stringify([...slice.byDbf])), [], 'no closed value in the projection');
  assert.throws(() => projectLibraryStatsSlice({ ...statsPayload(), latest_run: { mmr_percentile: 'TOP_1_PERCENT' } }), /base rating range/);
  assert.throws(() => projectLibraryStatsSlice({ latest_run: { mmr_percentile: 'TOP_50_PERCENT' }, minions: [] }), /no minions/);
  // Mutation: a leaky projection (the whole row) does carry the marks, so the check above is not vacuous.
  assert.notDeepEqual(leaks(JSON.stringify(statsPayload().minions[0])), [], 'the source row does carry closed values');

  // 2. The listing route: open fields only, own cache with ETag, last good copy, 503 without any copy.
  const base = express();
  const catalogByKind = async (kind: 'minion' | 'spell') => {
    const read = async (pool: 0 | 1) => (await (await fetchImpl(`http://127.0.0.1:3108/api/bg/library/cards?card_type=${kind}&in_pool=${pool}`)).json() as { data: unknown[] }).data;
    return [...await read(1), ...await read(0)].map(raw => projectPublicBattlegroundLibraryCard(raw, kind, (raw as { in_pool: boolean }).in_pool)!);
  };
  const stats = createLibraryStatsStore({ fetchImpl, now: () => clock });
  base.use(createBattlegroundLibraryListingRouter({ loadBaseCards: catalogByKind, stats, fetchImpl, apiBaseUrl: 'https://api.example.test/api/v1', now: () => clock, retryAfterSeconds: 45 }));
  const origin = await listen(base);
  const listing = await fetch(`${origin}/api/bg/library/public/listing/minions`);
  assert.equal(listing.status, 200);
  assert.match(listing.headers.get('cache-control') ?? '', /public, max-age=300/);
  assert.equal(listing.headers.get('x-robots-tag'), 'noindex, nofollow');
  const etag = listing.headers.get('etag');
  assert.ok(etag);
  const text = await listing.text();
  assert.deepEqual(leaks(text), [], 'no closed value in the listing answer');
  const body = JSON.parse(text);
  assert.equal(body.total, 4, 'only the current pool is listed');
  assert.deepEqual(body.items.map((item: { dbfId: number }) => item.dbfId), [1004, 1003, 1001, 1002], 'tier, then name');
  assert.deepEqual(body.items.find((item: { dbfId: number }) => item.dbfId === 1001), {
    dbfId: 1001, name: 'Первый зверь', typeName: 'Существо', path: `/library/minions/${slug('Первый зверь')}-1001/`, tavernTier: 2, group: 'Зверь', attack: 3, health: 4,
    stats: { avgPlacementWith: 3.9, popularity: 7.5, gamesWith: 900 },
  });
  assert.equal(body.items.find((item: { dbfId: number }) => item.dbfId === 1004).stats, undefined, 'below the sample: no figures');
  assert.deepEqual(body.slice, { mmr: 'TOP_50_PERCENT', source: 'HSReplay', updatedAt: '2026-11-19T02:45:13.000Z' });
  assert.equal((await fetch(`${origin}/api/bg/library/public/listing/minions`, { headers: { 'If-None-Match': etag } })).status, 304);
  assert.equal((await fetch(`${origin}/api/bg/library/public/listing/unknown`)).status, 404);
  assert.equal((await fetch(`${origin}/api/bg/library/public/listing/minions?mmr=TOP_1_PERCENT`)).status, 200, 'the range is not a parameter');
  const extra = await (await fetch(`${origin}/api/bg/library/public/listing/anomalies`)).text();
  assert.deepEqual(leaks(extra), [], 'no closed value in a staged listing');
  assert.deepEqual(JSON.parse(extra).items.map((item: { name: string }) => item.name), ['Аномалия 1', 'Аномалия 2'], 'every page of the source is read');
  assert.equal(JSON.parse(extra).items[0].image, undefined, 'a listing carries no picture');
  const index = await (await fetch(`${origin}/api/bg/library/public/listing`)).json();
  assert.ok(index.kinds.some((kind: { kind: string; total: number }) => kind.kind === 'minions' && kind.total === 4));

  // The last known good copy: the source fails after a good read, the listing keeps answering with a warning.
  state.down = true; clock += 400_000;
  const stale = await fetch(`${origin}/api/bg/library/public/listing/minions`);
  assert.equal(stale.status, 200);
  const staleBody = await stale.json();
  assert.equal(staleBody.warning, 'stale');
  assert.equal(staleBody.total, 4);
  // A listing never read has no copy: 503 with Retry-After (not a 502, not an empty list).
  const coldApp = express();
  coldApp.use(createBattlegroundLibraryListingRouter({ loadBaseCards: catalogByKind, stats: createLibraryStatsStore({ fetchImpl, now: () => clock }),
    fetchImpl, apiBaseUrl: 'https://api.example.test/api/v1', now: () => clock, retryAfterSeconds: 45 }));
  const cold = await fetch(`${await listen(coldApp)}/api/bg/library/public/listing/spells`);
  assert.equal(cold.status, 503);
  assert.equal(cold.headers.get('retry-after'), '45');
  assert.match(cold.headers.get('cache-control') ?? '', /no-store/);
  state.down = false;
  // Stale statistics: the listing built on them is degraded (short header) and not held as fresh, so recovery shows at once.
  {
    let t = 1_000;
    const hold = { down: false };
    const flaky: typeof fetch = async (input, init) => (hold.down && String(input).includes('minion-stats')
      ? new Response('down', { status: 500 }) : fetchImpl(input, init));
    const store = createLibraryStatsStore({ fetchImpl: flaky, now: () => t, ttlMs: 1_000 });
    const app = express();
    app.use(createBattlegroundLibraryListingRouter({ loadBaseCards: catalogByKind, stats: store, fetchImpl, apiBaseUrl: 'https://api.example.test/api/v1', now: () => t }));
    const o = await listen(app);
    const url = `${o}/api/bg/library/public/listing/minions`;
    assert.equal((await fetch(url)).headers.get('cache-control'), 'public, max-age=300, stale-while-revalidate=600');
    hold.down = true; t += 400_000;
    const degraded = await fetch(url);
    assert.equal((await degraded.json()).warning, 'stale');
    assert.equal(degraded.headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=60');
    hold.down = false; t += 31_000;
    const recovered = await fetch(url);
    assert.equal((await recovered.json()).warning, undefined, 'recovery is not held back by the degraded copy');
    assert.match(recovered.headers.get('cache-control') ?? '', /max-age=300/);
  }
  // A failing statistics source with no copy is a 503 as well, never minions without their figures.
  state.statsDown = true;
  const coldStats = createLibraryStatsStore({ fetchImpl, now: () => clock });
  await assert.rejects(() => coldStats.get(), /statistics HTTP 500/);
  state.statsDown = false;

  // 3. The page parser copies the allowlist only: a dirty answer cannot put a closed value into the HTML, the RSC payload or the JSON-LD.
  const dirtyListing = JSON.parse(text);
  dirtyListing.items = dirtyListing.items.map((item: object) => ({ ...item, impact: CLOSED[0], rounds: [CLOSED[2]] }));
  dirtyListing.items.find((item: { stats?: object }) => item.stats).stats.combatWinrate = CLOSED[1];
  assert.notDeepEqual(leaks(JSON.stringify(dirtyListing)), []);
  const parsedListing = parsePublicLibraryListing(dirtyListing, 'minions')!;
  assert.deepEqual(leaks(JSON.stringify(parsedListing)), []);
  assert.deepEqual(Object.keys(parsedListing.items.find(item => item.stats)!).sort(), ['attack', 'dbfId', 'group', 'health', 'name', 'path', 'stats', 'tavernTier', 'typeName']);
  assert.equal(parsePublicLibraryListing({ ...dirtyListing, items: [] }, 'minions'), null, 'an empty listing is not a page');
  assert.equal(parsePublicLibraryListing(dirtyListing, 'spells'), null, 'another kind is not this listing');
  assert.equal(parsePublicLibraryListing({ ...dirtyListing, items: [{ ...dirtyListing.items[0], path: '//evil.example/x-1001/' }] }, 'minions'), null);

  console.log('battleground library open layer tests passed');
} finally {
  await closeAll();
}
