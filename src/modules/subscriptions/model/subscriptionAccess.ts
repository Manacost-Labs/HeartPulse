type SubscriptionEntitlements = {
  arena?: boolean;
  battlegrounds?: boolean;
  standard?: boolean;
  contests?: boolean;
  guidesArchive?: boolean;
  arenaArticles?: boolean;
  battlegroundsArticles?: boolean;
};

export type SubscriptionAccess = {
  hasAccess: boolean;
  entitlements?: SubscriptionEntitlements;
};

export type SubscriptionStatus = SubscriptionAccess & {
  source: string;
  checkedAt: string | null;
  stale: boolean;
  message: string;
  boosty: {
    checked?: boolean;
    found?: boolean;
    hasAccess?: boolean;
    email?: string;
    price?: number;
    levelName?: string;
    message?: string;
  };
  patreon: { configured?: boolean; connected?: boolean; checked?: boolean; hasAccess?: boolean; tierTitles?: string[]; highestTierAmountCents?: number; message?: string };
  telegram: {
    checked?: boolean;
    hasAccess?: boolean;
    username?: string;
    message?: string;
    chats?: Array<{
      chatId: string;
      ok: boolean;
      status?: string;
      isMember?: boolean;
      error?: string;
    }>;
  };
};

export type SubscriptionEntitlementKey = keyof SubscriptionEntitlements;

/**
 * Client presentation and navigation policy only. Named entitlements never
 * inherit the broader legacy `hasAccess` flag; protected APIs must still
 * authorize every request on the server.
 */
export function hasSubscriptionEntitlement(
  subscription: SubscriptionAccess | null | undefined,
  entitlement: SubscriptionEntitlementKey | null,
): boolean {
  if (!subscription) return false;
  if (!entitlement) return Boolean(subscription.hasAccess);
  return Boolean(subscription.entitlements?.[entitlement]);
}
