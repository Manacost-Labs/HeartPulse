import assert from 'node:assert/strict';
import {
  buildArchetypeDeckCode,
  fetchHsGuruArchetypeName,
  resolveArchetypeDeckIdentity,
} from '../server/archetypeDeckIdentity.js';

const payload = {
  snapshot: {
    name: 'HSReplay Elemental Mage',
    player_class: 'MAGE',
  },
  decks: [{
    id: 1,
    total_games: 1_000,
    cards: [
      { dbf_id: 555, count: 2, sideboard: 0 },
      { dbf_id: 662, count: 2, sideboard: 0 },
      { dbf_id: 695, count: 2, sideboard: 0 },
      { dbf_id: 1003, count: 2, sideboard: 0 },
    ],
  }],
};

const deckCode = buildArchetypeDeckCode(payload);
assert.ok(deckCode.length > 20);

const localIdentity = await resolveArchetypeDeckIdentity({
  payload,
  candidates: [{ nameEn: 'Burn Mage', deckCode }],
  translate: async name => name === 'Burn Mage' ? 'Берн Маг' : name,
  lookupHsGuru: async () => null,
});
assert.deepEqual(localIdentity, {
  sourceNameEn: 'HSReplay Elemental Mage',
  canonicalNameEn: 'Burn Mage',
  canonicalNameRu: 'Берн Маг',
  identitySource: 'local-deck-match',
  identityConfidence: 1,
});

const hsguruIdentity = await resolveArchetypeDeckIdentity({
  payload,
  candidates: [],
  translate: async name => name === 'Spell Mage' ? 'Спелл Маг' : name,
  lookupHsGuru: async receivedCode => {
    assert.equal(receivedCode, deckCode);
    return 'Spell Mage';
  },
});
assert.equal(hsguruIdentity.canonicalNameEn, 'Spell Mage');
assert.equal(hsguruIdentity.canonicalNameRu, 'Спелл Маг');
assert.equal(hsguruIdentity.identitySource, 'hsguru');
assert.equal(hsguruIdentity.identityConfidence, 1);

const fallbackIdentity = await resolveArchetypeDeckIdentity({
  payload: { snapshot: payload.snapshot, decks: [] },
  candidates: [],
  translate: async name => name,
  lookupHsGuru: async () => {
    throw new Error('lookup must not run without a deck');
  },
});
assert.equal(fallbackIdentity.canonicalNameEn, 'HSReplay Elemental Mage');
assert.equal(fallbackIdentity.identitySource, 'hsreplay');
assert.equal(fallbackIdentity.identityConfidence, 0);

// The HSGuru lookup cache is bounded: the oldest code is evicted and asked again.
const originalFetch = globalThis.fetch;
let hsGuruRequests = 0;
globalThis.fetch = (async () => {
  hsGuruRequests += 1;
  return new Response(JSON.stringify({ archetype: 'Cached Mage' }), { status: 200 });
}) as typeof fetch;
try {
  assert.equal(await fetchHsGuruArchetypeName('cache-code-0'), 'Cached Mage');
  assert.equal(await fetchHsGuruArchetypeName('cache-code-0'), 'Cached Mage');
  assert.equal(hsGuruRequests, 1);
  for (let index = 1; index <= 2_000; index += 1) await fetchHsGuruArchetypeName(`cache-code-${index}`);
  assert.equal(hsGuruRequests, 2_001);
  await fetchHsGuruArchetypeName('cache-code-2000');
  assert.equal(hsGuruRequests, 2_001);
  await fetchHsGuruArchetypeName('cache-code-0');
  assert.equal(hsGuruRequests, 2_002);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('archetype deck identity tests passed');
