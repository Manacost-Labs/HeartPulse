import assert from 'node:assert/strict';
import { fetchGameStatsModes, gameStatsFromPayload, gameStatsUrl } from '../src/modules/playerStats/api/gameStatsApi.js';
import { comparison, formatDuration, formatSigned, pluralGames, rankLabel, winrate } from '../src/modules/playerStats/model/format.js';
import { heroPickRate, visibleHeroes } from '../src/modules/playerStats/model/heroTable.js';
import { hasStats, type ArenaStats, type HeroStats } from '../src/modules/playerStats/model/stats.js';

// Ranks follow the client's star levels.
assert.equal(rankLabel({ starLevel: 1, stars: 0, legendRank: null }), 'Бронза 10');
assert.equal(rankLabel({ starLevel: 50, stars: 3, legendRank: null }), 'Алмаз 1');
assert.equal(rankLabel({ starLevel: 46, stars: 0, legendRank: null }), 'Алмаз 5');
assert.equal(rankLabel({ starLevel: 51, stars: 0, legendRank: 812 }), 'Легенда №812');
assert.equal(rankLabel({ starLevel: 51, stars: 0, legendRank: null }), 'Легенда');
assert.equal(rankLabel(null), '—');

assert.equal(formatDuration(35 * 60), '35 мин');
assert.equal(formatDuration(2 * 3600 + 5 * 60), '2 ч 5 мин');
assert.equal(formatDuration(42 * 3600), '42 ч');
assert.equal(formatSigned(27), '+27');
assert.equal(formatSigned(-8), '−8');
assert.equal(pluralGames(1), '1 игра');
assert.equal(pluralGames(3), '3 игры');
assert.equal(pluralGames(11), '11 игр');
assert.equal(winrate({ games: 3, wins: 2 }), 66.7);
assert.equal(winrate({ games: 0, wins: 0 }), null);

// An Arena run that arrived before its matches still has something to show.
const arenaRuns = (games: number, runs: number) => ({ mode: 'arena', games, summary: { runs } }) as ArenaStats;
assert.equal(hasStats(arenaRuns(0, 1)), true);
assert.equal(hasStats(arenaRuns(0, 0)), false);
assert.equal(hasStats(arenaRuns(3, 0)), true);

// «В среднем»: a lower placement is better, a higher rate is better, no global value means no comparison.
assert.deepEqual(comparison(3.8, 4.2, true)?.tone, 'better');
assert.deepEqual(comparison(56, 50)?.tone, 'better');
assert.deepEqual(comparison(44, 50)?.tone, 'worse');
assert.equal(comparison(44, null), null);

// Requests and answer validation.
assert.equal(gameStatsUrl({ mode: 'battlegrounds', period: '30', duos: true, mmr: 'TOP_5_PERCENT' }),
  '/api/account/game-stats?mode=battlegrounds&period=30&duos=1&mmr=TOP_5_PERCENT');
assert.equal(gameStatsUrl({ mode: 'arena', period: 'all', duos: true, mmr: 'TOP_5_PERCENT' }),
  '/api/account/game-stats?mode=arena&period=all');
const arena = { mode: 'arena', games: 0, summary: {}, global: { availability: 'subscription' }, runs: [], classes: [] };
assert.ok(gameStatsFromPayload(arena, 'arena'));
assert.equal(gameStatsFromPayload(arena, 'standard'), null, 'an answer for another mode is refused');
assert.equal(gameStatsFromPayload({ ...arena, runs: null }, 'arena'), null);
assert.equal(gameStatsFromPayload('nope', 'arena'), null);

// Hero table: minimum games, most played first; pick rate only where the client reported hero choices.
const hero = (heroCardId: string, games: number, averagePlacement: number, offered = 0, picked = 0): HeroStats => ({
  heroCardId, games, netRating: null, averagePlacement, placements: [], combat: [], offered, picked, global: null,
});
const heroes = [hero('A', 2, 3), hero('B', 9, 4.5, 12, 9), hero('C', 9, 3.9), hero('D', 5, 4)];
assert.deepEqual(visibleHeroes(heroes, 3).map(item => item.heroCardId), ['C', 'B', 'D']);
assert.equal(heroPickRate(heroes[1]), 75);
assert.equal(heroPickRate(heroes[2]), null);

// The section appears only when the server is switched on and the account has version 2 events.
const answer = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });
const realFetch = globalThis.fetch;
try {
  globalThis.fetch = answer(404, { error: 'Not found' }) as typeof fetch;
  assert.equal(await fetchGameStatsModes(), null);
  globalThis.fetch = answer(200, { modes: { battlegrounds: 0, standard: 0, wild: 0, arena: 0 } }) as typeof fetch;
  assert.equal(await fetchGameStatsModes(), null);
  globalThis.fetch = answer(200, { modes: { battlegrounds: 12, arena: 'x' } }) as typeof fetch;
  assert.deepEqual(await fetchGameStatsModes(), { battlegrounds: 12, standard: 0, wild: 0, arena: 0 });
  globalThis.fetch = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
  assert.equal(await fetchGameStatsModes(), null);
} finally {
  globalThis.fetch = realFetch;
}

console.log('player stats client: ok');
