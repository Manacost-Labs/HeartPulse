import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import test from 'node:test';
import express, { type RequestHandler } from 'express';
import { createWinrateRouter, projectWinratesPublicTeaser, type WinrateRouterDependencies } from '../server/winrateRoutes';
import { seoStructuredDataGraph } from '../src/seo/structuredData';
import { parsePublicClassesTeaser, type PublicClassesTeaser } from '../apps/public-web/lib/publicClassesTeaserData';
import { buildClassesFixture, closedValues, OPEN_ROWS, UPDATED_AT } from './helpers/classesTeaserFixture';

// The open slice of /classes/: what a guest and a robot may read, and the
// sentinel check that nothing closed leaves with it. The fixture gives every
// closed figure (winrates with more than one decimal, wins, pick rates and the
// breakdowns by card, period and history) a value of its own; the checks look
// for those values in the projection and in the page's JSON-LD. Putting the
// unrounded winrate or a breakdown field into the projection makes them fail.

const CLOSED = closedValues();
const leaks = (text: string) => CLOSED.filter(value => text.includes(value));

test('the sentinel list is not vacuous: it holds long winrates and breakdown values', () => {
  assert.ok(CLOSED.includes('57.34821'), 'the best class\'s exact winrate');
  assert.ok(CLOSED.includes('sentinel-period-mage') && CLOSED.includes('SENTINEL_CARD_mage'));
  assert.ok(CLOSED.length > 80, `${CLOSED.length} closed values`);
  assert.deepEqual(leaks(JSON.stringify(buildClassesFixture())).length > 80, true, 'the raw dataset leaks them all');
});

test('the projection is the order of the classes with winrate to 0.1, sample, date, unit and source', () => {
  const teaser = projectWinratesPublicTeaser(buildClassesFixture())!;
  assert.deepEqual(teaser.classes, OPEN_ROWS, 'best first, whatever the stored order is');
  assert.deepEqual(Object.keys(teaser.classes[0]).sort(), ['color', 'id', 'name', 'place', 'sample', 'winrate']);
  assert.deepEqual(Object.keys(teaser).sort(), ['classes', 'sampleUnit', 'source', 'updatedAt']);
  assert.equal(teaser.sampleUnit, 'drafts', 'HSReplay counts drafts (num_drafts), not games');
  assert.equal(teaser.updatedAt, UPDATED_AT);
  assert.equal(teaser.source, 'HSReplay');
  assert.equal(teaser.classes[0].winrate, 57.3, 'rounded to 0.1, not the exact 57.34821');
  assert.deepEqual(leaks(JSON.stringify(teaser)), [], 'no exact winrate, wins, pick rate, breakdown or history');
});

test('a missing date or sample is null, a synthetic or empty dataset is no projection, a bad row is skipped', () => {
  assert.equal(projectWinratesPublicTeaser(null), null);
  assert.equal(projectWinratesPublicTeaser({ classes: [] }), null);
  assert.equal(projectWinratesPublicTeaser({ ...buildClassesFixture(), source: 'initial' }), null);
  const dataset = buildClassesFixture();
  const stripped = { ...dataset, updatedAt: 'вчера', source: 'firestoneapp.com', classes: [
    ...dataset.classes.map(({ games: _games, ...rest }) => rest),
    { id: 'broken', name: 'Сломанный', winrate: 'много' }, { id: 'over', name: 'Сверх', winrate: 101 },
  ] };
  const teaser = projectWinratesPublicTeaser(stripped)!;
  assert.equal(teaser.updatedAt, null);
  assert.equal(teaser.source, 'Firestone');
  assert.equal(teaser.sampleUnit, 'games', 'Firestone counts games');
  assert.equal(teaser.classes.length, 11);
  assert.ok(teaser.classes.every(item => item.sample === null));
});

test('the page parser copies only the whitelisted fields, rounds again and caps the list', () => {
  const teaser = projectWinratesPublicTeaser(buildClassesFixture())!;
  const dirty: typeof teaser & Record<string, unknown> = structuredClone(teaser);
  dirty.classes.forEach((item: Record<string, unknown>, index: number) => Object.assign(item, {
    winrate: 57.34821 - index, wins: 4_281_773, pickRate: 13.37041, byPeriod: [{ period: 'sentinel-period' }], place: 99,
  }));
  dirty.classes.push(...dirty.classes, ...dirty.classes);
  dirty.history = [{ date: 'sentinel-history' }];
  const parsed = parsePublicClassesTeaser(dirty) as PublicClassesTeaser;
  assert.equal(parsed.classes.length, 20, 'no more than twenty rows');
  assert.deepEqual(Object.keys(parsed.classes[0]).sort(), ['color', 'id', 'name', 'place', 'sample', 'winrate']);
  assert.equal(parsed.classes[0].winrate, 57.3, 'a winrate with more digits is rounded again');
  assert.deepEqual(parsed.classes.slice(0, 3).map(item => item.place), [1, 2, 3], 'the place is the position, not a field of the answer');
  assert.equal(JSON.stringify(parsed).match(/wins|pickRate|byPeriod|history|sentinel|4281773|13\.37041|57\.34821/), null);
  assert.equal(parsePublicClassesTeaser({ ...teaser, classes: [{ ...teaser.classes[0], sample: 1.5 }] })!.classes[0].sample, null, 'an odd sample figure is dropped');
  assert.equal(parsePublicClassesTeaser(teaser)!.sampleUnit, 'drafts');
  // The colour is a `#rrggbb` fact or nothing: odd values never reach the page's inline style.
  for (const color of ['red', '#12345', '#1234567', 'url(javascript:x)', 'expression(1)', '', 7, null, undefined]) {
    assert.equal(parsePublicClassesTeaser({ ...teaser, classes: [{ ...teaser.classes[0], color }] })!.classes[0].color, null, `parser drops ${String(color)}`);
    const dataset = buildClassesFixture();
    (dataset.classes[0] as Record<string, unknown>).color = color;
    assert.equal(projectWinratesPublicTeaser(dataset)!.classes.find(item => item.id === dataset.classes[0].id)!.color, null,
      `projection drops ${String(color)}`);
  }
  for (const unit of ['minutes', null, 7]) {
    const odd = parsePublicClassesTeaser({ ...teaser, sampleUnit: unit })!;
    assert.equal(odd.sampleUnit, null, `an unknown unit is dropped: ${unit}`);
    assert.ok(odd.classes.every(item => item.sample === null), 'and so is the number without a unit');
  }
  for (const bad of [null, [], 'x', {}, { classes: [] }, { classes: [{ id: 'a', name: 'b', winrate: '57.3' }] }]) {
    assert.equal(parsePublicClassesTeaser(bad), null, JSON.stringify(bad));
  }
});

type Harness = {
  fetches: string[]; origin: string; server: Server;
  state: { fail: boolean; snapshot: boolean };
};

async function startHarness(overrides: Partial<WinrateRouterDependencies> = {}): Promise<Harness> {
  const fetches: string[] = [];
  const state = { fail: false, snapshot: true };
  // Nobody passes this guard: the full dataset stays closed, the open slice must not depend on it.
  const accessGuard: RequestHandler = (_request, response) => { response.status(401).json({ error: 'authentication required' }); };
  const app = express();
  app.use('/api', createWinrateRouter({
    accessGuard,
    cache: new Map(),
    redisKey: source => `winrates:${source}`,
    redisGet: async () => null,
    redisSet: async () => undefined,
    fetchSource: async source => {
      fetches.push(source);
      if (state.fail) throw new Error('origin down');
      return buildClassesFixture();
    },
    loadSnapshot: () => state.snapshot ? { data: { ...buildClassesFixture(), source: undefined }, etag: '"lkg-etag"' } : null,
    memoryTtlMs: 1000,
    redisTtlSeconds: 60,
    onError: () => undefined,
    ...overrides,
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return { fetches, origin: `http://127.0.0.1:${address.port}/api`, server, state };
}

test('GET /api/winrates/public-teaser answers a guest with the projection and nothing closed; the full route stays closed', async () => {
  const harness = await startHarness();
  try {
    assert.equal((await fetch(`${harness.origin}/winrates`)).status, 401, 'the full dataset still needs access');

    const response = await fetch(`${harness.origin}/winrates/public-teaser`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /^public, /, 'one shared copy for everybody, not a private one');
    assert.equal(response.headers.get('vary'), null, 'no cookie or token changes the answer');
    assert.match(response.headers.get('etag') ?? '', /^"teaser-class-winrates-hsreplay-/);
    const text = await response.text();
    assert.deepEqual(leaks(text), [], 'the answer carries no exact winrate, wins, pick rate or breakdown');
    assert.deepEqual(JSON.parse(text).classes, OPEN_ROWS);

    const sameForARobot = await fetch(`${harness.origin}/winrates/public-teaser`, { headers: { 'User-Agent': 'Googlebot/2.1', Cookie: 'session=x' } });
    assert.equal(await sameForARobot.text(), text, 'no branch on the visitor');

    const revalidated = await fetch(`${harness.origin}/winrates/public-teaser`, { headers: { 'If-None-Match': response.headers.get('etag')! } });
    assert.equal(revalidated.status, 304);
  } finally {
    harness.server.close();
  }
});

test('a guest cannot choose the source of the open slice', async () => {
  const harness = await startHarness();
  try {
    await fetch(`${harness.origin}/winrates/public-teaser?source=firestone&t=1&bust=1`);
    assert.deepEqual(harness.fetches, ['hsreplay']);
  } finally {
    harness.server.close();
  }
});

test('when the source fails the slice comes from the snapshot; with none it is a 502, not a crash', async () => {
  const harness = await startHarness();
  try {
    harness.state.fail = true;
    const lkg = await fetch(`${harness.origin}/winrates/public-teaser`);
    assert.equal(lkg.status, 200);
    assert.equal(lkg.headers.get('x-data-cache'), 'fallback');
    assert.equal(lkg.headers.get('etag'), '"teaser-lkg-etag"');
    const text = await lkg.text();
    assert.deepEqual(leaks(text), []);
    assert.equal(JSON.parse(text).source, 'HSReplay', 'a snapshot without a source is still the default source');

    harness.state.snapshot = false;
    const none = await fetch(`${harness.origin}/winrates/public-teaser`);
    assert.equal(none.status, 502);
    assert.deepEqual(await none.json(), { error: 'Class winrates unavailable' });
  } finally {
    harness.server.close();
  }
});

test('the page JSON-LD marks the closed part, carries no license and none of the closed values', async () => {
  const graph = (await seoStructuredDataGraph('/classes/', { dateModified: UPDATED_AT }))!['@graph'];
  const dataset = graph.find(node => node['@type'] === 'Dataset')!;
  assert.equal(dataset.isAccessibleForFree, false);
  assert.deepEqual(dataset.hasPart, { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-classes' });
  assert.equal('license' in dataset, false, 'the site terms are not a license for the data');
  assert.equal(dataset.dateModified, '2026-11-15T17:00:03.639Z');
  assert.deepEqual(leaks(JSON.stringify(graph)), []);
});
