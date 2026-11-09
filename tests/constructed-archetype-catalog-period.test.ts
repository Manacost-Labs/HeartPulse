import assert from 'node:assert/strict';
import test from 'node:test';
import { createArchetypeCatalogCache } from '../server/modules/constructedArchetypes/public.js';
import { currentStandardMetaPatchPeriod } from '../shared/standardMetaPeriods.js';
import {
  loadArchetypeCatalogForPeriod, loadArchetypeCatalogForSlug, readArchetypeCatalogPeriods,
} from '../server/constructedArchetypeCatalogPeriod.js';

type Catalog = { format: 'standard' | 'wild'; period: string | null; availablePeriods: string[]; updatedAt: null };
const catalog = (period: string | null, availablePeriods: string[]): Catalog => ({
  format: 'standard', period, availablePeriods, updatedAt: null,
});

function source<T extends Catalog>(served: Record<string, T | Error>, fallback: T) {
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

test('criteria name the catalog period and meta the periods the source can build', () => {
  // hs-data-api before the Bans catalog: no list, only its own window.
  assert.deepEqual(readArchetypeCatalogPeriods({ period: 'black_empire' }, { fetched_at: null }),
    { period: 'black_empire', availablePeriods: ['black_empire'] });
  assert.deepEqual(readArchetypeCatalogPeriods(
    { period: 'black_empire_ban' },
    { available_periods: ['black_empire', 'black_empire_ban', 'not a period', 7], current_period: 'black_empire' },
  ), { period: 'black_empire_ban', availablePeriods: ['black_empire', 'black_empire_ban'] });
  assert.deepEqual(readArchetypeCatalogPeriods({}, undefined), { period: null, availablePeriods: [] });
});

const WINDOWS = ['black_empire', 'black_empire_ban', 'patch_37.0.2'];
type SlugCatalog = Catalog & { items: { slug: string; archetype: string; builds: unknown[]; deckCount: number }[]; currentPatchPeriod?: string };
const withItems = (period: string, slugs: string[], extra: Partial<SlugCatalog> = {}): SlugCatalog => ({
  ...catalog(period, WINDOWS), items: slugs.map(slug => ({ slug, archetype: slug, builds: [], deckCount: 0 })), ...extra,
});

test('the current patch opens by default, falling back to Bans and then the source window', async () => {
  const fallback = withItems('black_empire', ['a']);
  const patch = withItems('patch_37.0.2', ['a']);
  const bans = withItems('black_empire_ban', ['a', 'b']);
  assert.equal(await loadArchetypeCatalogForPeriod(source({ 'patch_37.0.2': patch, black_empire_ban: bans }, fallback).load, 'standard'), patch);
  const failing = source({ 'patch_37.0.2': new Error('HTTP 422'), black_empire_ban: bans }, fallback);
  assert.equal(await loadArchetypeCatalogForPeriod(failing.load, 'standard'), bans);
  assert.deepEqual(failing.reads, [undefined, 'patch_37.0.2', 'black_empire_ban']);
  const ignoring = source({ 'patch_37.0.2': fallback, black_empire_ban: new Error('x') }, fallback);
  assert.equal(await loadArchetypeCatalogForPeriod(ignoring.load, 'standard'), fallback);
  // A source without a patch window keeps the Bans default; an explicit period still wins.
  const noPatch = withItems('black_empire', ['a'], { availablePeriods: ['black_empire', 'black_empire_ban'] });
  assert.equal(await loadArchetypeCatalogForPeriod(source({ black_empire_ban: bans }, noPatch).load, 'standard'), bans);
  assert.equal(await loadArchetypeCatalogForPeriod(source({ 'patch_37.0.2': patch, black_empire_ban: bans }, fallback).load, 'standard', 'black_empire_ban'), bans);
  assert.equal(await loadArchetypeCatalogForPeriod(source({ 'patch_37.0.2': patch }, fallback).load, 'standard', 'black_empire'), fallback);
});

test('the current patch is the source one or the newest listed by version', () => {
  const listed = ['black_empire_ban', 'patch_37.0.9', 'patch_37.0.10', 'patch_36.6.3'];
  assert.equal(currentStandardMetaPatchPeriod(listed, null), 'patch_37.0.10');
  assert.equal(currentStandardMetaPatchPeriod(listed, 'patch_37.0.9'), 'patch_37.0.9');
  assert.equal(currentStandardMetaPatchPeriod(listed, 'patch_38.0.0'), 'patch_37.0.10');
  assert.equal(currentStandardMetaPatchPeriod(['patch_37.1', 'patch_37.0.4'], undefined), 'patch_37.1');
  assert.equal(currentStandardMetaPatchPeriod(['black_empire_ban'], 'patch_37.0.2'), null);
});

test('the source current_patch_period is read, and a newer listed patch does not override it', async () => {
  assert.deepEqual(readArchetypeCatalogPeriods({ period: 'black_empire' },
    { available_periods: ['black_empire', 'patch_37.0.2'], current_patch_period: 'patch_37.0.2' }),
  { period: 'black_empire', availablePeriods: ['black_empire', 'patch_37.0.2'], currentPatchPeriod: 'patch_37.0.2' });
  const fallback = withItems('black_empire', ['a'], { availablePeriods: ['black_empire', 'patch_37.0.3', 'patch_37.0.2'], currentPatchPeriod: 'patch_37.0.2' });
  const patch = withItems('patch_37.0.2', ['a']);
  assert.equal(await loadArchetypeCatalogForPeriod(source({ 'patch_37.0.2': patch }, fallback).load, 'standard'), patch);
});

test('an archetype missing from the patch window is found in Bans, then the source window', async () => {
  const fallback = withItems('black_empire', ['a', 'b', 'c']);
  const patch = withItems('patch_37.0.2', ['a']);
  const bans = withItems('black_empire_ban', ['a', 'b']);
  const { load } = source({ 'patch_37.0.2': patch, black_empire_ban: bans }, fallback);
  assert.equal(await loadArchetypeCatalogForSlug(load, 'standard', 'a'), patch);
  assert.equal(await loadArchetypeCatalogForSlug(load, 'standard', 'b'), bans);
  assert.equal(await loadArchetypeCatalogForSlug(load, 'standard', 'c'), fallback);
  assert.equal(await loadArchetypeCatalogForSlug(load, 'standard', 'zzz'), patch);
  const broken = source({ 'patch_37.0.2': new Error('HTTP 500'), black_empire_ban: bans }, fallback);
  assert.equal(await loadArchetypeCatalogForSlug(broken.load, 'standard', 'b'), bans);
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

test('an archetype without builds in the Bans window borrows the default window builds', async () => {
  type Item = { archetype: string; builds: Array<{ deckCode: string; samplePeriod: string }>; deckCount: number };
  const periods = ['black_empire_ban', 'black_empire'];
  const build = { deckCode: 'AAE', samplePeriod: 'black_empire' };
  const own = { deckCode: 'AAF', samplePeriod: 'black_empire_ban' };
  const fallback = { ...catalog('black_empire', periods), items: [
    { archetype: 'Zoolock', builds: [build], deckCount: 1 },
    { archetype: 'Quest Priest', builds: [build], deckCount: 1 },
  ] as Item[] };
  const bans = { ...catalog('black_empire_ban', periods), items: [
    { archetype: 'Zoolock', builds: [], deckCount: 0 },
    { archetype: 'Quest Priest', builds: [own], deckCount: 1 },
    { archetype: 'Mill Rogue', builds: [], deckCount: 0 },
  ] as Item[] };
  const load = async (_format: 'standard' | 'wild', period?: string) => (period ? bans : fallback);
  const opened = await loadArchetypeCatalogForPeriod(load, 'standard');
  assert.equal(opened.period, 'black_empire_ban');
  assert.deepEqual(opened.items.map(item => [item.archetype, item.builds, item.deckCount]), [
    ['Zoolock', [build], 1],
    ['Quest Priest', [own], 1],
    ['Mill Rogue', [], 0],
  ]);
  // The cached source catalog is not mutated.
  assert.deepEqual(bans.items[0].builds, []);
});
