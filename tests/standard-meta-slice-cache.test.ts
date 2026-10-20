import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as flush } from 'node:timers/promises';
import { createMetaSliceCache, loadWithRetiredPatchFallback, warmMetaEntrySlices } from '../server/modules/constructedArchetypes/public.js';

type Slice = { key: string; version: number };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test('a fresh slice is reused and slices stay independent', async () => {
  let reads = 0;
  const cache = createMetaSliceCache<Slice>({ ttlMs: 100, now: () => 0 });
  const read = (key: string) => async () => { reads += 1; return { key, version: reads }; };
  const legend = await cache.load('legend', read('legend'));
  assert.equal(await cache.load('legend', read('legend')), legend);
  assert.equal((await cache.load('diamond', read('diamond'))).key, 'diamond');
  assert.equal(reads, 2);
  assert.deepEqual(cache.stats(), { entries: 2, fresh: 2 });
});

test('concurrent cold readers of one slice share a single source read', async () => {
  let reads = 0;
  const source = deferred<Slice>();
  const cache = createMetaSliceCache<Slice>({ ttlMs: 100 });
  const readers = Array.from({ length: 20 }, () => cache.load('legend', () => { reads += 1; return source.promise; }));
  await flush();
  assert.equal(reads, 1);
  source.resolve({ key: 'legend', version: 1 });
  const values = await Promise.all(readers);
  assert.ok(values.every(value => value === values[0]));
});

test('an expired slice is served at once while one background refresh runs', async () => {
  let time = 0, reads = 0;
  const source = deferred<Slice>();
  const cache = createMetaSliceCache<Slice>({ ttlMs: 100, staleMs: 1_000, now: () => time });
  const read = () => { reads += 1; return reads === 1 ? Promise.resolve({ key: 'legend', version: 1 }) : source.promise; };
  const first = await cache.load('legend', read);
  time = 150;
  assert.equal(await cache.load('legend', read), first, 'the reader must not wait for the upstream source');
  assert.equal(await cache.load('legend', read), first);
  assert.equal(reads, 2);
  source.resolve({ key: 'legend', version: 2 });
  await flush();
  assert.equal((await cache.load('legend', read)).version, 2);
});

test('the refresh receives the last good slice for its continuity check', async () => {
  let time = 0;
  const seen: Array<Slice | null> = [];
  const cache = createMetaSliceCache<Slice>({ ttlMs: 100, now: () => time });
  const read = async (previous: Slice | null) => { seen.push(previous); return { key: 'legend', version: seen.length }; };
  const first = await cache.load('legend', read);
  time = 2_000_000;
  await cache.load('legend', read);
  assert.deepEqual(seen, [null, first]);
});

test('past the stale window a reader waits for the source, then keeps the last good slice on failure', async () => {
  let time = 0, reads = 0;
  const errors: string[] = [];
  const cache = createMetaSliceCache<Slice>({ ttlMs: 100, staleMs: 100, retryMs: 60_000, now: () => time,
    onRefreshError: key => errors.push(key) });
  const first = await cache.load('legend', async () => { reads += 1; return { key: 'legend', version: 1 }; });
  time = 1_000;
  const failing = async () => { reads += 1; throw new Error('upstream down'); };
  assert.equal(await cache.load('legend', failing), first);
  assert.deepEqual(errors, ['legend']);
  time = 2_000;
  assert.equal(await cache.load('legend', failing), first, 'a failed slice is not re-read before its retry time');
  assert.equal(reads, 2);
  time = 62_000;
  const recovered = await cache.load('legend', async () => { reads += 1; return { key: 'legend', version: 3 }; });
  assert.equal(recovered.version, 3);
});

test('a cold slice surfaces the source error and the next reader may retry', async () => {
  const cache = createMetaSliceCache<Slice>({ ttlMs: 100, now: () => 0 });
  await assert.rejects(cache.load('legend', async () => { throw new Error('upstream down'); }), /upstream down/);
  assert.equal((await cache.load('legend', async () => ({ key: 'legend', version: 1 }))).version, 1);
});

test('clearing the cache discards a refresh that was already running', async () => {
  const source = deferred<Slice>();
  const cache = createMetaSliceCache<Slice>({ ttlMs: 100, now: () => 0 });
  const late = cache.load('legend', () => source.promise);
  await flush();
  cache.clear();
  source.resolve({ key: 'legend', version: 1 });
  await assert.rejects(late, /invalidated/);
  assert.deepEqual(cache.stats(), { entries: 0, fresh: 0 });
  assert.equal((await cache.load('legend', async () => ({ key: 'legend', version: 2 }))).version, 2);
});

test('a hung source read ends at its deadline instead of blocking every later reader', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const cache = createMetaSliceCache<Slice>({ ttlMs: 100, timeoutMs: 20_000, now: () => 0 });
  const hung = cache.load('legend', () => new Promise<Slice>(() => undefined));
  await flush();
  t.mock.timers.tick(20_000);
  await assert.rejects(hung, /timed out/);
});

test('warming reads the default period, then the current period it names', async t => {
  const warn = t.mock.method(console, 'warn', () => undefined);
  const loaded: string[] = [];
  await warmMetaEntrySlices(async period => { loaded.push(period); return { currentPeriod: 'patch_36.6.3' }; });
  assert.deepEqual(loaded, ['past_day', 'patch_36.6.3']);
  loaded.length = 0;
  await warmMetaEntrySlices(async period => { loaded.push(period); return { currentPeriod: 'past_day' }; });
  assert.deepEqual(loaded, ['past_day']);
  await warmMetaEntrySlices(async () => { throw new Error('upstream down'); });
  assert.equal(warn.mock.callCount(), 1, 'a failed warm-up is logged, never thrown');
});

test('a link to a patch the source no longer collects opens the current patch', async () => {
  const fallbackCalls: string[] = [];
  const retiredPatch = await loadWithRetiredPatchFallback(async period => {
    fallbackCalls.push(period);
    if (period === 'patch_36.2.0') throw new Error('Upstream HTTP 422');
    return { period, currentPatchPeriod: 'patch_36.6.3' };
  }, 'patch_36.2.0');
  assert.deepEqual(retiredPatch, { period: 'patch_36.6.3', currentPatchPeriod: 'patch_36.6.3' });
  assert.deepEqual(fallbackCalls, ['patch_36.2.0', 'past_day', 'patch_36.6.3']);
  await assert.rejects(
    loadWithRetiredPatchFallback(async () => { throw new Error('Upstream HTTP 503'); }, 'patch_36.2.0'),
    /Upstream HTTP 503/,
  );
  await assert.rejects(
    loadWithRetiredPatchFallback(async () => { throw new Error('Upstream HTTP 422'); }, 'past_day'),
    /Upstream HTTP 422/,
  );
});
