import { GAME_EVENT_TYPES, type LoadStatisticsEvents } from '../model/events.js';
import type { PlayerGame } from '../model/game.js';
import { statisticsFromEvent } from '../schema/gameSchema.js';

/**
 * The account's games of every mode that started in `[since, until)` (ms), oldest first; Arena run records are left
 * out. For readers outside the statistics pages (year in review, chat commands).
 */
export function readPlayerGames(loadEvents: LoadStatisticsEvents, userId: string, window: { since: number; until: number; limit: number },
  now: number): PlayerGame[] {
  const games: PlayerGame[] = [];
  for (const event of loadEvents(userId, { types: GAME_EVENT_TYPES, since: new Date(window.since).toISOString(),
    until: new Date(window.until).toISOString(), limit: window.limit, minSchemaVersion: 2 })) {
    const read = statisticsFromEvent(event, now);
    if (read && 'mode' in read) games.push(read);
  }
  return games.sort((left, right) => left.startedAt - right.startedAt);
}
