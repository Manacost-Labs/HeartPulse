import assert from 'node:assert/strict';
import { loadPublicLegendaries } from '../src/modules/arenaLegendaries/model/publicClient';
import { mergeLegendaryPaid, parsePublicLegendaries } from '../src/modules/arenaLegendaries/model/publicProjection';
import { SENTINELS, openAnswer, protectedAnswer } from './helpers/legendariesOpenLayerFixture';

// The open layer's parser is an allowlist: a paid figure that arrives anyway
// (a regression in the projection) never reaches the page.
const noisy = parsePublicLegendaries(openAnswer({ noise: true }));
assert.ok(noisy, 'a valid open answer parses');
const { paidMetrics: flags, ...withoutFlags } = noisy;
assert.deepEqual(flags, { offerRate: true, score: true });
const serialized = JSON.stringify(withoutFlags);
for (const sentinel of SENTINELS) assert.ok(!serialized.includes(sentinel), `${sentinel} is not carried`);
for (const key of ['offerRate', 'score', 'arenaScore', 'futureMetric', 'drawnWinrate', 'arenaSmithTier']) {
  assert.ok(!serialized.includes(`"${key}"`), `${key} is not a key of the open layer`);
}
assert.deepEqual(Object.keys(noisy.groups[0]).sort(), ['byClass', 'cards', 'classKey', 'keyCard', 'pickRate', 'totalGames', 'winRate']);
assert.deepEqual(Object.keys(noisy.groups[0].keyCard).sort(), ['cardId', 'classKey', 'cost', 'count', 'imageHa', 'imageRu', 'name', 'rarity', 'type']);
assert.equal(noisy.groups[0].totalGames, 4210);
assert.equal(noisy.groups[0].byClass?.mage.winRate, 60.4);
assert.deepEqual(noisy.paidMetrics, { offerRate: true, score: true });
assert.equal(noisy.sourceId, 'hsreplay');

// Not an open answer, or nothing to show: null, so the page says «temporarily unavailable» and never «0 groups».
assert.equal(parsePublicLegendaries(null), null);
assert.equal(parsePublicLegendaries({ groups: [] }), null);
assert.equal(parsePublicLegendaries({ groups: [{ keyCard: {}, cards: [] }] }), null);
assert.equal(parsePublicLegendaries({ error: 'no snapshot' }), null);
const meta = parsePublicLegendaries({ ...openAnswer(), warning: 'stale', updatedAt: 'not a date', paidMetrics: { offerRate: false, score: true } });
assert.equal(meta?.warning, 'stale');
assert.equal(meta?.updatedAt, null);
assert.deepEqual(meta?.paidMetrics, { offerRate: false, score: true });
assert.equal(parsePublicLegendaries({ ...openAnswer(), warning: 'whatever' })?.warning, undefined);
assert.equal(parsePublicLegendaries({ ...openAnswer(), groups: [{ ...openAnswer().groups[0], keyCard: { ...openAnswer().groups[0].keyCard, imageRu: 'javascript:alert(1)' } }] })?.groups[0].keyCard.imageRu, null,
  'only safe image addresses are kept');

// A subscriber: the paid figures are laid over the open groups by key card; order and winrate stay.
const open = parsePublicLegendaries(openAnswer())!;
const closed = protectedAnswer() as unknown as Parameters<typeof mergeLegendaryPaid>[1];
const merged = mergeLegendaryPaid(open, closed);
assert.deepEqual(merged.groups.map(group => group.keyCard.cardId), open.groups.map(group => group.keyCard.cardId));
assert.equal(merged.groups[0].offerRate, 91.234);
assert.equal(merged.groups[0].score, 87.654);
assert.equal(merged.groups[0].byClass?.mage.offerRate, 66.666);
assert.equal(merged.groups[0].byClass?.mage.winRate, 60.4, 'the open winrate wins');
assert.equal(merged.groups[0].winRate, 61.4);
assert.equal(mergeLegendaryPaid(open, null), open, 'without protected data nothing changes');
assert.equal(open.groups[0].offerRate, undefined, 'the open data is not mutated');
const partial = mergeLegendaryPaid(open, { ...closed!, groups: closed!.groups.slice(0, 1) });
assert.equal(partial.groups[1].offerRate, undefined, 'a group the protected answer lacks stays open-only');

// The browser read: the open path, no credentials, null on any failure.
const calls: Array<{ url: string; init?: RequestInit }> = [];
const answer = (body: unknown, status = 200) => async (url: RequestInfo | URL, init?: RequestInit) => {
  calls.push({ url: String(url), init });
  return Response.json(body, { status });
};
assert.equal((await loadPublicLegendaries('firestone', { request: answer(openAnswer({ sourceId: 'firestone' })) }))?.sourceId, 'firestone');
assert.equal(calls[0].url, '/api/legendaries/public?source=firestone');
assert.equal(calls[0].init?.credentials, 'omit', 'the open read carries no cookies');
assert.equal(await loadPublicLegendaries('hsreplay', { request: answer({ error: 'x' }, 503) }), null);
assert.equal(await loadPublicLegendaries('hsreplay', { request: async () => { throw new Error('offline'); } }), null);
assert.equal(await loadPublicLegendaries('hsreplay', { request: answer({ groups: [] }) }), null, 'an empty answer is a failure');
console.log('Arena legendary open layer: allowlist, merge and browser read passed');
