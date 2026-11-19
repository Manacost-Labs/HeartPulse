import assert from 'node:assert/strict';
import { createFunDeckArtPrewarmer, type FunDeckArtCandidate } from '../server/funDeckArtPrewarmer.js';

let clock = 1_000;
const cached = new Set<string>();
const ensured: string[] = [];
const sleeps: number[] = [];
const failing = new Set<string>();
let active = 0;
let peak = 0;
const cards: Record<string, string[]> = {
  'CODE-A': ['CARD_1', 'CARD_2', 'CARD_2', 'TOKEN_1'],
  'CODE-B': ['CARD_2', 'CARD_3'],
};
let resolves = 0;

const prewarmer = createFunDeckArtPrewarmer({
  resolveCardIds: async deck => {
    resolves += 1;
    return cards[deck.deckCode] ?? [];
  },
  isCached: (id, variant) => cached.has(`${variant}:${id}`),
  ensure: async (id, variant) => {
    active += 1;
    peak = Math.max(peak, active);
    await Promise.resolve();
    active -= 1;
    if (failing.has(id)) throw new Error(`HTTP 503 for ${id}`);
    cached.add(`${variant}:${id}`);
    ensured.push(`${variant}:${id}`);
  },
  delayMs: 250,
  warmTtlMs: 3_600_000,
  retryMs: 600_000,
  now: () => clock,
  sleep: async ms => { sleeps.push(ms); },
  onError: () => undefined,
});

const deckA: FunDeckArtCandidate = { deckCode: 'CODE-A', format: 'Standard' };
const deckB: FunDeckArtCandidate = { deckCode: 'CODE-B', format: 'Wild' };

cached.add('row:CARD_1');
failing.add('TOKEN_1');
prewarmer.schedule([deckA, deckB, deckA]);
await prewarmer.whenIdle();
assert.equal(resolves, 2, 'a duplicate candidate is coalesced');
assert.equal(peak, 1, 'one generation at a time');
assert.ok(!ensured.includes('row:CARD_1'), 'a cached image is not requested again');
assert.equal(ensured.filter(item => item.endsWith('CARD_2')).length, 2, 'a card shared by two decks is generated once per variant');
assert.ok(ensured.includes('portrait:CARD_1') && ensured.includes('row:CARD_3'));
assert.ok(sleeps.length > 0 && sleeps.every(ms => ms === 250), 'a pause follows each generated image');

// A warm deck is not queued again; one with a failed card waits for the retry window.
const settled = resolves;
prewarmer.schedule([deckA, deckB]);
await prewarmer.whenIdle();
assert.equal(resolves, settled, 'inside the warm window nothing is queued');

failing.clear();
clock += 600_001;
prewarmer.schedule([deckA, deckB]);
await prewarmer.whenIdle();
assert.equal(resolves, settled + 1, 'only the incomplete deck is tried again');
assert.ok(ensured.includes('row:TOKEN_1') && ensured.includes('portrait:TOKEN_1'));

clock += 3_600_001;
prewarmer.schedule([deckA]);
await prewarmer.whenIdle();
assert.equal(resolves, settled + 2, 'a warm deck is queued again after its TTL');

// The timer loads the published decks and queues them; a failure of the list is only reported.
const timerDecks: FunDeckArtCandidate[] = [{ deckCode: 'CODE-B', format: 'wild' }];
let loads = 0;
const errors: string[] = [];
const timed = createFunDeckArtPrewarmer({
  resolveCardIds: async () => ['TIMER_1'],
  isCached: () => false,
  ensure: async () => undefined,
  loadDecks: async () => {
    loads += 1;
    if (loads === 2) throw new Error('dataset down');
    return timerDecks;
  },
  startDelayMs: 1_000,
  intervalMs: 1_000,
  delayMs: 0,
  sleep: async () => undefined,
  onError: error => errors.push(String(error)),
});
timed.start();
await new Promise(resolve => setTimeout(resolve, 2_600));
timed.stop();
assert.ok(loads >= 2, 'the timer repeats');
assert.deepEqual(errors.slice(0, 1).map(item => /dataset down/.test(item)), [true]);

// The wiring starts the timer only when asked: no timer with `periodic: false`.
process.env.FUN_DECK_PREWARM_ART_START_MS = '1';
process.env.FUN_DECK_PREWARM_ART_INTERVAL_MS = '1000';
const { createFunDeckArtWarming } = await import('../server/app/createFunDeckArtWarming.js');
for (const periodic of [false, true]) {
  let listLoads = 0;
  const wiring = createFunDeckArtWarming({
    deckArt: { cachePath: () => '/nonexistent', ensure: async () => ({ path: '', source: 'fallback' }) } as never,
    deckBuilder: {} as never,
    funDecks: { loadFunDecks: async () => { listLoads += 1; return {}; } },
    periodic,
  });
  await new Promise(resolve => setTimeout(resolve, 300));
  wiring.stop();
  assert.equal(listLoads > 0, periodic, periodic ? 'the periodic warm-up loads the published decks' : 'no timer without periodic');
}

console.log('Fun-deck art prewarmer tests passed');
