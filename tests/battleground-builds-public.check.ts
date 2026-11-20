import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import express, { type RequestHandler } from 'express';
import { projectBattlegroundBuildsPublic } from '../server/battlegroundBuildsPublicProjection';
import { createBattlegroundBuildsLoader, createBattlegroundBuildsRouter } from '../server/battlegroundBuildsPublicRoutes';
import { createBattlegroundProxyRouter } from '../server/battlegroundProxyRoutes';
import { parsePublicBattlegroundBuilds } from '../apps/public-web/lib/publicBattlegroundBuildsData';
import { seoStructuredDataGraph } from '../src/seo/structuredData';
import { buildSourcePayload, BUILD_COUNT, closedValues, OPEN_BUILDS, sourceOf, UPDATED_AT } from './helpers/battlegroundBuildsFixture';

// The open builds of /battlegrounds/tier-list/ and /battlegrounds/strategies/ (E21 R7): what a guest and a robot
// may read, and the sentinel check that nothing closed leaves with it. Every closed figure (sample sizes,
// first-place and top-four shares, the distribution, other rating ranges, trinkets, forks, card-level figures)
// has a value of its own; the checks look for them in the projection, the route answers and the JSON-LD.
// Copying a closed field into the projection, or asking the service for another range, makes them fail.

const CLOSED = closedValues();
const leaks = (text: string) => CLOSED.filter(value => text.includes(value));
const LISTS = ['compositions', 'strategies'] as const;

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

test('the builds sentinel list is not vacuous: sample sizes, shares, other ranges, trinkets and forks', () => {
  for (const mark of ['3.7777', '7771771', 'SENTINEL_TRINKET_0', 'SENTINEL_FORK_TEXT_0', 'SENTINEL_WHEN_TO_COMMIT_0', '44.4444', '33.33330', '2.1357']) {
    assert.ok(CLOSED.some(value => value.includes(mark)), mark);
  }
  assert.ok(CLOSED.length > 40, `${CLOSED.length} closed values`);
  assert.ok(leaks(JSON.stringify(buildSourcePayload('firestone'))).length > 40, 'the raw service answer leaks them');
});

test('the projection is the builds with open fields only, by tier, and skips rows with nothing to show', () => {
  for (const list of LISTS) {
    const builds = projectBattlegroundBuildsPublic(buildSourcePayload(sourceOf(list)), list)!;
    assert.deepEqual(Object.keys(builds).sort(), ['builds', 'list', 'source', 'updatedAt']);
    assert.equal(builds.list, list);
    assert.equal(builds.updatedAt, new Date(UPDATED_AT).toISOString());
    assert.equal(builds.builds.length, BUILD_COUNT, 'no key minion, an unusable key and a repeated key are skipped');
    assert.deepEqual(builds.builds.map(item => ({
      key: item.key, tier: item.tier, title: item.title, description: item.description, difficulty: item.difficulty, archetype: item.archetype,
      avgPlacement: item.avgPlacement, popularity: item.popularity, core: item.coreCards.map(card => card.name), extra: item.additionalCards.map(card => card.name),
    })), OPEN_BUILDS(list));
    assert.deepEqual(Object.keys(builds.builds[0]).sort(), ['additionalCards', 'archetype', 'avgPlacement', 'coreCards', 'description', 'difficulty',
      'key', 'popularity', 'tier', 'title']);
    assert.deepEqual(Object.keys(builds.builds[0].coreCards[0]).sort(), ['cardId', 'dbfId', 'frame', 'image', 'name', 'text']);
    assert.equal(builds.builds[0].coreCards[0].image, '/api/public-resource/db/uploads/cards/BG_SENT_1.png');
    // The tier list's strategy card shows the framed render and, enlarged, the card's text: public facts of the card.
    assert.equal(builds.builds[0].coreCards[0].frame, '/api/public-resource/db/uploads/framed/BG_SENT_1.png');
    assert.equal(builds.builds[0].coreCards[0].text, 'Текст существа 1');
    assert.deepEqual(leaks(JSON.stringify(builds)), [], `no closed value in the ${list} projection`);
  }
  const strategies = projectBattlegroundBuildsPublic(buildSourcePayload('firestone'), 'strategies')!;
  assert.equal(strategies.builds[0].avgPlacement, 3.78, 'the open average place is rounded, never the raw value');
  assert.equal(projectBattlegroundBuildsPublic(buildSourcePayload('firestone'), 'compositions'), null, 'the source must match the list');
  for (const bad of [null, [], 'x', {}, { error: 'Unknown BG tier list' }, { list: 'strategies', source: 'firestone', tiers: {} }]) {
    assert.equal(projectBattlegroundBuildsPublic(bad, 'strategies'), null, JSON.stringify(bad));
  }
});

test('the page parser copies only the whitelisted fields, caps the list and drops odd values', () => {
  const projected = projectBattlegroundBuildsPublic(buildSourcePayload('firestone'), 'strategies')!;
  const dirty = structuredClone(projected) as typeof projected & Record<string, unknown>;
  dirty.ranges = { TOP_1_PERCENT: { avgPlacement: 2.1357 } };
  dirty.builds.forEach((item, index) => Object.assign(item, {
    games: 7771771, firstPlace: '33.33330', popularity_top_4: 44.4444, trinkets: [{ name: 'SENTINEL_TRINKET_0' }], avgPlacement: index ? item.avgPlacement : 12,
  }));
  const parsed = parsePublicBattlegroundBuilds(dirty, 'strategies')!;
  assert.equal(parsed.builds.length, BUILD_COUNT);
  assert.deepEqual(Object.keys(parsed.builds[0]).sort(), ['additionalCards', 'archetype', 'avgPlacement', 'coreCards', 'description', 'difficulty',
    'key', 'popularity', 'tier', 'title']);
  assert.equal(parsed.builds[0].avgPlacement, null, 'a place outside 1..8 is dropped');
  assert.deepEqual(leaks(JSON.stringify(parsed)).filter(value => value !== '3.7777'), []);
  assert.equal(parsePublicBattlegroundBuilds(projected, 'compositions'), null, 'the list must match');
  for (const bad of [null, [], 'x', {}, { list: 'strategies', builds: [] }, { list: 'strategies', builds: [{ key: 'a', title: 'A', tier: 'S', coreCards: [] }] }]) {
    assert.equal(parsePublicBattlegroundBuilds(bad, 'strategies'), null, JSON.stringify(bad));
  }
});

test('the JSON-LD of both pages names the closed part, has an ItemList equal to the list and no closed value', async () => {
  for (const [path, list] of [['/battlegrounds/tier-list', 'compositions'], ['/battlegrounds/strategies', 'strategies']] as const) {
    const builds = projectBattlegroundBuildsPublic(buildSourcePayload(sourceOf(list)), list)!;
    const items = builds.builds.map(item => ({ name: item.title, url: `https://hearthpulse.net${path}/#build-${item.key}` }));
    const graph = (await seoStructuredDataGraph(path, { dateModified: builds.updatedAt, items }))!['@graph'];
    const dataset = graph.find(node => node['@type'] === 'Dataset')!;
    assert.equal(dataset.isAccessibleForFree, false, path);
    assert.deepEqual(dataset.hasPart, { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-builds' });
    assert.equal('license' in dataset, false);
    assert.equal('creator' in dataset, false);
    const itemList = graph.find(node => node['@type'] === 'ItemList') as { numberOfItems: number; itemListElement: Array<{ name: string; url: string }> };
    assert.equal(itemList.numberOfItems, BUILD_COUNT);
    assert.deepEqual(itemList.itemListElement.map(({ name, url }) => ({ name, url })), items);
    assert.deepEqual(leaks(JSON.stringify(graph)), [], `${path} JSON-LD`);
  }
});

function startService(state: { reads: string[]; down: boolean }) {
  const app = express();
  app.get('/api/bg/tier-lists', (request, response) => {
    state.reads.push(request.originalUrl);
    if (state.down) return response.status(500).json({ error: 'secret upstream failure' });
    const source = request.query.source === 'hsreplay' ? 'hsreplay' : 'firestone';
    return response.json(buildSourcePayload(source));
  });
  return listen(app);
}

test('the open route serves each list from its own source, caches, goes stale, falls back and answers 503 without a copy', async () => {
  const state = { reads: [] as string[], down: false };
  const service = await startService(state);
  const folder = mkdtempSync(join(tmpdir(), 'bg-builds-'));
  let clock = 1_000;
  const router = () => createBattlegroundBuildsRouter({
    loadSource: createBattlegroundBuildsLoader({ baseUrl: `${service.origin}/api/bg/tier-lists` }),
    fallbackDir: folder, now: () => clock, onError: () => undefined, retryAfterSeconds: 45,
  });
  const app = express();
  let current = router();
  app.use('/api', (request, response, next) => current(request, response, next));
  const api = await listen(app);
  const get = (query: string, headers: Record<string, string> = {}) => fetch(`${api.origin}/api/bg/tier-lists/public${query}`, { headers });
  try {
    for (const list of LISTS) {
      const response = await get(`?list=${list}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control') ?? '', /^public, max-age=300/);
      assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/);
      const text = await response.text();
      assert.deepEqual(leaks(text), [], `no closed value in the ${list} answer`);
      const body = JSON.parse(text);
      assert.equal(body.list, list);
      assert.equal(body.builds.length, BUILD_COUNT);
    }
    assert.deepEqual(state.reads, ['/api/bg/tier-lists?list=strategies&source=hsreplay', '/api/bg/tier-lists?list=strategies&source=firestone'],
      'the server picks the source itself, one read per list');

    for (const query of ['', '?list=minions', '?list=compositions&source=firestone', '?list=strategies&mmr=TOP_1_PERCENT', '?list=strategies&timeRange=CURRENT_PATCH',
      '?list=strategies&list=compositions']) {
      const response = await get(query);
      assert.equal(response.status, 400, query);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    assert.equal(state.reads.length, 2, 'a refused request never reaches the service');

    const first = await get('?list=strategies');
    assert.equal((await get('?list=strategies', { 'If-None-Match': first.headers.get('etag')! })).status, 304);
    assert.notEqual(first.headers.get('etag'), (await get('?list=compositions')).headers.get('etag'), 'an ETag per list');

    // Expired and the service down: the last known copy, flagged stale; no cookie or session plays a part.
    clock += 400_000;
    state.down = true;
    const stale = await get('?list=strategies', { Cookie: 'session=subscriber' });
    assert.equal(stale.status, 200);
    const staleText = await stale.text();
    assert.equal(JSON.parse(staleText).warning, 'stale');
    assert.deepEqual(leaks(staleText), []);
    assert.doesNotMatch(staleText, /secret upstream failure/);

    // A restarted server has no copy in memory: the raw answer kept on disk is projected again, flagged as a fallback.
    current = router();
    const fallback = await get('?list=compositions');
    assert.equal(fallback.status, 200);
    const fallbackText = await fallback.text();
    assert.equal(JSON.parse(fallbackText).warning, 'fallback');
    assert.deepEqual(leaks(fallbackText), [], 'the copy on disk is projected again, never served raw');
  } finally {
    await close(api.server);
    await close(service.server);
  }

  // No copy at all: 503 with Retry-After (never a 502 or an empty list).
  rmSync(folder, { recursive: true, force: true });
  const empty = express();
  empty.use('/api', createBattlegroundBuildsRouter({ loadSource: async () => { throw new Error('down'); }, fallbackDir: folder, onError: () => undefined, retryAfterSeconds: 45 }));
  const emptyApi = await listen(empty);
  try {
    const response = await fetch(`${emptyApi.origin}/api/bg/tier-lists/public?list=strategies`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '45');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    await close(emptyApi.server);
    rmSync(folder, { recursive: true, force: true });
  }
  const noBuilds = express();
  noBuilds.use('/api', createBattlegroundBuildsRouter({ loadSource: async () => ({ list: 'strategies', source: 'firestone', tiers: { S: [] } }), fallbackDir: null, onError: () => undefined }));
  const noBuildsApi = await listen(noBuilds);
  try {
    assert.equal((await fetch(`${noBuildsApi.origin}/api/bg/tier-lists/public?list=strategies`)).status, 503, 'an empty list is no 200');
  } finally {
    await close(noBuildsApi.server);
  }
});

test('the guarded /api/bg/tier-lists and /api/bg-comps stay closed to a guest and open to a subscriber', async () => {
  const upstream: string[] = [];
  const requireAccess: RequestHandler = (request, response, next) => {
    if (request.headers['x-test-access'] !== 'subscriber') return response.status(401).json({ error: 'authentication required' });
    return next();
  };
  const app = express();
  app.use('/api', createBattlegroundProxyRouter({
    requireAccess,
    proxyLegacy: (_request, response, path) => { upstream.push(path); response.json({ ok: true }); },
    proxyApp: (request, response, path) => { upstream.push(`${path}?${new URLSearchParams(request.query as Record<string, string>)}`); response.json({ ok: true }); },
    proxyExtraLibrary: () => undefined,
    enrichHeroPayload: payload => payload,
    loadBuildsSource: async list => buildSourcePayload(sourceOf(list)),
    buildsFallbackDir: null,
  }));
  const api = await listen(app);
  try {
    for (const path of ['/api/bg/tier-lists?list=strategies&mmr=TOP_1_PERCENT', '/api/bg/tier-lists?list=strategies&source=hsreplay', '/api/bg-comps']) {
      assert.equal((await fetch(`${api.origin}${path}`)).status, 401, `${path} is closed to a guest`);
      assert.equal((await fetch(`${api.origin}${path}`, { headers: { 'x-test-access': 'subscriber' } })).status, 200, `${path} is open to a subscriber`);
    }
    assert.equal(upstream.length, 3, 'only the subscriber reads reached the service');
    // The open route is mounted next to them and needs no access.
    const open = await fetch(`${api.origin}/api/bg/tier-lists/public?list=compositions`);
    assert.equal(open.status, 200);
    assert.deepEqual(leaks(await open.text()), []);
  } finally {
    await close(api.server);
  }
});
