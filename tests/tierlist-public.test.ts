import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import test from 'node:test';
import express, { type RequestHandler } from 'express';
import { createTierlistRouter } from '../server/tierlistRoutes';
import { projectTierlistPublic, sampleGamesLowerBound } from '../server/tierlistPublicProjection';
import { seoStructuredDataGraph } from '../src/seo/structuredData';
import { parsePublicTierlist } from '../apps/public-web/lib/publicTierlistData';
import {
  buildFixtureCards, buildTierlistFixture, closedValues, guestPercent, CLASS_IDS, MAX_GAMES_AT_LEAST, PAID_KEYS, UPDATED_AT,
} from './helpers/tierlistPublicFixture';

// The open layer of /tierlist/: the whole card pool with tier, base winrate
// (0.1) and pick rate for guests and robots. Every paid figure has a value of
// its own in the fixture (the issue's sentinels `mulliganWinrate: 58.765`,
// `arenaSmithRank: 4242`, plus an exact `winrate: 55.5555` a guest reads as
// 55,6); the checks look for them, and for the paid key names, in the
// projection, the route answer and the page's JSON-LD. A projection that
// spreads a source row makes them fail (see the mutation test).

const CLOSED = closedValues();
const leaks = (text: string) => CLOSED.filter(value => text.includes(value));
const paidKeys = (text: string) => PAID_KEYS.filter(key => text.includes(`"${key}"`));
const FIRST = 'FX_death-knight-0';

test('the projection is the whole pool by class with tier, winrate to 0.1 and pick rate, nothing paid', () => {
  const body = projectTierlistPublic(buildTierlistFixture(), 'hsreplay')!;
  assert.deepEqual(body.classes.map(entry => entry.id), [...CLASS_IDS, 'any'], 'all classes, neutral cards included');
  const total = body.classes.reduce((sum, entry) => sum + entry.cards.length, 0);
  assert.equal(total, buildFixtureCards().length, 'every card of the pool, including the one without a tier');
  assert.equal(body.updatedAt, UPDATED_AT);
  assert.equal(body.source, 'HSReplay');
  assert.equal(body.sourceId, 'hsreplay');
  assert.equal(body.sampleGamesAtLeast, MAX_GAMES_AT_LEAST, 'a lower bound of two digits, not the exact largest game count');
  const first = body.classes.flatMap(entry => entry.cards).find(item => item.cardId === FIRST)!;
  assert.deepEqual(first, {
    cardId: FIRST, name: 'Карта death-knight-0', classKey: 'death-knight', className: 'Класс death-knight', tier: 'A',
    cost: 3, rarity: 'rare', type: 'Существо', image: `/api/card-image/${FIRST}/thumb.webp?v=1`, winrate: 55.6, pickRate: 61.2,
  });
  assert.deepEqual(Object.keys(first).sort(), ['cardId', 'classKey', 'className', 'cost', 'image', 'name', 'pickRate', 'rarity', 'tier',
    'type', 'winrate']);
  const json = JSON.stringify(body);
  assert.deepEqual(leaks(json), [], 'no paid figure, no unrounded winrate or pick rate');
  assert.deepEqual(paidKeys(json), [], 'no paid key name');
  assert.doesNotMatch(json, /4242|58\.765|upstream\.example/);
  assert.match(json, /"winrate":55\.6/);
  assert.match(json, /"pickRate":61\.2/);
});

test('no cards, or no dataset, gives no projection; a missing date or sample is null; odd values are dropped', () => {
  assert.equal(projectTierlistPublic(null, 'hsreplay'), null);
  assert.equal(projectTierlistPublic({ sections: [] }, 'firestone'), null);
  const bare = buildTierlistFixture();
  const stripped = { ...bare, updatedAt: 'вчера', sections: bare.sections.map(section => ({
    ...section, tiers: section.tiers.map(group => ({ ...group, cards: group.cards.map(({ totalGames: _games, winrate: _w, deckWinrate: _d, ...rest }: any) => rest) })),
  })) };
  const body = projectTierlistPublic(stripped, 'firestone', 'fallback')!;
  assert.equal(body.updatedAt, null);
  assert.equal(body.sampleGamesAtLeast, null);
  assert.equal(body.warning, 'fallback');
  assert.ok(body.classes.flatMap(entry => entry.cards).every(item => item.winrate === null), 'no winrate in the source: null, never a guess');
});

test('the sample is a lower bound of two significant digits, never an exact count', () => {
  assert.equal(sampleGamesLowerBound(987_654), 980_000);
  assert.equal(sampleGamesLowerBound(12_345), 12_000);
  assert.equal(sampleGamesLowerBound(1000), 1000);
  assert.equal(sampleGamesLowerBound(999), null, 'a small count would be an exact figure');
  assert.equal(sampleGamesLowerBound(Number.NaN), null);
});

test('mutation: a projection that spreads the source row is caught by the sentinel check', () => {
  const leaky = JSON.stringify({ classes: buildTierlistFixture().sections.map(section => ({
    id: section.id, cards: section.tiers.flatMap(group => group.cards.map(row => ({ ...row }))),
  })) });
  assert.ok(leaks(leaky).length > 0, 'the paid values are found');
  assert.ok(leaky.includes('58.765') && leaky.includes('4242') && leaky.includes('55.5555'), 'the issue sentinels are found');
  assert.ok(paidKeys(leaky).length > 0, 'the paid key names are found');
});

test('the page parser copies only the open fields, rounds figures and drops exact counts', () => {
  const body = projectTierlistPublic(buildTierlistFixture(), 'hsreplay')!;
  const dirty = JSON.parse(JSON.stringify(body));
  for (const item of dirty.classes.flatMap((entry: any) => entry.cards)) {
    Object.assign(item, { mulliganWinrate: 58.765, arenaSmithRank: 4242, totalGames: 123456789, deckWinrate: 60.1234 });
  }
  dirty.classes[0].cards[0].winrate = 55.5555;
  dirty.totalGames = 5;
  const parsed = parsePublicTierlist(dirty)!;
  assert.deepEqual(Object.keys(parsed.classes[0].cards[0]).sort(), ['cardId', 'cost', 'name', 'pickRate', 'rarity', 'tier', 'type', 'winrate']);
  assert.equal(parsed.classes[0].cards[0].winrate, 55.6);
  assert.equal(JSON.stringify(parsed).match(/mulligan|arenaSmith|totalGames|123456789|4242|58\.765|deckWinrate/i), null);
  const withSample = (value: unknown) => parsePublicTierlist({ ...body, sampleGamesAtLeast: value })!.sampleGamesAtLeast;
  assert.equal(withSample(980_000), 980_000);
  for (const exact of [987_654, 999, 0, -1, '980000x']) assert.equal(withSample(exact), null, `an exact or odd figure is dropped: ${exact}`);
  for (const bad of [null, [], 'x', {}, { classes: [] }, { classes: [{ id: 'a b', name: 'x', cards: [{ cardId: 'a', name: 'b', tier: 'S' }] }] },
    { classes: [{ id: 'mage', name: 'x', cards: [{ cardId: 'a', name: 'b', tier: 'Z' }] }] }]) {
    assert.equal(parsePublicTierlist(bad), null, JSON.stringify(bad));
  }
});

type Harness = { calls: Array<{ source: string; bypass: boolean }>; origin: string; server: Server; state: { fail: boolean; fallback: boolean; now: number } };

async function startHarness(): Promise<Harness> {
  const calls: Harness['calls'] = [];
  const state = { fail: false, fallback: true, now: 1_000_000 };
  // Nobody passes this guard: the paid list stays closed, the open layer must not depend on it.
  const accessGuard: RequestHandler = (_request, response) => { response.status(403).json({ error: 'subscription required' }); };
  const app = express();
  app.use('/api', createTierlistRouter({
    accessGuard,
    cache: new Map(),
    resolveSource: source => ['hsreplay', 'heartharena', 'firestone'].includes(source ?? '') ? source as string : 'hsreplay',
    getData: async (source, _now, bypass) => {
      calls.push({ source, bypass });
      if (state.fail) throw new Error('origin down');
      return { data: { ...buildTierlistFixture(), source: source === 'firestone' ? 'Firestone' : 'HSReplay' }, etag: `"fixture-${source}"`, cacheSource: 'origin' };
    },
    present: data => ({ ...data, classPositions: {} }),
    loadFallback: source => state.fallback && source !== 'firestone' ? { data: buildTierlistFixture(), etag: '"lkg-etag"' } : null,
    now: () => state.now,
    onError: () => undefined,
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return { calls, origin: `http://127.0.0.1:${address.port}/api`, server, state };
}

test('GET /api/tierlist/public answers a guest with the open layer for both sources and nothing paid; /api/tierlist stays closed', async () => {
  const harness = await startHarness();
  try {
    const full = await fetch(`${harness.origin}/tierlist`);
    assert.equal(full.status, 403, 'the paid list still needs access');

    for (const source of ['hsreplay', 'firestone']) {
      const response = await fetch(`${harness.origin}/tierlist/public?source=${source}`);
      assert.equal(response.status, 200, source);
      assert.match(response.headers.get('cache-control') ?? '', /^public, /, 'one shared copy for everybody, not a private one');
      assert.equal(response.headers.get('vary'), null, 'no cookie or token changes the answer');
      const etag = response.headers.get('etag')!;
      assert.match(etag, /^"tierlist-public-[0-9a-f]{24}"$/);
      const text = await response.text();
      assert.deepEqual(leaks(text), [], `${source}: no paid figure`);
      assert.deepEqual(paidKeys(text), [], `${source}: no paid key`);
      const body = JSON.parse(text);
      assert.equal(body.sourceId, source);
      assert.equal(body.classes.flatMap((entry: any) => entry.cards).length, buildFixtureCards().length);
      assert.equal(guestPercent(55.5555), '55,6');

      const sameForARobot = await fetch(`${harness.origin}/tierlist/public?source=${source}`,
        { headers: { 'User-Agent': 'Googlebot/2.1', Cookie: 'session=x' } });
      assert.equal(await sameForARobot.text(), text, 'no branch on the visitor');
      const revalidated = await fetch(`${harness.origin}/tierlist/public?source=${source}`, { headers: { 'If-None-Match': etag } });
      assert.equal(revalidated.status, 304);
    }
    const byDefault = await (await fetch(`${harness.origin}/tierlist/public`)).json();
    assert.equal(byDefault.sourceId, 'hsreplay', 'HSReplay without a source');
  } finally {
    harness.server.close();
  }
});

test('only hsreplay and firestone are open; a guest cannot skip the cache or fan out origin reads', async () => {
  const harness = await startHarness();
  try {
    for (const source of ['heartharena', 'nope', '']) {
      const response = await fetch(`${harness.origin}/tierlist/public?source=${source}`);
      assert.equal(response.status, 400, `source=${source}`);
    }
    assert.deepEqual(harness.calls, [], 'a refused request does not touch the origin');
    await fetch(`${harness.origin}/tierlist/public?source=firestone&t=1&bust=1`);
    await fetch(`${harness.origin}/tierlist/public?source=firestone&t=2&bust=1`);
    assert.deepEqual(harness.calls, [{ source: 'firestone', bypass: false }], 'the projection is cached, the cache is never bypassed');
  } finally {
    harness.server.close();
  }
});

test('when the source fails: the cached projection (stale), then the last known good copy, then 503 with Retry-After', async () => {
  const harness = await startHarness();
  try {
    harness.state.fail = true;
    const lkg = await fetch(`${harness.origin}/tierlist/public`);
    assert.equal(lkg.status, 200);
    assert.equal(lkg.headers.get('x-data-cache'), 'fallback');
    const lkgText = await lkg.text();
    assert.equal(JSON.parse(lkgText).warning, 'fallback');
    assert.deepEqual(leaks(lkgText), []);

    const noFallback = await fetch(`${harness.origin}/tierlist/public?source=firestone`);
    assert.equal(noFallback.status, 503, 'a source with no last known good copy');
    assert.equal(noFallback.headers.get('retry-after'), '60');
    assert.deepEqual(await noFallback.json(), { error: 'Tierlist unavailable' });

    harness.state.fail = false;
    assert.equal((await fetch(`${harness.origin}/tierlist/public?source=firestone`)).status, 200);
    harness.state.now += 400_000;
    harness.state.fail = true;
    harness.state.fallback = false;
    const stale = await fetch(`${harness.origin}/tierlist/public?source=firestone`);
    assert.equal(stale.status, 200, 'the last projection still answers while the origin is down');
    assert.equal((await stale.json()).warning, 'stale');
  } finally {
    harness.server.close();
  }
});

test('the page JSON-LD marks the paid part, carries no license and none of the paid values', async () => {
  const graph = (await seoStructuredDataGraph('/tierlist/', { dateModified: UPDATED_AT }))!['@graph'];
  const dataset = graph.find(node => node['@type'] === 'Dataset')!;
  assert.equal(dataset.isAccessibleForFree, false);
  assert.deepEqual(dataset.hasPart, { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-tierlist' });
  assert.equal('license' in dataset, false, 'the site terms are not a license for the data');
  assert.equal(dataset.dateModified, '2026-11-15T17:00:03.639Z');
  assert.deepEqual(leaks(JSON.stringify(graph)), []);
  assert.deepEqual(paidKeys(JSON.stringify(graph)), []);
});
