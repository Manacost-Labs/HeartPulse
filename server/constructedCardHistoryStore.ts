import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  ConstructedCardFormat,
  ConstructedCardPeriod,
} from './constructedCardRoutes.js';

type JsonRecord = Record<string, any>;

export type ConstructedCardHistoryPoint = {
  recordedAt: string;
  deckPopularity: number | null;
  deckWinrate: number | null;
  averageCopies: number | null;
  timesPlayed: number | null;
  winrateWhenPlayed: number | null;
  winrateWhenDrawn: number | null;
  keepPercentage: number | null;
  openingHandWinrate: number | null;
  averageTurnsInHand: number | null;
  averageTurnPlayed: number | null;
};

type StoreOptions = {
  stateDirectory: string;
  now?: () => number;
  retentionDays?: number;
};

const DAY_MS = 24 * 60 * 60_000;
const CARD_ID = /^[A-Z0-9_]{2,80}$/;

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const parsed = finiteNumber(value);
  const integer = parsed === null ? null : Math.trunc(parsed);
  return integer !== null && Number.isSafeInteger(integer) && integer >= 0 ? integer : null;
}

function normalizedTimestamp(value: unknown, fallback: number): string {
  const parsed = Date.parse(String(value ?? ''));
  return new Date(Number.isFinite(parsed) && parsed <= fallback + DAY_MS ? parsed : fallback).toISOString();
}

function historyPointFromCard(card: JsonRecord): Omit<ConstructedCardHistoryPoint, 'recordedAt'> | null {
  const stats = card?.stats;
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return null;
  const point = {
    deckPopularity: finiteNumber(stats.deckPopularity),
    deckWinrate: finiteNumber(stats.deckWinrate),
    averageCopies: finiteNumber(stats.averageCopies),
    timesPlayed: nonNegativeInteger(stats.timesPlayed),
    winrateWhenPlayed: finiteNumber(stats.winrateWhenPlayed),
    winrateWhenDrawn: finiteNumber(stats.winrateWhenDrawn),
    keepPercentage: finiteNumber(stats.keepPercentage),
    openingHandWinrate: finiteNumber(stats.openingHandWinrate),
    averageTurnsInHand: finiteNumber(stats.averageTurnsInHand),
    averageTurnPlayed: finiteNumber(stats.averageTurnPlayed),
  };
  return Object.values(point).some(value => value !== null) ? point : null;
}

export class ConstructedCardHistoryStore {
  private readonly database: DatabaseSync;
  private readonly now: () => number;
  private readonly retentionMs: number;

  constructor(options: StoreOptions) {
    this.now = options.now ?? Date.now;
    const retentionDays = Math.max(30, Math.min(730, Math.floor(options.retentionDays ?? 400)));
    this.retentionMs = retentionDays * DAY_MS;
    const directory = join(options.stateDirectory, 'constructed-card-history-v1');
    mkdirSync(directory, { recursive: true });
    this.database = new DatabaseSync(join(directory, 'history.sqlite'));
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS card_stat_history (
        format TEXT NOT NULL CHECK (format IN ('standard', 'wild')),
        period TEXT NOT NULL CHECK (period IN ('1d', '3d', '7d', '14d', 'patch')),
        card_id TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        deck_popularity REAL,
        deck_winrate REAL,
        average_copies REAL,
        times_played INTEGER,
        winrate_when_played REAL,
        winrate_when_drawn REAL,
        keep_percentage REAL,
        opening_hand_winrate REAL,
        average_turns_in_hand REAL,
        average_turn_played REAL,
        PRIMARY KEY (format, period, card_id, recorded_at)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS idx_card_stat_history_recorded_at
        ON card_stat_history (recorded_at);
    `);
  }

  recordSnapshot(
    format: ConstructedCardFormat,
    period: ConstructedCardPeriod,
    recordedAt: string | null,
    cards: JsonRecord[],
  ): number {
    const timestamp = normalizedTimestamp(recordedAt, this.now());
    const insert = this.database.prepare(`
      INSERT OR IGNORE INTO card_stat_history (
        format, period, card_id, recorded_at, deck_popularity, deck_winrate,
        average_copies, times_played, winrate_when_played, winrate_when_drawn,
        keep_percentage, opening_hand_winrate, average_turns_in_hand, average_turn_played
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const prune = this.database.prepare('DELETE FROM card_stat_history WHERE recorded_at < ?');
    let inserted = 0;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      for (const card of cards) {
        const cardId = String(card?.card_id ?? '').trim().toUpperCase();
        if (!CARD_ID.test(cardId)) continue;
        const point = historyPointFromCard(card);
        if (!point) continue;
        const result = insert.run(
          format,
          period,
          cardId,
          timestamp,
          point.deckPopularity,
          point.deckWinrate,
          point.averageCopies,
          point.timesPlayed,
          point.winrateWhenPlayed,
          point.winrateWhenDrawn,
          point.keepPercentage,
          point.openingHandWinrate,
          point.averageTurnsInHand,
          point.averageTurnPlayed,
        );
        inserted += Number(result.changes);
      }
      prune.run(new Date(this.now() - this.retentionMs).toISOString());
      this.database.exec('COMMIT');
      return inserted;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  read(
    format: ConstructedCardFormat,
    period: ConstructedCardPeriod,
    cardIdValue: string,
    days = 90,
  ): ConstructedCardHistoryPoint[] {
    const cardId = String(cardIdValue ?? '').trim().toUpperCase();
    if (!CARD_ID.test(cardId)) return [];
    const boundedDays = Math.max(7, Math.min(365, Math.floor(days)));
    const rows = this.database.prepare(`
      SELECT
        recorded_at AS recordedAt,
        deck_popularity AS deckPopularity,
        deck_winrate AS deckWinrate,
        average_copies AS averageCopies,
        times_played AS timesPlayed,
        winrate_when_played AS winrateWhenPlayed,
        winrate_when_drawn AS winrateWhenDrawn,
        keep_percentage AS keepPercentage,
        opening_hand_winrate AS openingHandWinrate,
        average_turns_in_hand AS averageTurnsInHand,
        average_turn_played AS averageTurnPlayed
      FROM card_stat_history
      WHERE format = ? AND period = ? AND card_id = ? AND recorded_at >= ?
      ORDER BY recorded_at ASC
      LIMIT 1000
    `).all(
      format,
      period,
      cardId,
      new Date(this.now() - boundedDays * DAY_MS).toISOString(),
    ) as ConstructedCardHistoryPoint[];
    return rows.map(row => ({ ...row }));
  }

  close(): void {
    this.database.close();
  }
}
