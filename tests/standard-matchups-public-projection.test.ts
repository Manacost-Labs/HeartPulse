import assert from 'node:assert/strict';
import test from 'node:test';
import { loadStandardMatchupsSeed } from '../apps/public-web/lib/publicStandardMatchupsData.ts';
import { loadPublicStandardMatchups, parsePublicStandardMatchups } from '../src/modules/standardMatchups/public.ts';

// What the page and the browser accept as the open general slice: the allowlist is re-applied on the
// reading side, so a paid or unlisted field of an answer never reaches the server HTML, RSC or JSON-LD.

const names = Array.from({ length: 40 }, (_, index) => `Archetype ${index + 1}`);
const answer = (extra: Record<string, unknown> = {}) => ({
  format: 'standard', formatLabel: 'Стандарт', rank: 'all', rankLabel: 'Все ранги', period: 'bans', minGames: 25,
  totalGames: 90_000, source: 'hsguru', sourceUrl: 'https://www.hsguru.com/matchups?format=2&rank=all',
  updatedAt: '2026-11-19T06:00:00.000Z',
  columns: names.map((name, index) => ({ name, label: `Арх ${index + 1}`, classKey: 'mage', popularity: '2.5%', games: 4000 - index * 10 })),
  rows: names.map((name, index) => ({
    archetype: name, archetypeLabel: `Арх ${index + 1}`, classKey: 'mage', winrate: 50 + (index % 5), games: 4000 - index * 10,
    cells: names.map(opponent => ({ opponent, winrate: opponent === name ? 50 : 55.5, games: opponent === 'Archetype 3' ? 0 : 120 })),
    history: 'SENTINEL_HISTORY',
  })),
  ...extra,
});

test('the open slice is read field by field and cut to the most played archetypes', () => {
  const data = parsePublicStandardMatchups(answer({ available: { ranks: ['legend'] }, history: 'SENTINEL_HISTORY' }), 'standard', 30);
  assert.ok(data);
  assert.equal(data.archetypes.length, 30);
  assert.equal(data.truncated, true);
  assert.equal(data.pairs.length, 30);
  assert.ok(data.pairs.every(row => row.length === 30));
  assert.equal(data.archetypes[0].slug, 'archetype-1');
  assert.equal(data.pairs[0][2], null, 'a pair without games is empty');
  assert.deepEqual(data.pairs[0][1], { winrate: 55.5, games: 120 });
  assert.doesNotMatch(JSON.stringify(data), /SENTINEL|available|history/);
  assert.equal(parsePublicStandardMatchups(answer(), 'standard')?.truncated, false);
});

test('an answer that is not the open general slice of the format is refused', () => {
  assert.equal(parsePublicStandardMatchups(answer({ rank: 'legend' }), 'standard'), null, 'a narrow rank is not open');
  assert.equal(parsePublicStandardMatchups(answer(), 'wild'), null, 'the other format');
  assert.equal(parsePublicStandardMatchups(answer({ columns: [], rows: [] }), 'standard'), null);
  assert.equal(parsePublicStandardMatchups(null, 'standard'), null);
  assert.equal(parsePublicStandardMatchups(answer({ updatedAt: 'tomorrow' }), 'standard')?.updatedAt, null);
  assert.equal(loadStandardMatchupsSeed(answer())?.archetypes.length, 30);
});

test('the browser loader asks the open route anonymously and keeps null on any failure', async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const ok = await loadPublicStandardMatchups('wild', {
    request: async (url, init) => { calls.push([String(url), init]); return Response.json(answer({ format: 'wild' })); },
  });
  assert.equal(ok?.format, 'wild');
  assert.equal(calls[0][0], '/api/standard/matchups/public?format=wild');
  assert.equal(calls[0][1]?.credentials, 'omit');
  assert.equal(await loadPublicStandardMatchups('wild', { request: async () => new Response('', { status: 503 }) }), null);
  assert.equal(await loadPublicStandardMatchups('wild', { request: async () => { throw new Error('offline'); } }), null);
});
