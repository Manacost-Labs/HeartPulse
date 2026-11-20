import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import { createBattlegroundLibrarySeoRouter } from '../server/battlegroundLibrarySeoRoutes.js';
import { createBattlegroundLibraryListingRouter } from '../server/battlegroundLibraryListing.js';
import { createLibraryStatsStore, projectLibraryStatsSlice } from '../server/battlegroundLibraryOpenStats.js';
import { libraryCardIndexingFacts as serverFacts, relatedLibraryCards } from '../server/battlegroundLibraryOpenCard.js';
import { projectPublicBattlegroundLibraryCard } from '../server/battlegroundLibrarySeoRoutes.js';
import { countLibraryCardOwnFacts, isIndexableBattlegroundLibraryCard } from '../shared/battlegroundLibraryIndexing.js';
import { libraryCardIndexingFacts as pageFacts, publicBattlegroundLibraryCard } from '../apps/public-web/lib/publicBattlegroundLibraryCardData.js';
import { parsePublicLibraryListing } from '../apps/public-web/lib/publicBattlegroundLibraryListingData.js';
import { openLibraryCards, openLibraryPayload, printedOpenLibraryItems } from '../apps/public-web/lib/openBattlegroundLibrary.js';
import { encodePublicProjectionList } from '../apps/public-web/lib/publicProjectionHeader.js';
import { catalogs, CLOSED, fetchImpl, leaks, slug, state, statsPayload } from './helpers/battlegroundLibraryOpenFixture.js';

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
    // The facts of the card's tile: the catalog id names its pictures; a golden picture, a rating and the Duos mark only when known.
    cardId: 'BG_T1001', nameEn: 'Первый зверь EN',
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
    // The aggregate index follows: degraded while the minion listing is stale, normal again once it recovers.
    assert.equal((await fetch(`${o}/api/bg/library/public/listing`)).headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=60');
    hold.down = false; t += 31_000;
    assert.match((await fetch(`${o}/api/bg/library/public/listing`)).headers.get('cache-control') ?? '', /max-age=300/);
    const recovered = await fetch(url);
    assert.equal((await recovered.json()).warning, undefined, 'recovery is not held back by the degraded copy');
    assert.match(recovered.headers.get('cache-control') ?? '', /max-age=300/);
  }
  // A failing statistics source with no copy is a 503 as well, never minions without their figures.
  state.statsDown = true;
  const coldStats = createLibraryStatsStore({ fetchImpl, now: () => clock });
  await assert.rejects(() => coldStats.get(), /statistics HTTP 500/);
  state.statsDown = false;

  // 3. The card route: the open layer next to the card, the same figures, related cards by tags, and one rule for the page and the sitemap.
  const app = express();
  app.use(createBattlegroundLibrarySeoRouter({ fetchImpl, now: () => clock, catalogCacheTtlMs: 60_000, auxiliaryCatalogBaseUrl: 'https://api.example.test/api/v1' }));
  const cardOrigin = await listen(app);
  const answer = await (await fetch(`${cardOrigin}/api/bg/library/public/minion/1001`)).text();
  assert.deepEqual(leaks(answer), [], 'no closed value in the card answer');
  const cardBody = JSON.parse(answer);
  assert.deepEqual(cardBody.stats, { avgPlacementWith: 3.9, avgPlacementWithout: 4.2, popularity: 7.5, gamesWith: 900, updatedAt: '2026-11-19T02:45:13.000Z' });
  const warm = cardBody;
  assert.deepEqual(warm.related.map((card: { dbfId: number }) => card.dbfId), [1004, 1002], 'same tribe, nearest tier first; the murloc and the archive are not related');
  assert.deepEqual(Object.keys(warm.related[0]).sort(), ['dbfId', 'name', 'path', 'tavernTier', 'tribe']);
  // A cold catalog with a working single-card identity read: the first answer still carries the related cards.
  {
    const identityFetch: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      const m = url.pathname.match(/\/cards\/by-dbf\/(\d+)$/);
      if (m) return new Response(JSON.stringify(catalogs['minion:1'].find(raw => (raw as { dbf: number }).dbf === Number(m[1]))));
      return fetchImpl(input, init);
    };
    const coldApp = express();
    coldApp.use(createBattlegroundLibrarySeoRouter({ fetchImpl: identityFetch, now: () => clock, auxiliaryCatalogBaseUrl: 'https://api.example.test/api/v1' }));
    const first = await (await fetch(`${await listen(coldApp)}/api/bg/library/public/minion/1001`)).json();
    assert.deepEqual(first.related.map((card: { dbfId: number }) => card.dbfId), [1004, 1002], 'the first visitor gets related cards');
  }
  state.statsDown = true; clock += 10 * 60_000;
  const outage = await fetch(`${cardOrigin}/api/bg/library/public/minion/1001`);
  assert.equal(outage.status, 200, 'the held statistics keep serving after a source failure');
  state.statsDown = false;

  // 4. One rule, one decision: the facts the server counts for the sitemap are the facts the page counts.
  for (const dbfId of [1001, 1002, 1003, 1004]) {
    const answerOf = await (await fetch(`${cardOrigin}/api/bg/library/public/minion/${dbfId}`)).json();
    const card = publicBattlegroundLibraryCard(answerOf, 'minions', String(dbfId));
    const serverCard = projectPublicBattlegroundLibraryCard(catalogs['minion:1'].find(raw => (raw as { dbf: number }).dbf === dbfId), 'minion', true)!;
    const figures = slice.byDbf.get(dbfId) ?? null;
    const server = serverFacts(serverCard, figures);
    const page = pageFacts(card);
    assert.equal(isIndexableBattlegroundLibraryCard(page), isIndexableBattlegroundLibraryCard(server), `page and sitemap agree on ${dbfId}`);
    assert.equal(countLibraryCardOwnFacts(page), countLibraryCardOwnFacts(server), `same facts for ${dbfId}`);
  }
  // 5. The threshold: ten own facts. A thin spell is not indexable, a minion with the golden version and statistics is.
  const spell = projectPublicBattlegroundLibraryCard(catalogs['spell:1'][0], 'spell', true)!;
  assert.equal(countLibraryCardOwnFacts(serverFacts(spell, null)), 4);
  assert.equal(isIndexableBattlegroundLibraryCard(serverFacts(spell, null)), false);
  const minion = projectPublicBattlegroundLibraryCard(catalogs['minion:1'][0], 'minion', true)!;
  assert.equal(countLibraryCardOwnFacts(serverFacts(minion, slice.byDbf.get(1001)!)), 14);
  assert.equal(isIndexableBattlegroundLibraryCard(serverFacts(minion, null)), true, 'ten facts without statistics: the margin is one');
  assert.equal(isIndexableBattlegroundLibraryCard(serverFacts({ ...minion, golden: null }, null)), false);
  assert.equal(isIndexableBattlegroundLibraryCard({ name: null, typeName: 'Существо', tavernTier: 1, tribe: 'Зверь', attack: 1, health: 1, text: 'x', mechanicCount: 9, goldenAttack: 1, goldenHealth: 1 }), false, 'no name, no page');
  assert.deepEqual(relatedLibraryCards(minion, [minion], '/library'), [], 'never the card itself');

  // 6. The page parsers copy the allowlist only: a dirty answer cannot put a closed value into the HTML, the RSC payload or the JSON-LD.
  const dirtyCard = JSON.parse(answer);
  dirtyCard.stats = { ...dirtyCard.stats, impact: CLOSED[0], combatWinrate: CLOSED[1], rounds: [CLOSED[2]], history: [CLOSED[5]] };
  dirtyCard.card = { ...dirtyCard.card, impact: CLOSED[0], purchases: [CLOSED[3]], positions: CLOSED[4], raw: CLOSED[6], mechanics: ['Провокация', CLOSED[0]].slice(0, 1) };
  dirtyCard.related = [{ ...warm.related[0], impact: CLOSED[0] }, { dbfId: 9, name: 'Чужая', path: 'https://evil.example/x-9/' }];
  assert.notDeepEqual(leaks(JSON.stringify(dirtyCard)), [], 'mutation: the dirty answer does carry closed values');
  const parsedCard = publicBattlegroundLibraryCard(dirtyCard, 'minions', '1001');
  assert.deepEqual(leaks(JSON.stringify(parsedCard)), []);
  assert.deepEqual(Object.keys(parsedCard.stats!).sort(), ['avgPlacementWith', 'avgPlacementWithout', 'gamesWith', 'popularity', 'updatedAt']);
  assert.equal(parsedCard.related.length, 1, 'a related card off the library paths is dropped');
  const dirtyListing = JSON.parse(text);
  dirtyListing.items = dirtyListing.items.map((item: object) => ({ ...item, impact: CLOSED[0], rounds: [CLOSED[2]] }));
  dirtyListing.items.find((item: { stats?: object }) => item.stats).stats.combatWinrate = CLOSED[1];
  assert.notDeepEqual(leaks(JSON.stringify(dirtyListing)), []);
  const parsedListing = parsePublicLibraryListing(dirtyListing, 'minions')!;
  assert.deepEqual(leaks(JSON.stringify(parsedListing)), []);
  assert.deepEqual(Object.keys(parsedListing.items.find(item => item.stats)!).sort(),
    ['attack', 'cardId', 'dbfId', 'duosOnly', 'golden', 'group', 'health', 'name', 'nameEn', 'path', 'stats', 'tavernTier', 'tier', 'typeName']);
  // The tile facts are checked too: an id or a picture path that could leave the catalog is dropped.
  const hostile = parsePublicLibraryListing({ ...dirtyListing, items: [{ ...dirtyListing.items[0], cardId: 'X"><script>', golden: 'golden/../../x.png',
    nameEn: 'A', tier: 'S', duosOnly: 'yes' }] }, 'minions')!;
  assert.deepEqual([hostile.items[0].cardId, hostile.items[0].golden, hostile.items[0].tier, hostile.items[0].duosOnly], [null, null, 'S', false]);

  // 6b. The open listing as the subscriber's listing view reads it: the client gets the tile facts only (no statistics,
  // no paths), Duos-only cards are hidden like for a subscriber, and the JSON-LD names exactly the printed first page.
  const tiles = (count: number, extra: (index: number) => object) => ({ kind: 'minions', slice: null, items: Array.from({ length: count }, (_value, index) => ({
    dbfId: 500 + index, name: `Карта ${String(index).padStart(2, '0')}`, typeName: 'Существо', path: `/library/minions/karta-${500 + index}/`,
    tavernTier: 1 + (index % 3), group: 'Зверь', attack: 1, health: 1, cardId: `BG_X${index}`, ...extra(index),
  })) });
  const fortyCards = parsePublicLibraryListing(tiles(40, index => index < 2 ? { duosOnly: true } : index === 2 ? { golden: 'golden/BG_X2-ab.png' } : {}), 'minions')!;
  const payload = openLibraryPayload(fortyCards);
  assert.deepEqual(Object.keys(payload.items[0]).sort(), ['cardId', 'dbfId', 'duosOnly', 'group', 'name', 'tavernTier']);
  const cards = openLibraryCards(payload);
  const golden = cards.find(card => card.dbf === 502)!;
  assert.deepEqual(golden.images, { card: '/api/public-resource/db/uploads/cards/BG_X2.png', golden: '/api/public-resource/db/uploads/golden/BG_X2-ab.png' });
  assert.deepEqual(golden.creature_type, { slug: 'beast', name_ru: 'Зверь' }, 'the tribe gets the slug of its icon');
  const printed = printedOpenLibraryItems(fortyCards);
  assert.equal(printed.length, 36, 'the first page of the listing');
  assert.ok(printed.every(item => item.dbfId !== 500 && item.dbfId !== 501), 'Duos-only cards are hidden by default');
  assert.deepEqual(printed.slice(0, 3).map(item => item.tavernTier), [1, 1, 1], 'by tavern tier first');
  const prizes = parsePublicLibraryListing({ kind: 'darkmoon-prizes', items: [
    { dbfId: 9001, name: 'Приз Б', typeName: 'Приз', path: '/library/darkmoon-prizes/priz-b-9001/', tier: '2', cardId: 'BGS_T1' },
    { dbfId: 9002, name: 'Приз А', typeName: 'Приз', path: '/library/darkmoon-prizes/priz-a-9002/', tier: '1', cardId: 'BGS_T2' },
  ] }, 'darkmoon-prizes')!;
  assert.deepEqual(printedOpenLibraryItems(prizes).map(item => item.dbfId), [9002, 9001], 'prizes by their rating');
  assert.equal(openLibraryCards(openLibraryPayload(prizes))[0].images.card, '/api/public-resource/hsjson/v1/bgs/latest/ruRU/512x/BGS_T1.png');
  assert.equal(parsePublicLibraryListing({ ...dirtyListing, items: [] }, 'minions'), null, 'an empty listing is not a page');
  assert.equal(parsePublicLibraryListing(dirtyListing, 'spells'), null, 'another kind is not this listing');
  assert.equal(parsePublicLibraryListing({ ...dirtyListing, items: [{ ...dirtyListing.items[0], path: '//evil.example/x-1001/' }] }, 'minions'), null);

  // 7. The related header: the longest prefix that fits, never a failure.
  const many = Array.from({ length: 6 }, (_value, index) => ({ dbfId: index + 1, name: 'Я'.repeat(170), path: `/library/minions/${'я'.repeat(70)}-${index + 1}/` }));
  const encoded = encodePublicProjectionList(many);
  assert.ok(encoded && encoded.length <= 4096);
  assert.equal(encodePublicProjectionList([]), null);
  console.log('battleground library open layer tests passed');
} finally {
  await closeAll();
}
