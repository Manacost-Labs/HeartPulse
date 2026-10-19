import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as flush } from 'node:timers/promises';
import { assertArchetypeCatalogSource, createArchetypeCatalogCache } from '../server/modules/constructedArchetypes/public.js';

type Snapshot = { format: 'standard' | 'wild'; updatedAt: string | null; version: number };
const snapshot = (format: Snapshot['format'], version = 1): Snapshot => ({
  format, version, updatedAt: `2026-10-19T10:00:0${version}.000Z`,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('fresh catalogs reuse the snapshot and keep formats independent', async () => {
  let reads = 0;
  const cache = createArchetypeCatalogCache({
    ttlMs: 100,
    now: () => 0,
    read: async format => { reads += 1; return snapshot(format); },
  });
  const standard = await cache.load('standard');
  assert.equal(await cache.load('standard'), standard);
  assert.equal((await cache.load('wild')).format, 'wild');
  assert.equal(reads, 2);
});

test('twenty cold readers share one source read', async () => {
  let reads = 0;
  const source = deferred<Snapshot>();
  const cache = createArchetypeCatalogCache({ ttlMs: 100,
    read: () => { reads += 1; return source.promise; } });
  const readers = Array.from({ length: 20 }, () => cache.load('standard'));
  try {
    await flush();
    assert.equal(reads, 1);
  } finally {
    source.resolve(snapshot('standard'));
    const values = await Promise.all(readers);
    assert.ok(values.every(value => value === values[0]));
  }
});

test('an expired snapshot stays usable while one background refresh runs', async () => {
  let time = 0, reads = 0;
  const source = deferred<Snapshot>();
  const cache = createArchetypeCatalogCache({ ttlMs: 100, now: () => time,
    read: async format => { reads += 1; return reads === 1 ? snapshot(format) : source.promise; } });
  const first = await cache.load('standard');
  time = 100;
  let visible: Snapshot | undefined;
  const reader = cache.load('standard').then(value => { visible = value; });
  try {
    await flush();
    assert.equal(visible, first, 'the reader must not wait for the external source');
    assert.equal(await cache.load('standard'), first);
    assert.equal(reads, 2);
  } finally {
    source.resolve(snapshot('standard', 2));
    await reader;
    await flush();
  }
  assert.equal((await cache.load('standard')).version, 2);
});

test('clearing the cache rejects old work and cannot publish a late snapshot', async () => {
  const source = deferred<Snapshot>();
  let reads = 0;
  const cache = createArchetypeCatalogCache({ ttlMs: 100,
    read: async format => { reads += 1; return reads === 1 ? source.promise : snapshot(format, 2); } });
  const old = cache.load('standard');
  const rejected = assert.rejects(old, /invalidated/i);
  await flush();
  cache.clear();
  assert.equal((await cache.load('standard')).version, 2);
  source.resolve(snapshot('standard'));
  await rejected;
  assert.equal((await cache.load('standard')).version, 2);
});

test('failed refreshes back off without extending the last snapshot lifetime', async () => {
  let time = 0, reads = 0, available = true;
  const errors: unknown[] = [];
  const cache = createArchetypeCatalogCache({ ttlMs: 100, staleMs: 100, retryMs: 150, now: () => time,
    onRefreshError: (_format, error) => { errors.push(error); },
    read: async format => { reads += 1; if (!available) throw new Error('source down'); return snapshot(format, reads); } });
  const first = await cache.load('standard');
  available = false;
  time = 100;
  assert.equal(await cache.load('standard'), first);
  await flush();
  time = 199;
  assert.equal(await cache.load('standard'), first);
  assert.equal(reads, 2);
  time = 200;
  await assert.rejects(cache.load('standard'), /source down/);
  assert.equal(reads, 2, 'the error cooldown also protects the source after stale expiry');
  available = true;
  time = 250;
  assert.equal((await cache.load('standard')).version, 3);
  assert.equal(errors.length, 1);
});

test('a cold failure can be retried immediately', async () => {
  let reads = 0;
  const cache = createArchetypeCatalogCache({ ttlMs: 100,
    read: async format => { reads += 1; if (reads === 1) throw new Error('source down'); return snapshot(format); } });
  await assert.rejects(cache.load('standard'), /source down/);
  assert.equal((await cache.load('standard')).version, 1);
  assert.equal(reads, 2);
});

test('a hung source has a hard deadline and a late response cannot overwrite a retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const source = deferred<Snapshot>();
  let reads = 0;
  const cache = createArchetypeCatalogCache({ ttlMs: 100,
    read: async format => { reads += 1; return reads === 1 ? source.promise : snapshot(format, 2); } });
  const failure = assert.rejects(cache.load('standard'), /timed out/);
  await flush();
  t.mock.timers.tick(20_000);
  await failure;
  assert.equal((await cache.load('standard')).version, 2);
  source.resolve(snapshot('standard', 3));
  await flush();
  assert.equal((await cache.load('standard')).version, 2);
});

test('freshness starts when the successful source read finishes', async () => {
  let time = 0, reads = 0;
  const source = deferred<Snapshot>();
  const cache = createArchetypeCatalogCache({ ttlMs: 100, now: () => time,
    read: async () => { reads += 1; return source.promise; } });
  const pending = cache.load('standard');
  await flush();
  time = 1_000;
  source.resolve(snapshot('standard'));
  await pending;
  time = 1_099;
  await cache.load('standard');
  assert.equal(reads, 1);
});

test('a slow format does not block the other format', async () => {
  const standard = deferred<Snapshot>();
  const cache = createArchetypeCatalogCache({ ttlMs: 100,
    read: async format => format === 'standard' ? standard.promise : snapshot(format) });
  const pending = cache.load('standard');
  assert.equal((await cache.load('wild')).format, 'wild');
  standard.resolve(snapshot('standard'));
  await pending;
});

test('an older or undated refresh cannot replace a timestamped snapshot', async () => {
  let time = 0;
  let candidate = snapshot('standard', 2);
  const cache = createArchetypeCatalogCache({ ttlMs: 100, retryMs: 0, now: () => time,
    read: async () => candidate });
  const first = await cache.load('standard');
  time = 100;
  for (const next of [snapshot('standard'), { ...snapshot('standard'), updatedAt: null }]) {
    candidate = next;
    assert.equal(await cache.load('standard'), first);
    await flush();
  }
  candidate = snapshot('standard', 3);
  await cache.load('standard');
  await flush();
  assert.equal((await cache.load('standard')).version, 3);
});

test('a wrong-format result cannot enter the cache', async () => {
  const cache = createArchetypeCatalogCache({ ttlMs: 100, read: async () => snapshot('wild') });
  await assert.rejects(cache.load('standard'), /format mismatch/);
});

test('malformed source payloads are rejected but a valid empty catalog is allowed', () => {
  for (const value of [null, {}, { data: {} }, { data: [null] }, { data: [{ archetype: {} }] },
    { data: [{ archetype: 'Priest', decks: {} }] }, { data: [], meta: [] },
    { data: [], meta: { fetched_at: 'not-a-date' } }]) {
    assert.throws(() => assertArchetypeCatalogSource(value), /Invalid archetype catalog/);
  }
  assert.doesNotThrow(() => assertArchetypeCatalogSource({ data: [] }));
  assert.doesNotThrow(() => assertArchetypeCatalogSource({ data: [{ archetype: 'Thief Priest', decks: null }] }));
});
