import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import test from 'node:test';
import express, { type RequestHandler } from 'express';
import { createTierlistRouter, projectTierlistPublicTeaser } from '../server/tierlistRoutes';
import { seoStructuredDataGraph } from '../src/seo/structuredData';
import { parsePublicTierlistTeaser, type PublicTierlistTeaser } from '../apps/public-web/lib/publicTierlistTeaserData';
import { buildTierlistFixture, closedValues, CLASS_IDS, MAX_GAMES, UPDATED_AT } from './helpers/tierlistTeaserFixture';

// The open slice of /tierlist/: what a guest and a robot may read, and the
// sentinel check that nothing closed leaves with it. The fixture gives every
// winrate, score and per-card game count a value of its own; the checks look
// for those values (and for the names of cards outside the slice) in the
// projection and in the page's JSON-LD. Dropping the whitelist (spreading a
// card row into the projection) makes them fail.

const TOP_IDS = ['mage-s0', 'mage-s1', 'mage-s2', 'any-s0', 'any-s1', 'warlock-s0',
  'death-knight-0', 'demon-hunter-0', 'druid-0', 'hunter-0'].map(id => `FX_${id}`);
const classTop = (classId: string) => classId === 'mage' ? ['mage-s0', 'mage-s1', 'mage-s2']
  : classId === 'warlock' ? ['warlock-s0', 'warlock-0', 'warlock-1'] : [0, 1, 2].map(j => `${classId}-${j}`);
const VISIBLE = new Set([...TOP_IDS, ...CLASS_IDS.flatMap(classTop).map(id => `FX_${id}`)]);
const CLOSED = closedValues(VISIBLE);

const leaks = (text: string) => CLOSED.filter(value => text.includes(value));

test('the projection is the top ten and the top three of each class, with tier, date and sample', () => {
  const teaser = projectTierlistPublicTeaser(buildTierlistFixture())!;
  assert.deepEqual(teaser.top.map(item => item.cardId), TOP_IDS);
  assert.deepEqual(teaser.top.map(item => item.tier), ['S', 'S', 'S', 'S', 'S', 'S', 'A', 'A', 'A', 'A']);
  assert.deepEqual(teaser.classes.map(entry => entry.id), [...CLASS_IDS], 'neutral cards are not a class');
  for (const entry of teaser.classes) {
    assert.deepEqual(entry.cards.map(item => item.cardId), classTop(entry.id).map(id => `FX_${id}`), entry.id);
  }
  assert.equal(teaser.updatedAt, UPDATED_AT);
  assert.equal(teaser.source, 'HSReplay');
  assert.equal(teaser.sampleGames, MAX_GAMES, 'the sample is the largest game count of the dataset');
  assert.deepEqual(Object.keys(teaser.top[0]).sort(), ['cardId', 'classKey', 'className', 'image', 'name', 'tier']);
  assert.equal(teaser.top[0].image, '/api/card-image/FX_mage-s0/thumb.webp?v=1', 'only our own card image address');
  const json = JSON.stringify(teaser);
  assert.deepEqual(leaks(json), [], 'no winrate, score, per-card game count or card outside the slice');
  assert.doesNotMatch(json, /FX_druid-u|upstream\.example/, 'a card without a tier and a foreign image address stay out');
});

test('no cards with a tier, or no dataset, gives no projection; a missing date or sample is null', () => {
  assert.equal(projectTierlistPublicTeaser(null), null);
  assert.equal(projectTierlistPublicTeaser({ sections: [] }), null);
  const onlyUntiered = buildTierlistFixture();
  for (const section of onlyUntiered.sections) section.tiers = section.tiers.filter(group => group.tier === 'U');
  assert.equal(projectTierlistPublicTeaser(onlyUntiered), null);
  const bare = buildTierlistFixture();
  const stripped = { ...bare, updatedAt: 'вчера', sections: bare.sections.map(section => ({
    ...section, tiers: section.tiers.map(group => ({ ...group, cards: group.cards.map(({ totalGames: _games, ...rest }: any) => rest) })),
  })) };
  const teaser = projectTierlistPublicTeaser(stripped)!;
  assert.equal(teaser.updatedAt, null);
  assert.equal(teaser.sampleGames, null);
});

test('the page parser copies only the whitelisted fields and caps the lists', () => {
  const teaser = projectTierlistPublicTeaser(buildTierlistFixture())!;
  const dirty = JSON.parse(JSON.stringify(teaser));
  for (const item of [...dirty.top, ...dirty.classes.flatMap((entry: any) => entry.cards)]) {
    Object.assign(item, { winrate: 61.2345, deckWinrate: 60.1, totalGames: 123456789 });
  }
  dirty.winrate = 59.9;
  dirty.top.push(...dirty.top);
  const parsed = parsePublicTierlistTeaser(dirty) as PublicTierlistTeaser;
  assert.equal(parsed.top.length, 10, 'no more than ten');
  assert.deepEqual(Object.keys(parsed.top[0]).sort(), ['cardId', 'className', 'name', 'tier']);
  assert.equal(JSON.stringify(parsed).match(/winrate|Winrate|totalGames|123456789|61\.2345/i), null);
  for (const bad of [null, [], 'x', {}, { top: [] }, { top: [{ cardId: 'a', name: 'b', className: 'c', tier: 'Z' }] }]) {
    assert.equal(parsePublicTierlistTeaser(bad), null, JSON.stringify(bad));
  }
});

type Harness = { calls: Array<{ source: string; bypass: boolean }>; origin: string; server: Server; state: { fail: boolean; fallback: boolean } };

async function startHarness(): Promise<Harness> {
  const calls: Harness['calls'] = [];
  const state = { fail: false, fallback: true };
  // Nobody passes this guard: the full list stays closed, the open slice must not depend on it.
  const accessGuard: RequestHandler = (_request, response) => { response.status(403).json({ error: 'subscription required' }); };
  const app = express();
  app.use('/api', createTierlistRouter({
    accessGuard,
    cache: new Map(),
    resolveSource: source => ['hsreplay', 'heartharena', 'firestone'].includes(source ?? '') ? source as string : 'hsreplay',
    getData: async (source, _now, bypass) => {
      calls.push({ source, bypass });
      if (state.fail) throw new Error('origin down');
      return { data: buildTierlistFixture(), etag: '"fixture-etag"', cacheSource: 'origin' };
    },
    present: data => ({ ...data, classPositions: {} }),
    loadFallback: () => state.fallback ? { data: buildTierlistFixture(), etag: '"lkg-etag"' } : null,
    onError: () => undefined,
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return { calls, origin: `http://127.0.0.1:${address.port}/api`, server, state };
}

test('GET /api/tierlist/public-teaser answers a guest with the projection and nothing closed', async () => {
  const harness = await startHarness();
  try {
    const full = await fetch(`${harness.origin}/tierlist`);
    assert.equal(full.status, 403, 'the full list still needs access');

    const response = await fetch(`${harness.origin}/tierlist/public-teaser`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /^public, /, 'one shared copy for everybody, not a private one');
    assert.equal(response.headers.get('vary'), null, 'no cookie or token changes the answer');
    assert.equal(response.headers.get('etag'), '"teaser-fixture-etag"');
    const text = await response.text();
    assert.deepEqual(leaks(text), [], 'the answer carries no winrate, score, per-card games or hidden card');
    assert.deepEqual(JSON.parse(text).top.map((item: { cardId: string }) => item.cardId), TOP_IDS);
    assert.equal(JSON.parse(text).sampleGames, MAX_GAMES);

    const sameForARobot = await fetch(`${harness.origin}/tierlist/public-teaser`, { headers: { 'User-Agent': 'Googlebot/2.1', Cookie: 'session=x' } });
    assert.equal(await sameForARobot.text(), text, 'no branch on the visitor');

    const revalidated = await fetch(`${harness.origin}/tierlist/public-teaser`, { headers: { 'If-None-Match': '"teaser-fixture-etag"' } });
    assert.equal(revalidated.status, 304);
  } finally {
    harness.server.close();
  }
});

test('a guest cannot choose the source or skip the cache of the open slice', async () => {
  const harness = await startHarness();
  try {
    await fetch(`${harness.origin}/tierlist/public-teaser?source=firestone&t=1&bust=1`);
    assert.deepEqual(harness.calls, [{ source: 'hsreplay', bypass: false }]);
  } finally {
    harness.server.close();
  }
});

test('when the source fails the slice comes from the last known good copy; with none it is a 502, not a crash', async () => {
  const harness = await startHarness();
  try {
    harness.state.fail = true;
    const lkg = await fetch(`${harness.origin}/tierlist/public-teaser`);
    assert.equal(lkg.status, 200);
    assert.equal(lkg.headers.get('x-data-cache'), 'fallback');
    assert.equal(lkg.headers.get('etag'), '"teaser-lkg-etag"');
    assert.deepEqual(leaks(await lkg.text()), []);

    harness.state.fallback = false;
    const none = await fetch(`${harness.origin}/tierlist/public-teaser`);
    assert.equal(none.status, 502);
    assert.deepEqual(await none.json(), { error: 'Tierlist unavailable' });
  } finally {
    harness.server.close();
  }
});

test('the page JSON-LD marks the closed part, carries no license and none of the closed values', async () => {
  const graph = (await seoStructuredDataGraph('/tierlist/', { dateModified: UPDATED_AT }))!['@graph'];
  const dataset = graph.find(node => node['@type'] === 'Dataset')!;
  assert.equal(dataset.isAccessibleForFree, false);
  assert.deepEqual(dataset.hasPart, { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-tierlist' });
  assert.equal('license' in dataset, false, 'the site terms are not a license for the data');
  assert.equal(dataset.dateModified, '2026-11-15T17:00:03.639Z');
  assert.deepEqual(leaks(JSON.stringify(graph)), []);
});
