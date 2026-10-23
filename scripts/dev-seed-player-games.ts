/**
 * Development only: fills a local account with realistic synthetic tracker
 * events (schemaVersion 2) so the account statistics can be viewed without the
 * desktop tracker.
 *
 *   ECOSYSTEM_DB_FILE=<local users.sqlite> npx tsx scripts/dev-seed-player-games.ts --dev-database --create-user
 *   ECOSYSTEM_DB_FILE=<local users.sqlite> npx tsx scripts/dev-seed-player-games.ts --dev-database --user <id> [--reset]
 *
 * It writes only to ECOSYSTEM_DB_FILE, refuses NODE_ENV=production and the
 * production database path, and goes through the same validation and storage
 * as `POST /api/v1/tracker/events/batch`.
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { validateStatisticsPayload } from '../server/modules/playerGames/public.js';
import {
  createSqliteTrackerEventRepository,
  initializeTrackerEventRepository,
  validateTrackerProfileEvent,
  type TrackerProfileEvent,
} from '../server/modules/trackerIngestion/public.js';

const SERVER_ROOTS = /^(?:[A-Za-z]:)?\/(?:var\/lib|srv|opt|etc)(?:\/|$)/;
const MAX_DEV_USERS = 50;
const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
if (!process.env.ECOSYSTEM_DB_FILE) {
  console.error('[seed-player-games] set ECOSYSTEM_DB_FILE to the local API server database');
  process.exit(1);
}
const dbFile = resolve(process.env.ECOSYSTEM_DB_FILE);
const realFile = existsSync(dbFile) ? realpathSync(dbFile) : dbFile;
// Three independent guards: an explicit flag, no server path even through a symlink, no production NODE_ENV.
if (!args.includes('--dev-database') || process.env.NODE_ENV === 'production' || SERVER_ROOTS.test(realFile.replaceAll('\\', '/'))) {
  console.error('[seed-player-games] refused: pass --dev-database and point ECOSYSTEM_DB_FILE at a local development database');
  process.exit(1);
}

let state = 20261023;
const random = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
const between = (low: number, high: number) => Math.floor(low + random() * (high - low + 1));
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const DAY = 86_400_000;
const now = Date.now();

type Card = { id: string; tier: number; attack: number; health: number };
const FALLBACK_HEROES = ['TB_BaconShop_HERO_01', 'TB_BaconShop_HERO_02', 'TB_BaconShop_HERO_28', 'TB_BaconShop_HERO_34', 'TB_BaconShop_HERO_49'];
const FALLBACK_MINIONS: Card[] = [{ id: 'BGS_004', tier: 1, attack: 2, health: 3 }, { id: 'BGS_039', tier: 2, attack: 2, health: 4 }];

async function battlegroundsCards(): Promise<{ heroes: string[]; minions: Card[] }> {
  try {
    const response = await fetch('https://api.hearthstonejson.com/v1/latest/ruRU/cards.json', { signal: AbortSignal.timeout(60_000) });
    const cards = await response.json() as Array<Record<string, unknown>>;
    const heroes = cards.filter(card => card.battlegroundsHero === true && card.type === 'HERO' && typeof card.id === 'string'
      && !String(card.id).includes('SKIN') && card.id !== 'TB_BaconShop_HERO_PH').map(card => String(card.id));
    const minions = cards.filter(card => card.isBattlegroundsPoolMinion === true && typeof card.techLevel === 'number')
      .map(card => ({ id: String(card.id), tier: Number(card.techLevel), attack: Number(card.attack ?? 1), health: Number(card.health ?? 1) }));
    // Renders of the newest set often lag on HearthstoneJSON; older pool minions always have art.
    const settled = minions.filter(card => /^(BGS_|BG2[0-9]_)/.test(card.id));
    if (heroes.length > 10 && minions.length > 20) return { heroes, minions: settled.length > 40 ? settled : minions };
  } catch {
    // Offline: the fallback ids still validate and render as plain portraits.
  }
  return { heroes: FALLBACK_HEROES, minions: FALLBACK_MINIONS };
}

function battlegroundsGames(heroes: string[], minions: Card[]) {
  const pool = heroes.slice(0, 40);
  const favourites = pool.slice(0, 8);
  let rating = 6100;
  return Array.from({ length: 220 }, (_, index) => {
    const startedAt = now - (220 - index) * 0.4 * DAY - between(0, 3_600_000);
    const options = [...new Set([pick(favourites), pick(pool), pick(pool), pick(pool)])];
    const hero = random() < 0.75 ? options[0] : pick(options);
    const skill = favourites.indexOf(hero) >= 0 ? 0.6 : 0.45;
    const placement = Math.min(8, Math.max(1, Math.round(1 + random() * 7 - (skill - 0.5) * 5)));
    const delta = [62, 41, 22, 6, -8, -24, -41, -58][placement - 1] + between(-6, 6);
    const ratingBefore = rating;
    rating = Math.max(0, rating + delta);
    const turns = between(9, 16) - Math.floor(placement / 3);
    const tier = Math.min(7, 3 + Math.floor((16 - placement * 1.5) / 3));
    const board = Array.from({ length: placement <= 4 ? 7 : between(4, 7) }, () => {
      const minion = pick(minions.filter(card => card.tier <= tier).length ? minions.filter(card => card.tier <= tier) : minions);
      const golden = random() < 0.3;
      const scale = 1 + turns / 3 + (8 - placement);
      return { cardId: minion.id, attack: Math.round(minion.attack * scale * (golden ? 2 : 1)),
        health: Math.round(minion.health * scale * (golden ? 2 : 1)), golden };
    });
    const combats = Array.from({ length: turns }, (_, turn) => {
      const roll = random();
      const win = roll < skill - turn * 0.01;
      return { turn: turn + 1, result: win ? 'win' : roll < skill + 0.1 ? 'tie' : 'loss',
        damageDealt: win ? between(2, 12) : 0, damageTaken: win ? 0 : between(1, 14) };
    });
    return {
      id: `seed-bg-${index.toString().padStart(4, '0')}`, mode: 'battlegrounds', startedAt: new Date(startedAt).toISOString(),
      durationSeconds: 600 + turns * 95 + between(0, 120), turns,
      battlegrounds: { heroCardId: hero, placement, duos: false, ratingBefore, ratingAfter: rating, tavernTier: tier,
        finalBoard: board, combats, heroOptions: options.sort() },
    };
  });
}

const DECKS = [
  { playerClass: 'DEATHKNIGHT', archetype: 'Blood Death Knight', deckName: 'Кровь и лёд', deckCode: 'AAECAfHhBAKH9gWV8gUOh+MEq+8E' },
  { playerClass: 'PRIEST', archetype: 'Dragon Priest', deckName: 'Драконы', deckCode: 'AAECAa0GBPDtBIGlBuqmBomyBg2t' },
  { playerClass: 'SHAMAN', archetype: 'Elemental Shaman', deckName: 'Элементали', deckCode: 'AAECAaoICPqwBs/OBqf7BcHQBg6E' },
];
const CLASSES = ['DEATHKNIGHT', 'DEMONHUNTER', 'DRUID', 'HUNTER', 'MAGE', 'PALADIN', 'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR'];

function constructedGames(mode: 'standard' | 'wild', count: number) {
  let starLevel = mode === 'standard' ? 46 : 41;
  let stars = 0;
  let legendRank = 4200;
  return Array.from({ length: count }, (_, index) => {
    const deck = mode === 'standard' ? DECKS[index % 7 < 4 ? 0 : index % 7 < 6 ? 1 : 2] : DECKS[1];
    const opponentClass = pick(CLASSES);
    const win = random() < (deck === DECKS[0] ? 0.57 : 0.51);
    const rankBefore = { starLevel, stars, ...(starLevel === 51 ? { legendRank } : {}) };
    if (starLevel === 51) legendRank = Math.max(1, legendRank + (win ? -between(30, 90) : between(20, 80)));
    else if (win) { stars += 1; if (stars > 3) { stars = 1; starLevel += 1; } }
    else if (stars > 0) stars -= 1;
    else if (starLevel % 5 !== 1) { starLevel -= 1; stars = 2; }
    const turns = between(6, 14);
    return {
      id: `seed-${mode}-${index.toString().padStart(4, '0')}`, mode,
      startedAt: new Date(now - (count - index) * (75 / count) * DAY).toISOString(),
      durationSeconds: turns * between(45, 70), result: win ? 'win' : 'loss', turns,
      constructed: { ranked: index % 9 !== 0, playerClass: deck.playerClass, opponentClass, deckCode: deck.deckCode,
        deckName: deck.deckName, archetype: deck.archetype, wentFirst: random() < 0.5, rankBefore,
        rankAfter: { starLevel, stars, ...(starLevel === 51 ? { legendRank } : {}) } },
    };
  });
}

function arenaGames() {
  const games: unknown[] = [];
  for (let run = 0; run < 18; run += 1) {
    const playerClass = pick(['PALADIN', 'MAGE', 'ROGUE', 'WARLOCK', 'HUNTER', 'DEMONHUNTER']);
    const runId = `seed-run-${run.toString().padStart(4, '0')}`;
    const skill = 0.48 + random() * 0.2;
    let wins = 0;
    let losses = 0;
    const startedAt = now - (18 - run) * 4 * DAY;
    while (wins < 12 && losses < 3 && (run < 17 || wins + losses < 4)) {
      const win = random() < skill;
      games.push({
        id: `${runId}-g${(wins + losses + 1).toString().padStart(2, '0')}`, mode: 'arena',
        startedAt: new Date(startedAt + (wins + losses) * 1_200_000).toISOString(), durationSeconds: between(420, 900),
        result: win ? 'win' : 'loss', turns: between(7, 13),
        arena: { runId, playerClass, opponentClass: pick(CLASSES), gameNumber: wins + losses + 1, winsBefore: wins,
          lossesBefore: losses, wentFirst: random() < 0.5 },
      });
      if (win) wins += 1; else losses += 1;
    }
  }
  return games;
}

type SeedGame = {
  id: string;
  mode: string;
  startedAt: string;
  durationSeconds: number;
  turns: number;
  result?: string;
  battlegrounds?: Record<string, unknown>;
  constructed?: Record<string, unknown>;
  arena?: Record<string, unknown> & { runId: string; playerClass: string };
};

/** A stable UUID per synthetic game, so seeding twice stores nothing new. */
function eventId(seedId: string): string {
  const hex = createHash('sha256').update(seedId).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The tracker event a desktop client would send for one synthetic game (docs/specs/player-game-stats.md). */
function toEvent(game: SeedGame) {
  const common = { durationSeconds: game.durationSeconds, turns: game.turns };
  const envelope = { eventId: eventId(game.id), schemaVersion: 2, occurredAt: game.startedAt };
  if (game.mode === 'battlegrounds') {
    const { finalBoard, ...battlegrounds } = game.battlegrounds ?? {};
    return { ...envelope, type: 'battlegrounds_match', payload: { ...common, ...battlegrounds, finalBoard: { minions: finalBoard } } };
  }
  if (game.mode === 'arena') return { ...envelope, type: 'arena_match', payload: { ...common, result: game.result, ...game.arena } };
  return { ...envelope, type: 'constructed_match', payload: { ...common, format: game.mode, result: game.result, ...game.constructed } };
}

/** One final `arena_run` record per finished synthetic run. */
function arenaRunEvents(games: SeedGame[]) {
  const runs = new Map<string, SeedGame[]>();
  for (const game of games) {
    if (game.arena) runs.set(game.arena.runId, [...(runs.get(game.arena.runId) ?? []), game]);
  }
  return [...runs.entries()].flatMap(([runId, runGames]) => {
    const wins = runGames.filter(game => game.result === 'win').length;
    const losses = runGames.length - wins;
    if (wins < 12 && losses < 3) return [];
    return [{ eventId: eventId(`${runId}-run`), type: 'arena_run', schemaVersion: 2, occurredAt: runGames[runGames.length - 1].startedAt,
      payload: { runId, playerClass: runGames[0].arena?.playerClass, wins, losses, complete: true } }];
  });
}

mkdirSync(dirname(dbFile), { recursive: true });
const database = new DatabaseSync(dbFile);
database.exec('PRAGMA foreign_keys = ON');
const hasUsers = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
const userCount = hasUsers ? Number(database.prepare('SELECT COUNT(*) AS count FROM users').get()?.count ?? 0) : 0;
if (userCount > MAX_DEV_USERS) {
  console.error(`[seed-player-games] refused: ${userCount} accounts look like a real database, not a development one`);
  process.exit(1);
}
let userId = option('--user');
if (args.includes('--create-user')) {
  userId = 'dev-player';
  const iso = new Date().toISOString();
  const users = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (!users) {
    console.error('[seed-player-games] start the API server once so it creates the account tables, then rerun');
    process.exit(1);
  }
  database.prepare(`INSERT OR IGNORE INTO users (id, email, name, role, password_hash, created_at, updated_at)
    VALUES (?, 'dev-player@localhost.test', 'Тестовый игрок', 'user', 'disabled', ?, ?)`).run(userId, iso, iso);
  const token = randomBytes(32).toString('hex');
  database.prepare('INSERT INTO sessions (token_hash, user_id, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(createHash('sha256').update(token).digest('hex'), userId, 'dev-player@localhost.test', now + 30 * DAY, iso);
  console.log(`[seed-player-games] local session cookie: manacost_auth_token=${token}`);
}
if (!userId) {
  console.error('[seed-player-games] pass --user <id> or --create-user');
  process.exit(1);
}
initializeTrackerEventRepository(() => database);
if (args.includes('--reset')) database.prepare('DELETE FROM tracker_profile_events WHERE user_id = ?').run(userId);
const repository = createSqliteTrackerEventRepository(() => database);
const { heroes, minions } = await battlegroundsCards();
const games = [...battlegroundsGames(heroes, minions), ...constructedGames('standard', 160), ...constructedGames('wild', 40),
  ...arenaGames()] as SeedGame[];
const events: TrackerProfileEvent[] = [];
let rejected = 0;
for (const input of [...games.map(toEvent), ...arenaRunEvents(games)]) {
  const result = validateTrackerProfileEvent(input, validateStatisticsPayload);
  if (result.ok === true) events.push(result.event);
  else { rejected += 1; console.warn('[seed-player-games] rejected', result); }
}
repository.acknowledge(userId, events, now);
console.log(`[seed-player-games] ${dbFile}: ${events.length} events acknowledged (replays are ignored), ${rejected} rejected`);
