import { createContext, type ComponentType } from 'react';

/**
 * The player's game statistics from the desktop tracker. They are built on
 * vendored Valyro components, which modules may not import, so the page
 * composition supplies them (`src/features/playerStats`) through this slot;
 * without it the account simply has no statistics section.
 */
export const AccountGameStatsSlot = /* @__PURE__ */ createContext<ComponentType | null>(null);
