import { createContext, type ComponentType } from 'react';
import type { AccountPlanSummary } from '../model/accountPlan';

export type AccountPlanCardProps = {
  plan: AccountPlanSummary;
  /** Where the reader manages the subscription; the site itself takes no payment actions. */
  manageUrl: string;
};

/**
 * The priced plan card. Modules may not import `src/vendor`, so the page
 * composition supplies the Valyro card (`src/features/AccountBillingPlanCard`)
 * through this slot; without it the account shows its own plain plate.
 */
export const AccountPlanCardSlot = /* @__PURE__ */ createContext<ComponentType<AccountPlanCardProps> | null>(null);
