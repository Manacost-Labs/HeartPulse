import assert from 'node:assert/strict';
import express from 'express';
import { createStandardMetaRouter, type StandardMetaRouterDependencies } from '../server/standardMetaRoutes.js';
import { projectPublicStandardMeta } from '../server/standardMetaPublicSlice.js';

/**
 * Sentinel for the open meta slice: every paid field of the fixture carries a
 * unique label, and none of them may reach `/api/standard-meta/public`.
 */
const PAID_LABELS = ['77.7701', '77.7702', '-7.7703', 'SENTINEL_DECK_CODE', 'SENTINEL_TREND', 'SENTINEL_NARROW', '66.6066'];
const updatedAt = '2026-07-21T05:05:30.230Z';
const calls: string[] = [];

const rows = (rank: string) => Array.from({ length: 4 }, (_, index) => ({
  id: `m-${index + 1}`, slug: `arch-${index + 1}`, archetype: `Archetype ${index + 1}`, archetypeLabel: `Архетип ${index + 1}`,
  translated: true, classKey: 'mage',
  winrate: rank === 'legend' ? 66.6066 : 52 - index, popularity: 20 - index, games: 1_000 - index * 50,
  turns: 7.7701 * 10, durationMinutes: 77.7702, climbingSpeed: -7.7703,
  deckCode: 'SENTINEL_DECK_CODE', trend: 'SENTINEL_TREND', narrowSlice: 'SENTINEL_NARROW',
}));

const dependencies: StandardMetaRouterDependencies = {
  adminGuard: (_request, response) => { response.status(403).json({}); },
  accessGuard: (request, response, next) => {
    if (request.headers['x-test-access'] !== 'allowed') { response.status(403).json({ error: 'paid' }); return; }
    next();
  },
  loadMeta: async (format, rank, period, coin, minGames) => {
    calls.push(`${format}:${rank}:${period}:${coin}:${minGames}`);
    return {
      publicationMode: 'stable', publishedAt: updatedAt, format, formatLabel: format === 'standard' ? 'Стандарт' : 'Вольный',
      rank, rankLabel: rank, period,
      availablePeriods: ['past_day', 'patch_36.0.3'], currentPatchPeriod: 'patch_36.0.3', coin, minGames,
      source: 'hsguru', sourceId: 'sentinel', sourceUrl: 'https://example.test/meta', translationSource: 'database',
      updatedAt, items: rows(rank),
    };
  },
  loadViciousGold: async () => ({}),
  loadViciousGoldBuilds: async () => ({}),
  findRecommendation: async () => null,
  createPreview: async () => ({ hash: 'abc12345', state: 'queued', ready: false, imageUrl: null, error: null }),
  getPreview: async hash => ({ hash, state: 'done', ready: true, imageUrl: null, error: null }),
  setPrivateNoStore: response => { response.set('Cache-Control', 'no-store'); },
};

export function assertNoPaidLabels(body: string): void {
  for (const label of PAID_LABELS) assert.ok(!body.includes(label), `paid label ${label} reached a guest`);
}

const app = express();
app.use('/api', createStandardMetaRouter(dependencies));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}/api`;

try {
  for (const format of ['standard', 'wild']) {
    calls.length = 0;
    // Narrow filters in the query are not read: the server picks the general slice itself.
    const response = await fetch(`${origin}/standard-meta/public?format=${format}&rank=legend&coin=on_coin&min_games=5000&period=patch_36.0.3`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /^public, max-age=300/);
    const text = await response.text();
    assertNoPaidLabels(text);
    const body = JSON.parse(text);
    assert.equal(body.format, format);
    assert.equal(body.rank, 'diamond_legend');
    assert.equal(body.coin, 'any_player');
    assert.equal(body.minGames, 100);
    assert.equal(body.items.length, 4, 'every row of the general slice is open');
    assert.deepEqual(Object.keys(body.items[0]).sort(), [
      'archetype', 'archetypeLabel', 'classKey', 'climbingSpeed', 'durationMinutes', 'games', 'id', 'popularity',
      'slug', 'translated', 'turns', 'winrate',
    ]);
    assert.equal(body.items[0].winrate, 52);
    assert.ok(body.items.every((item: any) => item.turns === null && item.durationMinutes === null && item.climbingSpeed === null));
    assert.deepEqual(body.availablePeriods, [body.period], 'other periods are not listed');
    assert.ok(calls.length > 0 && calls.every(call => call.startsWith(`${format}:diamond_legend:`) && call.endsWith(':any_player:100')),
      `only the general slice is read, got ${calls.join(', ')}`);
  }
  assert.equal((await fetch(`${origin}/standard-meta/public?format=arena`)).status, 400);
  // Paid routes stay behind the guard.
  for (const path of ['/standard-meta?rank=legend', '/standard-meta/trends?rank=legend', '/standard-meta/recommendation?archetype=a&format=standard&rank=legend']) {
    const denied = await fetch(`${origin}${path}`);
    assert.ok([401, 403].includes(denied.status), `${path} answers a guest with ${denied.status}`);
    assertNoPaidLabels(await denied.text());
  }
  // The teaser is unchanged: three rows.
  assert.equal(((await (await fetch(`${origin}/standard-meta/teaser?format=standard`)).json()) as any).items.length, 3);

  // Mutation: a projection that spreads the row leaks the labels, and the sentinel turns red.
  const envelope = await (await fetch(`${origin}/standard-meta`, { headers: { 'X-Test-Access': 'allowed' } })).json() as any;
  const leaky = { ...projectPublicStandardMeta(envelope, null), items: envelope.items };
  assert.throws(() => assertNoPaidLabels(JSON.stringify(leaky)), /paid label/, 'the sentinel must catch a leaking projection');
} finally {
  server.close();
}
