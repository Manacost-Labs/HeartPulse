import assert from 'node:assert/strict';
import { encode } from '@firestone-hs/deckstrings';
import express from 'express';
import { buildYearReview, createYearReviewRouter, yearReviewOpen, type PlayerGame } from '../server/modules/playerGames/public.js';

const at = (date: string) => Date.parse(date);
const deckA = encode({ cards: [[1, 2], [2, 2], [3, 1]], heroes: [637], format: 2 });
const deckB = encode({ cards: [[1, 2], [4, 2]], heroes: [7], format: 2 });
const constructed = (date: string, result: 'win' | 'loss', deckCode: string, playerClass: 'MAGE' | 'WARRIOR'): PlayerGame => ({
  id: `c-${date}`, startedAt: at(date), durationSeconds: 600, result, turns: 9, mode: 'standard',
  constructed: { ranked: true, playerClass, opponentClass: 'PRIEST', heroCardId: null, opponentHeroCardId: null, deckCode, deckName: null,
    archetype: playerClass === 'MAGE' ? 'Маг на секретах' : null, opponentArchetype: null, wentFirst: true,
    rankBefore: null, rankAfter: { starLevel: 45, stars: 1, legendRank: null } },
});
const bg = (date: string, placement: number, hero: string, ratingAfter: number): PlayerGame => ({
  id: `b-${date}`, startedAt: at(date), durationSeconds: 1200, result: placement <= 4 ? 'win' : 'loss', turns: 12, mode: 'battlegrounds',
  battlegrounds: { heroCardId: hero, placement, duos: false, ratingBefore: ratingAfter - 50, ratingAfter, anomalyCardId: null, races: [],
    tavernTier: 5, finalBoard: [], combats: [], heroOptions: [], offers: [] },
});

const games: PlayerGame[] = [
  constructed('2025-12-31T23:00:00Z', 'win', deckA, 'MAGE'), // last year: not counted
  constructed('2026-03-01T10:00:00Z', 'win', deckA, 'MAGE'),
  constructed('2026-03-02T10:00:00Z', 'win', deckA, 'MAGE'),
  constructed('2026-03-03T10:00:00Z', 'loss', deckB, 'WARRIOR'),
  bg('2026-11-01T10:00:00Z', 1, 'TB_BaconShop_HERO_41', 6600),
  bg('2026-11-02T10:00:00Z', 3, 'TB_BaconShop_HERO_41', 6650),
  bg('2026-11-03T10:00:00Z', 7, 'TB_BaconShop_HERO_02', 6500),
];

const review = buildYearReview(games, 2026);
assert.equal(review.games, 6);
assert.equal(review.hours, 1.5);
assert.deepEqual(review.modes, { battlegrounds: 3, standard: 3, wild: 0, arena: 0 });
assert.equal(review.wins, 2);
assert.equal(review.winRate, 0.667);
assert.equal(review.bestStreak, 2, 'two ladder wins, a loss, then two top-4 finishes');
assert.deepEqual(review.bestMonth, { month: 3, games: 3 });
assert.deepEqual(review.favouriteClass, { playerClass: 'MAGE', games: 2 });
assert.equal(review.favouriteDeck?.deckCode, deckA);
assert.equal(review.favouriteDeck?.games, 2);
assert.equal(review.topCards[0].dbfId, 1, 'card 1 is in both decks');
assert.equal(review.topCards[0].games, 3);
assert.equal(review.battlegrounds.favouriteHero?.cardId, 'TB_BaconShop_HERO_41');
assert.equal(review.battlegrounds.top4Rate, 0.667);
assert.equal(review.battlegrounds.averagePlacement, 3.67);
assert.equal(review.battlegrounds.bestRating, 6650);
assert.equal(buildYearReview([], 2026).favouriteClass, null);

// Opening: from December 1 (UTC), a flag forces it either way, a future year never opens.
assert.equal(yearReviewOpen(2026, at('2026-11-30T23:59:59Z'), undefined), false);
assert.equal(yearReviewOpen(2026, at('2026-12-01T00:00:00Z'), undefined), true);
assert.equal(yearReviewOpen(2026, at('2026-11-06T00:00:00Z'), '1'), true);
assert.equal(yearReviewOpen(2026, at('2026-12-15T00:00:00Z'), '0'), false);
assert.equal(yearReviewOpen(2027, at('2026-12-15T00:00:00Z'), '1'), false);

// ---- the public route ------------------------------------------------------------------------------------------------

let now = at('2026-12-05T12:00:00Z');
const owners: Record<string, string> = { 42: 'user-1' };
const app = express();
app.use(createYearReviewRouter({
  loadEvents: (userId, query) => {
    assert.equal(userId, 'user-1');
    assert.equal(query.until, '2026-12-05T00:00:00.000Z', 'the public copy stops at the start of the day');
    return games.filter(game => game.startedAt >= Date.parse(query.since as string) && game.startedAt < Date.parse(query.until as string))
      .map(fixtureEvent);
  },
  resolvePublicStatsOwner: id => owners[id] ?? null,
  resolveCardIds: async dbfIds => Object.fromEntries(dbfIds.map(dbfId => [dbfId, `CARD_${dbfId}`])),
  resolveCardNames: async ids => Object.fromEntries(ids.map(id => [id, `Имя ${id}`])),
  now: () => now,
}));

/** The schema-v2 tracker event a fixture game would come from (the route parses events, not games). */
function fixtureEvent(game: PlayerGame) {
  const occurredAt = new Date(game.startedAt).toISOString();
  if (game.mode === 'battlegrounds') {
    const { heroCardId, placement, ratingBefore, ratingAfter } = game.battlegrounds;
    return { eventId: game.id, type: 'battlegrounds_match', schemaVersion: 2, occurredAt,
      payload: { durationSeconds: game.durationSeconds, heroCardId, placement, ratingBefore, ratingAfter } };
  }
  assert.ok(game.mode === 'standard' || game.mode === 'wild', 'the fixtures are Standard and Battlegrounds games');
  const detail = game.constructed;
  return { eventId: game.id, type: 'constructed_match', schemaVersion: 2, occurredAt,
    payload: { durationSeconds: game.durationSeconds, turns: game.turns, result: game.result, format: 'standard', ranked: true,
      playerClass: detail.playerClass, opponentClass: detail.opponentClass, deckCode: detail.deckCode, archetype: detail.archetype,
      rankAfter: detail.rankAfter } };
}

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
try {
  const hidden = await fetch(`${base}/profiles/7/year/2026`);
  assert.equal(hidden.status, 404, 'a profile that does not show its statistics has no review');
  assert.equal((await fetch(`${base}/profiles/42/year/20xx`)).status, 404);

  now = at('2026-11-20T12:00:00Z');
  assert.equal((await fetch(`${base}/profiles/42/year/2026`)).status, 404, 'closed until December 1');
  now = at('2026-12-05T12:00:00Z');

  const open = await fetch(`${base}/profiles/42/year/2026`);
  assert.equal(open.status, 200);
  assert.equal(open.headers.get('cache-control'), 'public, max-age=300');
  const body = await open.json();
  assert.equal(body.games, 6);
  assert.equal(body.battlegrounds.favouriteHero.name, 'Имя TB_BaconShop_HERO_41');
  assert.deepEqual(body.topCards[0], { dbfId: 1, cardId: 'CARD_1', name: 'Имя CARD_1', games: 3 });
  assert.equal(JSON.stringify(body).includes('user-1'), false, 'no account id in the public answer');
} finally {
  server.close();
}

console.log('year review: ok');
