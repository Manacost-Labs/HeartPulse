type ApplicationProfileUser = {
  id: string;
  publicProfileId?: string;
  email: string;
  name: string;
  avatarInitials?: string;
};

type ApplicationSubscriptionStatus = {
  hasAccess: boolean;
  source: string;
  checkedAt: string | null;
  stale: boolean;
  entitlements: Record<string, boolean>;
};

/**
 * Keeps the desktop authorization boundary intentionally smaller than the
 * browser session payload. Administrative flags and provider contact details
 * must never cross this serializer.
 */
export function serializeApplicationProfileUser(
  user: ApplicationProfileUser,
  appUrl: string,
) {
  return {
    id: user.id,
    publicProfileId: user.publicProfileId ?? '',
    profileUrl: user.publicProfileId
      ? `${appUrl.replace(/\/+$/, '')}/profiles/${user.publicProfileId}`
      : '',
    email: user.email,
    name: user.name,
    avatarInitials: user.avatarInitials ?? user.name.slice(0, 2).toUpperCase(),
  };
}

/**
 * Provider payloads can contain external identifiers and subscription detail.
 * The public application receives only the normalized authorization decision.
 */
export function serializeApplicationSubscription(
  status: ApplicationSubscriptionStatus,
) {
  return {
    hasAccess: status.hasAccess,
    source: status.source,
    checkedAt: status.checkedAt,
    stale: status.stale,
    entitlements: { ...status.entitlements },
  };
}
