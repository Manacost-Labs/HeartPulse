import assert from 'node:assert/strict';
import { decode } from '@firestone-hs/deckstrings';
import express from 'express';
import { CHAT_MAX_LENGTH, chatLine, createChatCommandsRouter, deckstringOf, rankText, type ChatSnapshot } from '../server/modules/chatCommands/public.js';
import type { PlayerGame } from '../server/modules/playerGames/public.js';

// ---- pure parts --------------------------------------------------------------------------------------------------

const deck = { name: 'Маг на секретах', hero: 'HERO_08', format: 'standard', cards: [{ dbf: 1004, total: 2 }, { dbf: 2005, total: 1 }, { dbf: 0, total: 2 }] };
const code = deckstringOf(deck, 637);
assert.ok(code);
const decoded = decode(code);
assert.deepEqual([decoded.cards, decoded.heroes, decoded.format], [[[1004, 2], [2005, 1]], [637], 2]);
assert.equal(deckstringOf(deck, null), null, 'no hero, no code');
assert.equal(deckstringOf({ ...deck, cards: [] }, 637), null);
assert.equal(decode(deckstringOf({ ...deck, format: 'wild' }, 637) as string).format, 1);

assert.equal(chatLine('a\nb\u0007c   d'), 'a b c d');
assert.equal(chatLine('x'.repeat(500)).length, CHAT_MAX_LENGTH);
assert.equal(rankText({ starLevel: 45, stars: 2, legendRank: null }, 'ru'), 'Алмаз 6');
assert.equal(rankText({ starLevel: 1, stars: 0, legendRank: null }, 'en'), 'Bronze 10');
assert.equal(rankText({ starLevel: 51, stars: 0, legendRank: 1234 }, 'ru'), 'Легенда 1234');

// ---- the route ---------------------------------------------------------------------------------------------------

const t0 = Date.parse('2026-11-06T20:00:00Z');
let now = t0;
const minute = 60_000;
const ranked = (endedMinutesAgo: number, result: 'win' | 'loss', starLevel: number): PlayerGame => ({
  id: `c${endedMinutesAgo}`, startedAt: t0 - endedMinutesAgo * minute - 10 * minute, durationSeconds: 600, result, turns: 8, mode: 'standard',
  constructed: { ranked: true, playerClass: 'MAGE', opponentClass: 'ROGUE', heroCardId: null, opponentHeroCardId: null, deckCode: null,
    deckName: null, archetype: null, opponentArchetype: null, wentFirst: null, rankBefore: null, rankAfter: { starLevel, stars: 1, legendRank: null } },
});
const bg = (endedMinutesAgo: number, placement: number, before: number, after: number): PlayerGame => ({
  id: `b${endedMinutesAgo}`, startedAt: t0 - endedMinutesAgo * minute - 20 * minute, durationSeconds: 1200, result: placement <= 4 ? 'win' : 'loss',
  turns: 12, mode: 'battlegrounds', battlegrounds: { heroCardId: 'TB_BaconShop_HERO_41', placement, duos: false, ratingBefore: before, ratingAfter: after,
    anomalyCardId: null, races: [], tavernTier: 5, finalBoard: [], combats: [], heroOptions: [], offers: [] },
});
const games = () => [ranked(120, 'win', 44), ranked(90, 'loss', 44), ranked(60, 'win', 45), bg(30, 2, 6500, 6560), bg(3, 8, 6560, 6480)]
  .sort((left, right) => left.startedAt - right.startedAt);

let snapshot: ChatSnapshot | null = { deck, receivedAt: now, delaySeconds: 120 };
let statsPublic = true;
let channelReads = 0;
const app = express();
app.use(createChatCommandsRouter({
  findChannel: login => {
    channelReads += 1;
    return login === 'streamer' ? { userId: 'user-1', twitchUserId: '1001', statsPublic } : null;
  },
  snapshot: id => (id === '1001' ? snapshot : null),
  readGames: (userId, window) => {
    assert.equal(userId, 'user-1');
    assert.equal(window.until, now);
    return games().filter(game => game.startedAt >= window.since);
  },
  heroDbfId: async cardId => (cardId === 'HERO_08' ? 637 : null),
  now: () => now,
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const ask = async (path: string) => {
  const response = await fetch(`${base}/v1/chat/${path}`);
  return { status: response.status, type: response.headers.get('content-type') ?? '', cache: response.headers.get('cache-control'), text: await response.text() };
};
const tick = () => { now += 20_000; };

try {
  // Unlinked channels, unknown commands and bad logins answer nothing.
  assert.deepEqual(await ask('nobody/deck'), { status: 404, type: 'text/plain; charset=utf-8', cache: 'no-store', text: '' });
  assert.equal((await ask('streamer/hand')).status, 404);
  assert.equal((await ask('bad-login!/deck')).status, 404);

  const deckAnswer = await ask('Streamer/deck');
  assert.equal(deckAnswer.status, 200);
  assert.equal(deckAnswer.cache, 'public, max-age=15');
  assert.equal(deckAnswer.text, `Маг на секретах: ${code}`, 'the channel login is case-insensitive');
  assert.ok(deckAnswer.text.length < 400);

  // Answers are cached per channel and command for 15 s: a chat full of !deck reads the channel once.
  const reads = channelReads;
  snapshot = null;
  assert.equal((await ask('streamer/deck')).text, `Маг на секретах: ${code}`);
  assert.equal(channelReads, reads);
  tick();
  assert.equal((await ask('streamer/deck')).text, 'Hearthpulse: стример сейчас не показывает колоду.');
  assert.equal((await ask('streamer/deck?lang=en')).text, 'Hearthpulse: the streamer is not showing the deck right now.');

  // Stats honour the stream delay: with 2 minutes, the game that ended 3 minutes ago is already on stream.
  snapshot = { deck, receivedAt: now, delaySeconds: 120 };
  assert.equal((await ask('streamer/winrate')).text, 'Сегодня: 2–1 (67%) · Поля сражений: 2 игр, среднее место 5.0');
  assert.equal((await ask('streamer/mmr')).text, 'MMR Полей сражений: 6480 (−20 сегодня)');
  assert.equal((await ask('streamer/rank')).text, 'Ранг: Алмаз 6 (Стандарт)');
  assert.equal((await ask('streamer/rank?lang=en')).text, 'Rank: Diamond 6 (Standard)');

  // A longer delay hides the newest game; without a snapshot the longest delay (10 min) is assumed.
  tick();
  snapshot = { deck, receivedAt: now, delaySeconds: 300 };
  assert.equal((await ask('streamer/mmr')).text, 'MMR Полей сражений: 6560 (+60 сегодня)');
  tick();
  snapshot = null;
  assert.equal((await ask('streamer/winrate')).text, 'Сегодня: 2–1 (67%) · Поля сражений: 1 игр, среднее место 2.0');

  // The streamer's consent for stats is the public statistics switch of the profile.
  tick();
  statsPublic = false;
  assert.equal((await ask('streamer/winrate')).text, 'Hearthpulse: стример не показывает статистику.');
  assert.equal((await ask('streamer/mmr?lang=en')).text, 'Hearthpulse: the streamer does not share stats.');
} finally {
  server.close();
}

console.log('chat commands: ok');
