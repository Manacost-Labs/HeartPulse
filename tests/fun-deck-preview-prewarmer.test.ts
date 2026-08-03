import assert from 'node:assert/strict';
import { createFunDeckPreviewPrewarmer } from '../server/funDeckPreviewPrewarmer.js';

let active = 0;
let peak = 0;
const rendered: string[] = [];
const prewarmer = createFunDeckPreviewPrewarmer({
  concurrency: 2,
  delayMs: 0,
  render: async deck => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    rendered.push(deck.deckCode);
    active -= 1;
  },
});

const decks = Array.from({ length: 5 }, (_, index) => ({
  deckCode: `AAEC-prewarm-${index}`,
  title: `Deck ${index}`,
}));
prewarmer.schedule([...decks, decks[0]]);
assert.equal(prewarmer.snapshot().queued, 5);
await prewarmer.whenIdle();
assert.equal(peak, 2);
assert.equal(rendered.length, 5, 'duplicate candidates must be coalesced');
assert.deepEqual(prewarmer.snapshot(), { active: 0, queued: 0, warmed: 5 });

prewarmer.schedule(decks);
await prewarmer.whenIdle();
assert.equal(rendered.length, 5, 'already warmed candidates must stay warm');

console.log('Fun-deck preview prewarmer tests passed');
