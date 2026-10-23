import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  PLAYER_GAME_SCHEMA_VERSION,
  ladderValue,
  type IngestStatus,
  type PlayerGame,
  type PlayerGameMode,
} from '../model/game.js';

export const PLAYER_GAME_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS player_games (
    user_id TEXT NOT NULL,
    client_game_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    result TEXT NOT NULL,
    turns INTEGER,
    hero TEXT,
    player_class TEXT,
    opponent_class TEXT,
    placement INTEGER,
    duos INTEGER NOT NULL DEFAULT 0,
    rating_before INTEGER,
    rating_after INTEGER,
    ranked INTEGER NOT NULL DEFAULT 1,
    rank_before INTEGER,
    rank_after INTEGER,
    legend_rank_after INTEGER,
    deck_code TEXT,
    archetype TEXT,
    arena_run_id TEXT,
    arena_game_number INTEGER,
    client_name TEXT NOT NULL,
    client_version TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    detail_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, client_game_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_player_games_user_mode_time
    ON player_games(user_id, mode, started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_player_games_user_time
    ON player_games(user_id, started_at DESC, client_game_id DESC);
`;

/** A stored game as the statistics read it: the mode detail stays parsed JSON. */
export type StoredPlayerGame = PlayerGame;

export type GameListPage = {
  total: number;
  byMode: Record<PlayerGameMode, number>;
  latestStartedAt: number | null;
  games: Array<{ id: string; mode: PlayerGameMode; startedAt: number; updatedAt: number }>;
  next: { startedAt: number; id: string } | null;
};

export type PlayerGameStore = {
  countGames: (userId: string) => number;
  /** Writes in one transaction; `unchanged` when the normalized content hash matches. */
  upsertGames: (userId: string, games: readonly PlayerGame[], now: number) => IngestStatus[];
  listGames: (userId: string, query: { limit: number; since: number | null; before: { startedAt: number; id: string } | null }) => GameListPage;
  loadGames: (userId: string, query: { mode: PlayerGameMode; since: number | null; limit: number }) => StoredPlayerGame[];
};

function contentHash(game: PlayerGame): string {
  return createHash('sha256').update(JSON.stringify(game)).digest('hex');
}

function columns(game: PlayerGame) {
  const empty = {
    hero: null as string | null, playerClass: null as string | null, opponentClass: null as string | null,
    placement: null as number | null, duos: 0, ratingBefore: null as number | null, ratingAfter: null as number | null,
    ranked: 1, rankBefore: null as number | null, rankAfter: null as number | null, legendRankAfter: null as number | null,
    deckCode: null as string | null, archetype: null as string | null, runId: null as string | null, gameNumber: null as number | null,
  };
  if (game.mode === 'battlegrounds') {
    const detail = game.battlegrounds;
    return { ...empty, detail, hero: detail.heroCardId, placement: detail.placement, duos: detail.duos ? 1 : 0,
      ratingBefore: detail.ratingBefore, ratingAfter: detail.ratingAfter };
  }
  if (game.mode === 'arena') {
    const detail = game.arena;
    return { ...empty, detail, playerClass: detail.playerClass, opponentClass: detail.opponentClass,
      runId: detail.runId, gameNumber: detail.gameNumber };
  }
  const detail = game.constructed;
  return { ...empty, detail, hero: detail.heroCardId, playerClass: detail.playerClass, opponentClass: detail.opponentClass,
    ranked: detail.ranked ? 1 : 0, rankBefore: ladderValue(detail.rankBefore), rankAfter: ladderValue(detail.rankAfter),
    legendRankAfter: detail.rankAfter?.legendRank ?? null, deckCode: detail.deckCode, archetype: detail.archetype };
}

function rowToGame(row: Record<string, unknown>): StoredPlayerGame {
  const mode = String(row.mode) as PlayerGameMode;
  const base = {
    id: String(row.client_game_id),
    startedAt: Number(row.started_at),
    durationSeconds: Number(row.duration_seconds),
    result: String(row.result) as PlayerGame['result'],
    turns: row.turns === null ? null : Number(row.turns),
    client: { name: String(row.client_name), version: String(row.client_version) },
  };
  const detail = JSON.parse(String(row.detail_json));
  if (mode === 'battlegrounds') return { ...base, mode, battlegrounds: detail };
  if (mode === 'arena') return { ...base, mode, arena: detail };
  return { ...base, mode, constructed: detail };
}

export function createSqlitePlayerGameStore(getDatabase: () => DatabaseSync): PlayerGameStore {
  return {
    countGames(userId) {
      return Number(getDatabase().prepare('SELECT COUNT(*) AS count FROM player_games WHERE user_id = ?').get(userId)?.count ?? 0);
    },
    upsertGames(userId, games, now) {
      const database = getDatabase();
      const existing = database.prepare('SELECT content_hash FROM player_games WHERE user_id = ? AND client_game_id = ?');
      const write = database.prepare(`
        INSERT INTO player_games (
          user_id, client_game_id, mode, started_at, duration_seconds, result, turns, hero, player_class,
          opponent_class, placement, duos, rating_before, rating_after, ranked, rank_before, rank_after,
          legend_rank_after, deck_code, archetype, arena_run_id, arena_game_number, client_name, client_version,
          schema_version, detail_json, content_hash, received_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, client_game_id) DO UPDATE SET
          mode = excluded.mode, started_at = excluded.started_at, duration_seconds = excluded.duration_seconds,
          result = excluded.result, turns = excluded.turns, hero = excluded.hero, player_class = excluded.player_class,
          opponent_class = excluded.opponent_class, placement = excluded.placement, duos = excluded.duos,
          rating_before = excluded.rating_before, rating_after = excluded.rating_after, ranked = excluded.ranked,
          rank_before = excluded.rank_before, rank_after = excluded.rank_after,
          legend_rank_after = excluded.legend_rank_after, deck_code = excluded.deck_code, archetype = excluded.archetype,
          arena_run_id = excluded.arena_run_id, arena_game_number = excluded.arena_game_number,
          client_name = excluded.client_name, client_version = excluded.client_version,
          schema_version = excluded.schema_version, detail_json = excluded.detail_json,
          content_hash = excluded.content_hash, updated_at = excluded.updated_at
      `);
      const statuses: IngestStatus[] = [];
      database.exec('BEGIN IMMEDIATE');
      try {
        for (const game of games) {
          const hash = contentHash(game);
          const previous = existing.get(userId, game.id) as { content_hash?: string } | undefined;
          if (previous?.content_hash === hash) {
            statuses.push('unchanged');
            continue;
          }
          const value = columns(game);
          write.run(userId, game.id, game.mode, game.startedAt, game.durationSeconds, game.result, game.turns,
            value.hero, value.playerClass, value.opponentClass, value.placement, value.duos, value.ratingBefore,
            value.ratingAfter, value.ranked, value.rankBefore, value.rankAfter, value.legendRankAfter, value.deckCode,
            value.archetype, value.runId, value.gameNumber, game.client.name, game.client.version,
            PLAYER_GAME_SCHEMA_VERSION, JSON.stringify(value.detail), hash, now, now);
          statuses.push(previous ? 'updated' : 'created');
        }
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
      return statuses;
    },
    listGames(userId, query) {
      const database = getDatabase();
      const byMode = { battlegrounds: 0, standard: 0, wild: 0, arena: 0 };
      let total = 0;
      let latestStartedAt: number | null = null;
      for (const row of database.prepare(`SELECT mode, COUNT(*) AS count, MAX(started_at) AS latest
        FROM player_games WHERE user_id = ? GROUP BY mode`).all(userId)) {
        const count = Number(row.count);
        total += count;
        if (String(row.mode) in byMode) byMode[String(row.mode) as PlayerGameMode] = count;
        latestStartedAt = Math.max(latestStartedAt ?? 0, Number(row.latest));
      }
      const before = query.before;
      const rows = database.prepare(`SELECT client_game_id, mode, started_at, updated_at FROM player_games
        WHERE user_id = ? AND started_at >= ?
          AND (? IS NULL OR started_at < ? OR (started_at = ? AND client_game_id < ?))
        ORDER BY started_at DESC, client_game_id DESC LIMIT ?`).all(
        userId, query.since ?? 0, before?.startedAt ?? null, before?.startedAt ?? 0, before?.startedAt ?? 0,
        before?.id ?? '', query.limit + 1);
      const games = rows.slice(0, query.limit).map(row => ({
        id: String(row.client_game_id),
        mode: String(row.mode) as PlayerGameMode,
        startedAt: Number(row.started_at),
        updatedAt: Number(row.updated_at),
      }));
      const last = games.at(-1);
      return { total, byMode, latestStartedAt, games,
        next: rows.length > query.limit && last ? { startedAt: last.startedAt, id: last.id } : null };
    },
    loadGames(userId, query) {
      return getDatabase().prepare(`SELECT * FROM player_games
        WHERE user_id = ? AND mode = ? AND started_at >= ?
        ORDER BY started_at DESC LIMIT ?`).all(userId, query.mode, query.since ?? 0, query.limit)
        .map(row => rowToGame(row as Record<string, unknown>));
    },
  };
}

export function initializePlayerGameStore(getDatabase: () => DatabaseSync): void {
  getDatabase().exec(PLAYER_GAME_TABLES_SQL);
}
