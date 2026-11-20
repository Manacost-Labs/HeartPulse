import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { createDetailLoader } from '../apps/public-web/lib/detailLoader';

// The detail reads of the deck pages (#309, GPT review of #639): the source is the only fake. A hanging source
// answers nothing until the read is cancelled; an answering one gives the key back.
function source() {
  const calls: string[] = [];
  let mode: 'hang' | 'answer' = 'hang';
  const read = (key: string, signal: AbortSignal) => {
    calls.push(key);
    if (mode === 'answer') return Promise.resolve(`build of ${key}`);
    return new Promise<string>((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('cancelled'))); });
  };
  return { calls, read, answer: () => { mode = 'answer'; } };
}

const LIMITS = { maxActive: 2, maxWaiting: 2, capacity: 3, timeoutMs: 200, freshMs: 60_000, staleMs: 3_600_000 };
const KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

test('more keys than the table holds: one read per key, the queue never grows past its limit', async () => {
  const fake = source();
  const loader = createDetailLoader({ ...LIMITS, read: fake.read });
  for (let round = 0; round < 3; round++) for (const key of KEYS) void loader.load(key);
  await delay(10);
  assert.deepEqual(fake.calls, ['a', 'b'], 'two reads in flight, none repeated');
  assert.deepEqual(loader.stats(), { active: 2, waiting: 2, keys: 4 }, 'two waiting; keys being read are never evicted');
  await delay(300);
  assert.deepEqual(fake.calls, ['a', 'b'], 'a waiting read whose time ran out is dropped, not sent late');
  assert.deepEqual(loader.stats(), { active: 0, waiting: 0, keys: 4 });
});

test('a source that hung frees every slot by the time limit; the first read after it answers gets the value', async () => {
  const fake = source();
  const loader = createDetailLoader({ ...LIMITS, read: fake.read });
  await Promise.all(['a', 'b', 'c', 'd'].map(key => loader.load(key)));
  assert.deepEqual(loader.stats(), { active: 0, waiting: 0, keys: 4 });
  assert.equal(loader.get('d'), null);
  fake.answer();
  const started = Date.now();
  await Promise.all(['a', 'd'].map(key => loader.load(key)));
  assert.ok(Date.now() - started < 100, 'the fresh reads wait for no old one');
  assert.equal(loader.get('a'), 'build of a');
  assert.equal(loader.get('d'), 'build of d');
  await loader.load('a');
  assert.deepEqual(fake.calls, ['a', 'b', 'a', 'd'], 'a fresh value is not read again');
  assert.deepEqual(loader.stats(), { active: 0, waiting: 0, keys: 3 }, 'keys no longer read go over the capacity');
});
