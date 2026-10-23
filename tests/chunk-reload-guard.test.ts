import assert from 'node:assert/strict';
import { CHUNK_RELOAD_COOLDOWN_MS, claimChunkReload } from '../src/components/chunkReloadGuard.js';

const memory = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

const store = memory();
assert.equal(claimChunkReload(store, 1_000_000), true, 'the first chunk failure reloads the page');
assert.equal(claimChunkReload(store, 1_000_000 + 5_000), false, 'a second failure right after shows the error page instead of looping');
assert.equal(claimChunkReload(store, 1_000_000 + CHUNK_RELOAD_COOLDOWN_MS), true, 'after the cooldown a new failure may reload again');
assert.equal(claimChunkReload(null, 1_000_000), false, 'without storage the page never reloads by itself');
const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => {} };
assert.equal(claimChunkReload(broken, 1_000_000), false, 'blocked storage never reloads either');
console.log('chunk reload guard: ok');
