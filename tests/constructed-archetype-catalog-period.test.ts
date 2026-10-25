import assert from 'node:assert/strict';
import test from 'node:test';
import { createArchetypeCatalogCache } from '../server/modules/constructedArchetypes/public.js';
import { loadArchetypeCatalogForPeriod, readArchetypeCatalogPeriods } from '../server/constructedArchetypeCatalogPeriod.js';

type Catalog = { format: 'standard' | 'wild'; period: string | null; availablePeriods: string[]; updatedAt: null };
const catalog = (period: string | null, availablePeriods: string[]): Catalog => ({
  format: 'standard', period, availablePeriods, updatedAt: null,
});

function source(served: Record<string, Catalog | Error>, fallback: Catalog) {
  const reads: Array<string | undefined> = [];
  const load = async (_format: 'standard' | 'wild', period?: string) => {
    reads.push(period);
    const answer = period ? served[period] : fallback;
    if (answer instanceof Error) throw answer;
    return answer ?? fallback;
  };
  return { load, reads };
}

test('the archetype pages open on the current Bans window when the source offers it', async () => {
  const bans = catalog('black_empire_ban', ['black_empire_ban', 'black_empire']);
  const { load, reads } = source({ black_empire_ban: bans }, catalog('black_empire', ['black_empire_ban', 'black_empire']));
  assert.equal(await loadArchetypeCatalogForPeriod(load, 'standard'), bans);
  assert.deepEqual(reads, [undefined, 'black_empire_ban']);
});

test('without a Bans window the source default stays and no second read starts', async () => {
  const fallback = catalog('black_empire', ['black_empire']);
  const { load, reads } = source({}, fallback);
  assert.equal(await loadArchetypeCatalogForPeriod(load, 'standard'), fallback);
  assert.deepEqual(reads, [undefined]);
});

test('an explicit period wins, but only one the source lists is requested', async () => {
  const fallback = catalog('black_empire', ['black_empire_ban', 'black_empire', 'patch_36.6.3']);
  const patch = catalog('patch_36.6.3', fallback.availablePeriods);
  const { load, reads } = source({ 'patch_36.6.3': patch }, fallback);
  assert.equal(await loadArchetypeCatalogForPeriod(load, 'standard', 'patch_36.6.3'), patch);
  assert.equal(await loadArchetypeCatalogForPeriod(load, 'standard', 'past_day'), fallback);
  assert.equal(await loadArchetypeCatalogForPeriod(load, 'standard', 'black_empire'), fallback);
  assert.deepEqual(reads, [undefined, 'patch_36.6.3', undefined, undefined]);
});

test('a failed or mismatched period read falls back to the source default', async () => {
  const fallback = catalog('black_empire', ['black_empire_ban', 'black_empire']);
  const failing = source({ black_empire_ban: new Error('Upstream HTTP 422') }, fallback);
  assert.equal(await loadArchetypeCatalogForPeriod(failing.load, 'standard'), fallback);
  // A source that ignores the period answers with its own window.
  const ignoring = source({ black_empire_ban: fallback }, fallback);
  assert.equal(await loadArchetypeCatalogForPeriod(ignoring.load, 'standard'), fallback);
});

test('the catalog criteria name its period and the periods the source can build', () => {
  assert.deepEqual(readArchetypeCatalogPeriods({ period: 'black_empire' }),
    { period: 'black_empire', availablePeriods: ['black_empire'] });
  assert.deepEqual(readArchetypeCatalogPeriods({
    period: 'black_empire_ban', available_periods: ['black_empire_ban', 'black_empire', 'not a period', 7],
  }), { period: 'black_empire_ban', availablePeriods: ['black_empire_ban', 'black_empire'] });
  assert.deepEqual(readArchetypeCatalogPeriods({}), { period: null, availablePeriods: [] });
});

test('the catalog cache keeps one snapshot per format and period', async () => {
  const reads: Array<string | undefined> = [];
  const cache = createArchetypeCatalogCache({
    ttlMs: 100,
    now: () => 0,
    read: async (format, period) => {
      reads.push(period);
      return { format, updatedAt: null, period: period ?? 'black_empire' };
    },
  });
  assert.equal((await cache.load('standard')).period, 'black_empire');
  assert.equal((await cache.load('standard', 'black_empire_ban')).period, 'black_empire_ban');
  assert.equal((await cache.load('standard')).period, 'black_empire');
  assert.equal((await cache.load('standard', 'black_empire_ban')).period, 'black_empire_ban');
  assert.deepEqual(reads, [undefined, 'black_empire_ban']);
});
