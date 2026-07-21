import assert from 'node:assert/strict';
import { createLatestRequestCoordinator } from '../src/features/ContestAdminTranslations.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => { resolve = next; });
  return { promise, resolve };
}

const coordinator = createLatestRequestCoordinator();
const stalePayload = deferred<string>();
const latestPayload = deferred<string>();
const applied: string[] = [];

const staleRequest = coordinator.begin();
const applyStale = stalePayload.promise.then(payload => {
  if (staleRequest.isCurrent()) applied.push(payload);
  staleRequest.release();
});

const latestRequest = coordinator.begin();
assert.equal(staleRequest.signal.aborted, true, 'a new table load must abort the previous fetch');
const applyLatest = latestPayload.promise.then(payload => {
  if (latestRequest.isCurrent()) applied.push(payload);
  latestRequest.release();
});

latestPayload.resolve('filtered-query');
await applyLatest;
stalePayload.resolve('stale-save-refresh');
await applyStale;
assert.deepEqual(applied, ['filtered-query'], 'a late save refresh must not replace filtered query results');

const canceledRequest = coordinator.begin();
coordinator.cancel();
assert.equal(canceledRequest.signal.aborted, true, 'effect cleanup must abort the active request');
assert.equal(canceledRequest.isCurrent(), false, 'an aborted request must never remain current');

console.log('admin translation latest-request-wins tests passed');
