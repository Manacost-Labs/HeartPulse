import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import test, { after } from 'node:test';
import express, { type RequestHandler } from 'express';
import { createBattlegroundHeroRankingRouter } from '../server/battlegroundHeroRankingRoutes';
import { createBattlegroundHeroCatalogLoader } from '../server/battlegroundHeroRankingSource';
import { projectBattlegroundHeroRanking } from '../server/battlegroundHeroRankingProjection';
import { createBattlegroundProxyRouter } from '../server/battlegroundProxyRoutes';
import { parsePublicBattlegroundHeroesRanking } from '../apps/public-web/lib/publicBattlegroundHeroesData';
import { seoStructuredDataGraph } from '../src/seo/structuredData';
import { buildHeroCatalog, closedValues, HERO_COUNT, OPEN_ROWS, UPDATED_AT } from './helpers/battlegroundHeroesFixture';

// The open hero ranking: what a guest and a robot may read, and the sentinel check that nothing
// closed leaves with it. Every closed figure (the other rating ranges, single places, the adjusted
// placement, per-patch history) has a value of its own; the checks look for them in the projection,
// the route answers and the page's JSON-LD. Copying a closed field into the projection, or asking
// the service for another range, makes them fail.

const CLOSED = closedValues();
const leaks = (text: string) => CLOSED.filter(value => text.includes(value));

// Every server is closed after the tests, so a failed assertion cannot leave one open and hang `node --test`.
const opened: Server[] = [];
after(async () => { await Promise.all(opened.map(server => close(server))); });
const listen = async (app: express.Express) => {
  const server = app.listen(0, '127.0.0.1');
  opened.push(server);
  await once(server, 'listening');
  return { server, origin: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
};
const close = (server: Server) => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); });

test('the sentinel list is not vacuous: it holds other ranges, single places and the adjusted placement', () => {
  for (const mark of ['4.4321', '12.3456', '3.9876']) assert.ok(CLOSED.some(value => value.includes(mark)), mark);
  assert.ok(CLOSED.length > 40, `${CLOSED.length} closed values`);
  const raw = JSON.stringify(buildHeroCatalog('TOP_50_PERCENT', 'solo'));
  assert.ok(leaks(raw).length > 40, 'the raw base catalog leaks them');
});

test('the projection is the ranked heroes with open figures only, best average place first', () => {
  for (const mode of ['solo', 'duos'] as const) {
    const ranking = projectBattlegroundHeroRanking(buildHeroCatalog('TOP_50_PERCENT', mode), mode)!;
    assert.deepEqual(Object.keys(ranking).sort(), ['heroes', 'mmr', 'mode', 'source', 'updatedAt']);
    assert.equal(ranking.mmr, 'TOP_50_PERCENT');
    assert.equal(ranking.updatedAt, new Date(UPDATED_AT).toISOString());
    assert.equal(ranking.heroes.length, HERO_COUNT, 'an unrated hero has no place in the ranking');
    assert.deepEqual(ranking.heroes.map(({ dbfId, name, tier, avgPlacement, top4Rate, pickRate }) => ({ dbfId, name, tier, avgPlacement, top4Rate, pickRate })),
      OPEN_ROWS(mode));
    assert.deepEqual(Object.keys(ranking.heroes[0]).sort(), ['avgPlacement', 'bestComposition', 'cardId', 'dbfId', 'heroPowerName',
      'image', 'keyMinions', 'name', 'pickRate', 'tier', 'top4Rate']);
    assert.equal(ranking.heroes[0].image, '/api/public-resource/wiki/images/BG_SENT_HERO_0.png');
    assert.equal(ranking.heroes[0].heroPowerName, 'Сила 0');
    assert.equal(ranking.heroes[0].bestComposition, 'Сборка 0');
    assert.deepEqual(ranking.heroes[0].keyMinions, ['Существо 0a', 'Существо 0b']);
    assert.deepEqual(leaks(JSON.stringify(ranking)), [], `no closed value in the ${mode} projection`);
  }
});

test('a sample size passes only when the row carries one; odd rows are skipped', () => {
  const catalog = buildHeroCatalog('TOP_50_PERCENT', 'solo') as { view: { heroes: Array<Record<string, unknown>> } };
  catalog.view.heroes[0].games = 12_345;
  catalog.view.heroes.push({ hero: 'Дубль', dbfId: catalog.view.heroes[1].dbfId, tier: 'A', avg_placement: '3.00' },
    { hero: 'Нулевой', dbfId: 0, tier: 'A', avg_placement: '3.00' }, { hero: 'Плохой', dbfId: 5, tier: 'Z', avg_placement: '3.00' },
    { hero: 'Далёкий', dbfId: 6, tier: 'A', avg_placement: '9.5' });
  const ranking = projectBattlegroundHeroRanking(catalog, 'solo')!;
  assert.equal(ranking.heroes.length, HERO_COUNT);
  assert.equal(ranking.heroes.find(hero => hero.dbfId === 1003)?.games, 12_345);
  assert.equal(ranking.heroes.filter(hero => 'games' in hero).length, 1);
  assert.equal(projectBattlegroundHeroRanking({ ok: false }, 'solo'), null);
  assert.equal(projectBattlegroundHeroRanking({ view: { heroes: [] } }, 'solo'), null);
  assert.equal(projectBattlegroundHeroRanking(null, 'solo'), null);
});

test('the page parser copies only the whitelisted fields, caps the list and drops odd values', () => {
  const ranking = projectBattlegroundHeroRanking(buildHeroCatalog('TOP_50_PERCENT', 'solo'), 'solo')!;
  const dirty = structuredClone(ranking) as typeof ranking & Record<string, unknown>;
  dirty.ranges = { TOP_1_PERCENT: { avgPlacement: 4.4321 } };
  dirty.heroes.forEach((hero, index) => Object.assign(hero, {
    placementDistribution: ['12.3456%'], adjustedAvgPlacement: 3.9876, anomalyAdjusted: true, avgPlacement1: 4.4321, top4Rate: index ? hero.top4Rate : 140,
  }));
  const parsed = parsePublicBattlegroundHeroesRanking(dirty, 'solo')!;
  assert.equal(parsed.heroes.length, HERO_COUNT);
  assert.deepEqual(Object.keys(parsed.heroes[0]).sort(), ['avgPlacement', 'bestComposition', 'dbfId', 'games', 'heroPowerName', 'image',
    'keyMinions', 'name', 'pickRate', 'tier', 'top4Rate']);
  assert.equal(parsed.heroes[0].top4Rate, null, 'a share over 100 is dropped');
  assert.deepEqual(leaks(JSON.stringify(parsed)), []);
  assert.equal(parsePublicBattlegroundHeroesRanking(ranking, 'duos'), null, 'the mode must match');
  for (const bad of [null, [], 'x', {}, { mode: 'solo', heroes: [] }, { mode: 'solo', heroes: [{ dbfId: 1, name: 'A', tier: 'A', avgPlacement: 12 }] }]) {
    assert.equal(parsePublicBattlegroundHeroesRanking(bad, 'solo'), null, JSON.stringify(bad));
  }
});

test('the JSON-LD of /heroes names the closed part, has an ItemList equal to the table and no closed value', async () => {
  const ranking = projectBattlegroundHeroRanking(buildHeroCatalog('TOP_50_PERCENT', 'solo'), 'solo')!;
  const items = ranking.heroes.map(hero => ({ name: hero.name, url: `https://hearthpulse.net/heroes/${hero.dbfId}/` }));
  const graph = (await seoStructuredDataGraph('/heroes', { dateModified: ranking.updatedAt, items }))!['@graph'];
  const dataset = graph.find(node => node['@type'] === 'Dataset')!;
  assert.equal(dataset.isAccessibleForFree, false);
  assert.deepEqual(dataset.hasPart, { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-heroes' });
  assert.equal('license' in dataset, false);
  assert.equal('creator' in dataset, false);
  const list = graph.find(node => node['@type'] === 'ItemList') as { numberOfItems: number; itemListElement: Array<{ name: string; url: string }> };
  assert.equal(list.numberOfItems, HERO_COUNT);
  assert.deepEqual(list.itemListElement.map(({ name, url }) => ({ name, url })), items);
  assert.deepEqual(leaks(JSON.stringify(graph)), []);
});

function startService(state: { reads: string[]; down: boolean }) {
  const app = express();
  app.get('/api/bg/heroes', (request, response) => {
    state.reads.push(request.originalUrl);
    if (state.down) return response.status(500).json({ error: 'secret upstream failure' });
    const mmr = String(request.query.mmr ?? 'TOP_50_PERCENT');
    return response.json(buildHeroCatalog(mmr, String(request.query.mode ?? 'solo')));
  });
  return listen(app);
}

test('the open route serves the base range only, caches, goes stale and answers 503 without a copy', async () => {
  const state = { reads: [] as string[], down: false };
  const service = await startService(state);
  let clock = 1_000;
  const app = express();
  app.use('/api', createBattlegroundHeroRankingRouter({
    loadCatalog: createBattlegroundHeroCatalogLoader({ baseUrl: `${service.origin}/api/bg/heroes` }),
    now: () => clock, onError: () => undefined,
  }));
  const api = await listen(app);
  const get = (query: string, headers: Record<string, string> = {}) => fetch(`${api.origin}/api/bg/heroes/public${query}`, { headers });
  try {
    for (const mode of ['solo', 'duos']) {
      const response = await get(`?mode=${mode}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control') ?? '', /^public, max-age=300/);
      assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/);
      const text = await response.text();
      assert.deepEqual(leaks(text), [], `no closed value in the ${mode} answer`);
      const body = JSON.parse(text);
      assert.equal(body.mode, mode);
      assert.equal(body.heroes.length, HERO_COUNT);
    }
    assert.deepEqual(state.reads, ['/api/bg/heroes?mode=solo&mmr=TOP_50_PERCENT', '/api/bg/heroes?mode=duos&mmr=TOP_50_PERCENT'],
      'the server asks for the base range itself, one read per mode');
    assert.equal((await get('')).status, 200, 'solo by default');

    for (const query of ['?mmr=TOP_1_PERCENT', '?mode=solo&mmr=TOP_20_PERCENT', '?mode=solo&mmr=TOP_50_PERCENT', '?mode=arena', '?mode=solo&mode=duos']) {
      const response = await get(query);
      assert.equal(response.status, 400, query);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    assert.equal(state.reads.length, 2, 'a refused request never reaches the service');

    const first = await get('?mode=solo');
    const etag = first.headers.get('etag')!;
    assert.equal((await get('?mode=solo', { 'If-None-Match': etag })).status, 304);

    // Expired and the service down: the last known copy, flagged stale; no cookies or sessions play a part.
    clock += 400_000;
    state.down = true;
    const stale = await get('?mode=solo', { Cookie: 'session=subscriber' });
    assert.equal(stale.status, 200);
    const staleText = await stale.text();
    assert.equal(JSON.parse(staleText).warning, 'stale');
    assert.deepEqual(leaks(staleText), []);
    assert.doesNotMatch(staleText, /secret upstream failure/);
  } finally {
    await close(api.server);
  }

  // No copy at all: 503 with Retry-After, never an empty ranking.
  const empty = express();
  empty.use('/api', createBattlegroundHeroRankingRouter({ loadCatalog: async () => { throw new Error('down'); }, onError: () => undefined, retryAfterSeconds: 45 }));
  const emptyApi = await listen(empty);
  try {
    const response = await fetch(`${emptyApi.origin}/api/bg/heroes/public?mode=duos`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '45');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    await close(emptyApi.server);
  }
  const noHeroes = express();
  noHeroes.use('/api', createBattlegroundHeroRankingRouter({ loadCatalog: async () => ({ ok: true, view: { heroes: [] } }), onError: () => undefined }));
  const noHeroesApi = await listen(noHeroes);
  try {
    assert.equal((await fetch(`${noHeroesApi.origin}/api/bg/heroes/public`)).status, 503, 'an empty catalog is no 200');
  } finally {
    await close(noHeroesApi.server);
    await close(service.server);
  }
});

test('the guarded /api/bg/heroes stays closed to a guest for every range and open to a subscriber', async () => {
  const upstream: string[] = [];
  const requireAccess: RequestHandler = (request, response, next) => {
    if (request.headers['x-test-access'] !== 'subscriber') return response.status(401).json({ error: 'authentication required' });
    return next();
  };
  const app = express();
  app.use('/api', createBattlegroundProxyRouter({
    requireAccess,
    proxyLegacy: () => undefined,
    proxyApp: (request, response, path) => { upstream.push(`${path}?${new URLSearchParams(request.query as Record<string, string>)}`); response.json({ ok: true }); },
    proxyExtraLibrary: () => undefined,
    enrichHeroPayload: payload => payload,
  }));
  const api = await listen(app);
  try {
    for (const range of ['TOP_50_PERCENT', 'TOP_20_PERCENT', 'TOP_5_PERCENT', 'TOP_1_PERCENT']) {
      assert.equal((await fetch(`${api.origin}/api/bg/heroes?mode=solo&mmr=${range}`)).status, 401, `${range} is closed to a guest`);
      assert.equal((await fetch(`${api.origin}/api/bg/heroes?mode=solo&mmr=${range}`, { headers: { 'x-test-access': 'subscriber' } })).status, 200);
    }
    assert.equal((await fetch(`${api.origin}/api/bg/heroes/1000/details`)).status, 401);
    assert.equal((await fetch(`${api.origin}/api/bg/heroes/compositions`)).status, 401);
    assert.equal(upstream.length, 4, 'only the four subscriber reads reached the service');
  } finally {
    await close(api.server);
  }
});
