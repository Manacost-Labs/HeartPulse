import { createContext, useContext } from 'react';
import { formatGameDate, formatGameDay } from '../model/format';

/**
 * Whose statistics the views load: null for the signed-in account's own
 * (`/api/account/game-stats`), or a public profile ID for a profile that
 * shows its statistics (`/api/profiles/<id>/game-stats`, the public copy).
 * The views stay the same; only the page that composes them decides.
 */
export const GameStatsSourceContext = /* @__PURE__ */ createContext<string | null>(null);

/** How a game's time reads: day and time for the owner, the day only in the public copy. */
export function useGameDateFormat(): (timestamp: number) => string {
  return useContext(GameStatsSourceContext) ? formatGameDay : formatGameDate;
}
