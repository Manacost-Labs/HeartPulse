import { createContext, type ComponentType, type ReactNode } from 'react';

export type AccountGameStatsProps = {
  /** Wraps the statistics in the account's section frame and heading. */
  frame: (body: ReactNode) => ReactNode;
};

/**
 * The player's game statistics from the desktop tracker. They are built on
 * vendored UI kits, which modules may not import, so the page composition
 * supplies them (`src/features/playerStats`) through this slot. The component
 * calls `frame` only when the account has statistics to show; otherwise, and
 * without a supplied component, the account has no statistics section.
 */
export const AccountGameStatsSlot = /* @__PURE__ */ createContext<ComponentType<AccountGameStatsProps> | null>(null);
