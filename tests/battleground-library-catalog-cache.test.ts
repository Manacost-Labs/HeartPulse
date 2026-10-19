import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as flush, setTimeout as delay } from 'node:timers/promises';
import { createBattlegroundLibraryCatalogCache } from '../server/modules/battlegroundLibrary/public.js';

const card = { dbfId: 10, inPool: true };
test('known identities remain available during one bounded catalog refresh; absence waits', async () => {
  let time = 0, reads = 0;
  let source = Promise.resolve([card]);
  const cache = createBattlegroundLibraryCatalogCache({ ttlMs: 100, staleMs: 100, retryMs: 20,
    now: () => time, read: async () => { reads++; return source; } });
  await Promise.all([cache.load('minion'), cache.load('minion')]); assert.equal(reads, 1);
  time = 100;
  let finish!: (value: typeof card[]) => void;
  source = new Promise(resolve => { finish = resolve; });
  assert.deepEqual(await Promise.race([cache.load('minion', { dbfId: 10 }), delay(50).then(() => 'blocked')]), [card]);
  let absentResolved = false;
  const absent = cache.load('minion', { dbfId: 11 }).then(rows => { absentResolved = true; return rows; });
  const archived = cache.load('minion', { dbfId: 10, archive: true });
  await flush(); assert.equal(reads, 2); assert.equal(absentResolved, false);
  finish([{ ...card, inPool: false }, { dbfId: 11, inPool: true }]);
  assert.equal((await absent).length, 2); assert.equal((await archived)[0].inPool, false);
  source = Promise.reject(new Error('source offline')); void source.catch(() => {});
  time = 200;
  assert.equal((await cache.load('minion', { dbfId: 10 }))[0].inPool, false);
  await flush();
  assert.equal((await cache.load('minion', { dbfId: 10 }))[0].dbfId, 10);
  await assert.rejects(cache.load('minion', { dbfId: 12 }), /offline/);
  time = 300;
  await assert.rejects(cache.load('minion', { dbfId: 10 }), /offline/);
});

test('empty or conflicting replacements cannot discard a good catalog and kinds are isolated', async () => {
  let time = 0, values = [card];
  const cache = createBattlegroundLibraryCatalogCache({ ttlMs: 10, staleMs: 10, retryMs: 1,
    now: () => time, read: async () => values });
  await cache.load('minion'); values = []; time = 10;
  assert.deepEqual(await cache.load('minion', { dbfId: 10 }), [card]); await flush();
  await assert.rejects(cache.load('spell'), /Invalid/);
  values = [card, card]; time = 11;
  assert.deepEqual(await cache.load('minion', { dbfId: 10 }), [card]); await flush();
  time = 20;
  await assert.rejects(cache.load('minion', { dbfId: 10 }), /Invalid/);
});
