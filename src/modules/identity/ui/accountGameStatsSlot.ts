import { createContext, type ComponentType, type ReactNode } from 'react';

export type AccountGameStatsProps = {
  /**
   * Places the statistics: `summary` is the header strip (mode, period and
   * the main numbers), `body` the sections of the shown mode.
   */
  frame: (body: ReactNode, summary: ReactNode) => ReactNode;
  /** Shown once the check finds no games (or the statistics are switched off). */
  empty?: ReactNode;
  /** Shown while the check runs; keeps the place of the section. */
  pending?: ReactNode;
};

/**
 * The player's game statistics from the desktop tracker. They are built on
 * vendored UI kits, which modules may not import, so the page composition
 * supplies them (`src/features/playerStats`) through this slot. The component
 * calls `frame` only when the account has statistics to show and `empty`
 * otherwise; without a supplied component the account shows only `empty`.
 */
export const AccountGameStatsSlot = /* @__PURE__ */ createContext<ComponentType<AccountGameStatsProps> | null>(null);
