import assert from 'node:assert/strict';
import { createBattlegroundHeroTierResource, type BattlegroundHeroTierData } from '../src/modules/battlegrounds/public.js';

const data = (name: string): BattlegroundHeroTierData => ({
  sections: [{ tier: 'S', heroes: [{ name, image: '/hero.png' }] }], sourceLabel: name,
});
let clock = 0;
let apiCalls = 0;
let snapshotCalls = 0;
let recovered = false;
const timers = new Map<() => void, number>();
const resource = createBattlegroundHeroTierResource({
  now: () => clock,
  schedule: (callback, delay) => { timers.set(callback, clock + delay); return () => { timers.delete(callback); }; },
  loadLive: async () => { apiCalls++; if (!recovered) throw new Error('offline'); return data('live'); },
  loadSnapshot: async () => { snapshotCalls++; return data('snapshot'); },
});
const mmr = 'TOP_50_PERCENT';
const first = resource.load('solo', mmr);
assert.equal(resource.load('solo', mmr), first, 'concurrent consumers share one request');
assert.equal((await first).source, 'snapshot');
assert.equal(apiCalls, 1);
assert.equal(snapshotCalls, 1);
clock = 29_999;
assert.equal((await resource.load('solo', mmr)).source, 'snapshot');
assert.equal(apiCalls, 1);
clock = 30_000;
assert.equal(resource.peek('solo', mmr), null, 'snapshots expire independently of live data');
recovered = true;
assert.equal((await resource.load('solo', mmr)).source, 'live');
assert.equal(apiCalls, 2);
assert.equal(resource.peek('duos', mmr), null, 'modes have independent cache entries');
const updates: string[] = [];
const failures: unknown[] = [];
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const advance = async (time: number) => {
  clock = time;
  for (const [callback, due] of [...timers]) if (due <= clock) { timers.delete(callback); callback(); }
  await flush();
};
const stop = resource.observe('solo', mmr, { onData: entry => updates.push(entry.source), onError: error => failures.push(error) });
await flush();
assert.deepEqual(updates, ['live']);
assert.equal(timers.size, 1);
recovered = false;
await advance(330_000);
assert.deepEqual(updates, ['live', 'snapshot']);
assert.equal(apiCalls, 3);
recovered = true;
await advance(360_000);
assert.deepEqual(updates, ['live', 'snapshot', 'live'], 'mounted views recover without navigation');
assert.equal(apiCalls, 4);
assert.equal(failures.length, 0);
stop();
assert.equal(timers.size, 0);
await advance(1_000_000);
assert.equal(apiCalls, 4, 'disposed views stop retrying');
recovered = false;
await assert.rejects(resource.load('duos', mmr), /offline/);
assert.equal(snapshotCalls, 2, 'duos must never read the solo fallback');
assert.equal(resource.peek('duos', mmr), null);
recovered = true;
assert.equal((await resource.load('duos', mmr)).source, 'live', 'failed in-flight requests are released');

recovered = false;
const stopFailure = resource.observe('duos', 'TOP_1_PERCENT', {
  onData: entry => updates.push(entry.source), onError: error => failures.push(error),
});
await flush();
assert.equal(failures.length, 1);
const beforeRetry = apiCalls;
await advance(1_029_999);
assert.equal(apiCalls, beforeRetry, 'failures must not start a rapid retry loop');
recovered = true;
await advance(1_030_000);
assert.equal(apiCalls, beforeRetry + 1);
assert.equal(updates.at(-1), 'live');
stopFailure();
assert.equal(timers.size, 0);

let complete: ((value: BattlegroundHeroTierData) => void) | undefined;
const late = createBattlegroundHeroTierResource({
  loadLive: () => new Promise(resolve => { complete = resolve; }), loadSnapshot: async () => data('snapshot'),
});
const lateUpdates: string[] = [];
const cancel = late.observe('solo', mmr, { onData: entry => lateUpdates.push(entry.source), onError: () => assert.fail('unexpected error') });
cancel();
assert.ok(complete);
complete(data('live'));
await flush();
assert.deepEqual(lateUpdates, [], 'an unmounted consumer receives no late callbacks');
console.log('Battlegrounds snapshot expiry, retry, recovery and disposal tests passed');
