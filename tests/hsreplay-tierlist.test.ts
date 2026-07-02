import assert from 'node:assert/strict';
import { tierFromArenasmithScore } from '../server/hsreplayArenasmith.js';

type TierCard = {
  cardId: string;
  name: string;
  score: number | null;
  tier?: string;
  deckWinrate?: number | null;
  arenaScore?: number | null;
};

type TierlistResponse = {
  sections: Array<{
    id: string;
    tiers: Array<{
      tier: string;
      cards: TierCard[];
    }>;
  }>;
};

function assertThresholds() {
  assert.equal(tierFromArenasmithScore(53), 'S');
  assert.equal(tierFromArenasmithScore(52.99), 'A');
  assert.equal(tierFromArenasmithScore(45), 'A');
  assert.equal(tierFromArenasmithScore(44.99), 'B');
  assert.equal(tierFromArenasmithScore(35), 'B');
  assert.equal(tierFromArenasmithScore(34.99), 'C');
  assert.equal(tierFromArenasmithScore(24), 'C');
  assert.equal(tierFromArenasmithScore(23.99), 'D');
  assert.equal(tierFromArenasmithScore(10), 'D');
  assert.equal(tierFromArenasmithScore(9.99), 'E');
  assert.equal(tierFromArenasmithScore(null), null);
  assert.equal(tierFromArenasmithScore(Number.NaN), null);
}

function flattenCards(data: TierlistResponse) {
  const cards = new Map<string, TierCard & { tier: string; sectionId: string }>();
  const tierCounts = new Map<string, Set<string>>();

  for (const section of data.sections) {
    for (const tierGroup of section.tiers) {
      if (!tierCounts.has(tierGroup.tier)) tierCounts.set(tierGroup.tier, new Set());
      for (const card of tierGroup.cards) {
        tierCounts.get(tierGroup.tier)!.add(card.cardId);
        cards.set(card.cardId, { ...card, tier: tierGroup.tier, sectionId: section.id });
      }
    }
  }

  return { cards, tierCounts };
}

async function assertHsReplayHandler() {
  const baseUrl = process.env.TIERLIST_TEST_BASE_URL ?? 'http://127.0.0.1:3101';
  const res = await fetch(`${baseUrl}/api/tierlist?source=hsreplay&v=test&t=${Date.now()}`, {
    cache: 'no-store',
  });
  assert.equal(res.status, 200, `Expected 200 from ${baseUrl}, got ${res.status}`);
  const data = await res.json() as TierlistResponse;
  const { cards, tierCounts } = flattenCards(data);

  assert.ok(cards.size >= 1080, `expected around 1088 cards, got ${cards.size}`);
  assert.equal(tierCounts.get('S')?.size, 20, 'HSReplay S-tier should be Arenasmith S-tier');

  const expected: Array<{ cardId: string; tier: string; score?: number }> = [
    { cardId: 'CATA_153', score: 54, tier: 'S' },
    { cardId: 'CATA_154', score: 53, tier: 'S' },
    { cardId: 'GIL_598', score: 52, tier: 'A' },
    { cardId: 'RLK_650', score: 44, tier: 'B' },
    { cardId: 'GDB_302', score: 6.4, tier: 'E' },
    { cardId: 'CATA_156', tier: 'S' },
    { cardId: 'CATA_785', tier: 'S' },
    { cardId: 'CATA_561', tier: 'S' },
    { cardId: 'CATA_488', tier: 'A' },
  ];

  for (const { cardId, score, tier } of expected) {
    const card = cards.get(cardId);
    assert.ok(card, `missing ${cardId}`);
    assert.equal(card.score, card.arenaScore, `${cardId} score should be Arenasmith score`);
    if (typeof score === 'number') {
      assert.equal(card.score, score, `${cardId} score should match expected Arenasmith score`);
      assert.equal(card.arenaScore, score, `${cardId} arenaScore should match expected Arenasmith score`);
    }
    assert.equal(card.tier, tier, `${cardId} tier should come from Arenasmith`);
    assert.notEqual(card.score, Math.round((card.deckWinrate ?? 0) * 10), `${cardId} score must not be deck_winrate * 10`);
  }
}

assertThresholds();
await assertHsReplayHandler();
console.log('hsreplay tierlist tests passed');
