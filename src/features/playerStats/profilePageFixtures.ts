/*
 * A whole profile for the page stories: about 200 Standard games over five
 * decks, 60 Battlegrounds games and ten web replays. The games are generated
 * from a fixed seed and aggregated the way the server does it, so the numbers
 * agree with each other on every chart.
 */
import type { ConstructedStats } from '../../modules/playerStats/public';
import { battlegroundsFixture } from './playerStatsFixtures';

type HearthstoneClass = ConstructedStats['classes'][number]['playerClass'];
type LadderRank = NonNullable<ConstructedStats['summary']['bestRank']>;

const DAY = 86_400_000;
const START = Date.UTC(2026, 8, 20, 17);

function sequence(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

const DECKS = [
  { playerClass: 'DEATHKNIGHT', deckName: 'Кровавый рыцарь смерти', archetype: 'Blood Death Knight', games: 64, strength: 0.6,
    deckCode: 'AAECAfHhBAbHsgaitAaWwAa4xgbS0Qb93gYMh/YE5IUFo6IFwbAG1LMGlbsGkcAGj8MGkMMGrMMG2NEG4dEGAAA=' },
  { playerClass: 'PRIEST', deckName: 'Жрец драконов', archetype: 'Dragon Priest', games: 48, strength: 0.54, deckCode: null },
  { playerClass: 'HUNTER', deckName: 'Охотник на нежить', archetype: 'Undead Hunter', games: 38, strength: 0.47, deckCode: null },
  { playerClass: 'SHAMAN', deckName: 'Шаман элементалей', archetype: 'Elemental Shaman', games: 30, strength: 0.56, deckCode: null },
  { playerClass: 'ROGUE', deckName: 'Разбойник циклов', archetype: 'Cycle Rogue', games: 20, strength: 0.4, deckCode: null },
] as const;
const OPPONENTS: Array<[HearthstoneClass, number]> = [
  ['HUNTER', 0.04], ['PALADIN', -0.06], ['DEATHKNIGHT', 0], ['MAGE', 0.05], ['PRIEST', -0.02], ['WARRIOR', -0.09],
  ['DRUID', 0.07], ['ROGUE', 0.02], ['DEMONHUNTER', -0.03], ['WARLOCK', 0.08], ['SHAMAN', 0.01],
];
const OPPONENT_ARCHETYPES: Partial<Record<HearthstoneClass, string>> = {
  HUNTER: 'Aggro Hunter', PALADIN: 'Handbuff Paladin', MAGE: 'Elemental Mage', WARRIOR: 'Control Warrior', DRUID: 'Dragon Druid',
};

type Game = {
  deck: (typeof DECKS)[number];
  opponentClass: HearthstoneClass;
  result: 'win' | 'loss';
  startedAt: number;
  wentFirst: boolean;
  turns: number;
  durationSeconds: number;
  rankAfter: LadderRank;
};

function games(): Game[] {
  const random = sequence(23);
  const order = DECKS.flatMap(deck => Array.from({ length: deck.games }, () => deck));
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  let level = 38;
  let stars = 1;
  let legend = 6_000;
  return order.map((deck, index) => {
    const [opponentClass, edge] = OPPONENTS[Math.floor(random() * OPPONENTS.length)];
    const wentFirst = random() < 0.5;
    const result = random() < deck.strength + edge + (wentFirst ? 0.03 : -0.03) ? 'win' as const : 'loss' as const;
    if (level < 51) {
      stars += result === 'win' ? (level < 46 && index % 3 === 0 ? 2 : 1) : -1;
      if (stars > 3) { level += 1; stars = 1; }
      if (stars < 0) { level = Math.max(36, level - 1); stars = 2; }
    } else {
      legend = Math.max(400, legend + (result === 'win' ? -260 : 180));
    }
    const turns = 6 + Math.floor(random() * 9);
    return {
      deck, opponentClass, result, wentFirst, turns, durationSeconds: turns * 55 + Math.floor(random() * 120),
      startedAt: START + index * 0.21 * DAY + Math.floor(random() * 3_600_000),
      rankAfter: { starLevel: level, stars: level === 51 ? 0 : stars, legendRank: level === 51 ? legend : null },
    };
  });
}

const GAMES = games();
const NEWEST_FIRST = [...GAMES].reverse();
const winsOf = (list: readonly Game[]) => list.filter(game => game.result === 'win').length;
const tally = <K extends string>(key: (game: Game) => K) => {
  const map = new Map<K, Game[]>();
  for (const game of GAMES) map.set(key(game), [...(map.get(key(game)) ?? []), game]);
  return [...map.entries()].sort((left, right) => right[1].length - left[1].length);
};
const ladder = (rank: LadderRank) => rank.starLevel * 4 + rank.stars + (rank.legendRank ? 10_000 / rank.legendRank : 0);
const best = GAMES.reduce((top, game) => (ladder(game.rankAfter) > ladder(top) ? game.rankAfter : top), GAMES[0].rankAfter);
const first = GAMES.filter(game => game.wentFirst);
const coin = GAMES.filter(game => !game.wentFirst);
const wins = winsOf(GAMES);

/** Ten of the newest games carry a web replay, as uploaded from the app. */
const REPLAY_EVERY = 3;

export const profileStandardFixture: ConstructedStats = {
  mode: 'standard',
  period: 'all',
  games: GAMES.length,
  summary: {
    wins, losses: GAMES.length - wins, ties: 0, winrate: Math.round((wins / GAMES.length) * 1_000) / 10,
    rankedGames: GAMES.length,
    averageDurationSeconds: Math.round(GAMES.reduce((sum, game) => sum + game.durationSeconds, 0) / GAMES.length),
    averageTurns: Math.round((GAMES.reduce((sum, game) => sum + game.turns, 0) / GAMES.length) * 10) / 10,
    timePlayedSeconds: GAMES.reduce((sum, game) => sum + game.durationSeconds, 0),
    currentRank: GAMES.at(-1)?.rankAfter ?? null,
    bestRank: best,
    first: { games: first.length, wins: winsOf(first) },
    coin: { games: coin.length, wins: winsOf(coin) },
  },
  rankSeries: GAMES.map((game, index) => ({
    id: `profile-std-${index}`, startedAt: game.startedAt, result: game.result, playerClass: game.deck.playerClass,
    rank: game.rankAfter, value: game.rankAfter.starLevel * 4 + game.rankAfter.stars,
  })),
  decks: tally(game => game.deck.deckName).map(([, list]) => ({
    key: `${list[0].deck.playerClass}:${list[0].deck.archetype}`, deckCode: list[0].deck.deckCode, deckName: list[0].deck.deckName,
    archetype: list[0].deck.archetype, playerClass: list[0].deck.playerClass, lastPlayedAt: Math.max(...list.map(game => game.startedAt)),
    games: list.length, wins: winsOf(list), results: list.slice(-30).map(game => game.result),
  })),
  archetypes: tally(game => game.deck.archetype).map(([archetype, list]) => ({
    archetype, playerClass: list[0].deck.playerClass, games: list.length, wins: winsOf(list), globalWinrate: null,
  })),
  classes: tally(game => game.deck.playerClass).map(([playerClass, list]) => ({
    playerClass, games: list.length, wins: winsOf(list), globalWinrate: null,
  })),
  opponentClasses: tally(game => game.opponentClass).map(([opponentClass, list]) => ({
    opponentClass, games: list.length, wins: winsOf(list),
  })),
  matchups: tally(game => `${game.deck.playerClass}:${game.opponentClass}`).map(([, list]) => ({
    playerClass: list[0].deck.playerClass, opponentClass: list[0].opponentClass, games: list.length, wins: winsOf(list),
  })),
  recentGames: NEWEST_FIRST.slice(0, 50).map((game, index) => ({
    id: `profile-recent-${index}`, startedAt: game.startedAt, durationSeconds: game.durationSeconds, result: game.result,
    turns: game.turns, replayId: index % REPLAY_EVERY === 0 && index < 10 * REPLAY_EVERY ? `profRepl${String(index).padStart(3, '0')}` : null,
    playerClass: game.deck.playerClass, opponentClass: game.opponentClass, deckName: game.deck.deckName, archetype: game.deck.archetype,
    opponentArchetype: OPPONENT_ARCHETYPES[game.opponentClass] ?? null, ranked: true, rankAfter: game.rankAfter,
  })),
  global: { availability: 'none' },
};

export const profileBattlegroundsFixture = battlegroundsFixture;
