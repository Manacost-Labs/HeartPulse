import { createContext, type ComponentType, type ReactNode } from 'react';

export type AccountGameStatsProps = {
  /** Wraps the statistics in the account's section frame and heading. */
  frame: (body: ReactNode) => ReactNode;
  /** Shown once the check finds no games (or the statistics are switched off); nothing while checking. */
  empty?: ReactNode;
};

/**
 * The player's game statistics from the desktop tracker. They are built on
 * vendored UI kits, which modules may not import, so the page composition
 * supplies them (`src/features/playerStats`) through this slot. The component
 * calls `frame` only when the account has statistics to show and `empty`
 * otherwise; without a supplied component the account shows only `empty`.
 */
export const AccountGameStatsSlot = /* @__PURE__ */ createContext<ComponentType<AccountGameStatsProps> | null>(null);
