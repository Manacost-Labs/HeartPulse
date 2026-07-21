import assert from 'node:assert/strict';
import { invalidateParserDataCaches } from '../server/parserDataCacheInvalidation.js';

const first = new Map([['old', { provisional: true }]]);
const second = new Map([['derived', { value: 1 }]]);
const singleton = { current: { provisional: true } as unknown };
const order: string[] = [];

await invalidateParserDataCaches({
  memoryCaches: [first, second],
  singletonCaches: [singleton],
  invalidateCards: () => { order.push('cards'); },
  invalidateDerived: () => { order.push('derived'); },
  clearRedis: async () => { order.push('redis'); },
});

assert.equal(first.size, 0);
assert.equal(second.size, 0);
assert.equal(singleton.current, null);
assert.deepEqual(order, ['cards', 'derived', 'redis']);

const stale = new Map([['old', { provisional: true }]]);
await assert.rejects(
  invalidateParserDataCaches({
    memoryCaches: [stale],
    singletonCaches: [],
    invalidateCards: () => undefined,
    invalidateDerived: () => undefined,
    clearRedis: async () => { throw new Error('redis clear failed'); },
  }),
  /redis clear failed/,
);
assert.equal(stale.size, 0, 'memory is invalidated even if Redis reports an error');

console.log('parser data cache invalidation tests passed');
