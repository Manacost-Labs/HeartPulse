import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminResourceStore } from '../src/modules/adminWorkspace/model/adminResourceStore.js';

function harness() {
  let clock = 1_000;
  const store = createAdminResourceStore(() => clock);
  return { store, advance: (ms: number) => { clock += ms; } };
}

test('concurrent readers of one key share a single request', async () => {
  const { store } = harness();
  let calls = 0;
  const load = async () => { calls += 1; return { rows: 3 }; };
  await Promise.all([store.ensure('/api/admin/users', load, 30_000), store.ensure('/api/admin/users', load, 30_000)]);
  assert.equal(calls, 1);
  assert.deepEqual(store.read('/api/admin/users').data, { rows: 3 });
  assert.equal(store.read('/api/admin/users').fetching, false);
});

test('a fresh answer is reused and a stale one is refreshed while it stays visible', async () => {
  const { store, advance } = harness();
  let version = 0;
  const load = async () => { version += 1; return version; };
  await store.ensure('k', load, 30_000);
  advance(10_000);
  await store.ensure('k', load, 30_000);
  assert.equal(version, 1, 'a 10 s old answer is fresh');

  advance(25_000);
  let seenWhileFetching: unknown;
  const unsubscribe = store.subscribe('k', () => {
    if (store.read('k').fetching) seenWhileFetching = store.read('k').data;
  });
  await store.ensure('k', load, 30_000);
  unsubscribe();
  assert.equal(seenWhileFetching, 1, 'the old answer stays visible during the refresh');
  assert.equal(store.read('k').data, 2);
});

test('a failed refresh keeps the last good data and reports the error', async () => {
  const { store } = harness();
  await store.refresh('k', async () => 'good');
  await store.refresh('k', async () => { throw new Error('boosty-auth timeout'); });
  const snapshot = store.read('k');
  assert.equal(snapshot.data, 'good');
  assert.equal(snapshot.error?.message, 'boosty-auth timeout');
  await store.refresh('k', async () => 'again');
  assert.equal(store.read('k').error, null);
});

test('invalidation refreshes only mounted keys with the prefix and marks the rest stale', async () => {
  const { store } = harness();
  const calls: string[] = [];
  const loader = (key: string) => async () => { calls.push(key); return key; };
  await store.ensure('/api/admin/users?page=1', loader('users-1'), 30_000);
  await store.ensure('/api/admin/users?page=2', loader('users-2'), 30_000);
  await store.ensure('/api/admin/boosty', loader('boosty'), 30_000);
  calls.length = 0;

  const unsubscribe = store.subscribe('/api/admin/users?page=1', () => {});
  store.invalidate('/api/admin/users');
  await new Promise(resolve => setImmediate(resolve));
  unsubscribe();
  assert.deepEqual(calls, ['users-1'], 'only the mounted page asks again');

  await store.ensure('/api/admin/users?page=2', loader('users-2'), 30_000);
  assert.deepEqual(calls, ['users-1', 'users-2'], 'the unmounted page is stale on its next read');
  await store.ensure('/api/admin/boosty', loader('boosty'), 30_000);
  assert.deepEqual(calls, ['users-1', 'users-2'], 'other prefixes stay fresh');
});
