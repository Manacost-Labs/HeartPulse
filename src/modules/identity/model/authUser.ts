export type AuthUser = {
  id?: string;
  profileId?: string;
  publicProfileId?: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | string;
  country?: string;
  newsletterOptIn?: boolean;
  avatarInitials?: string;
  telegramUsername?: string;
  photoUrl?: string;
  contactVkUrl?: string;
  contactTelegram?: string;
  contactEmail?: string;
  adminAllowed?: boolean;
  contestAdminAllowed?: boolean;
};

const OPTIONAL_STRING_FIELDS = [
  'id',
  'profileId',
  'publicProfileId',
  'country',
  'avatarInitials',
  'telegramUsername',
  'photoUrl',
  'contactVkUrl',
  'contactTelegram',
  'contactEmail',
] as const;

const OPTIONAL_BOOLEAN_FIELDS = [
  'newsletterOptIn',
  'adminAllowed',
  'contestAdminAllowed',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

/** Converts an untrusted JSON value into the allowlisted browser identity DTO. */
export function authUserFromValue(value: unknown): AuthUser | null {
  if (!isRecord(value)
    || !hasOwn(value, 'email')
    || !hasOwn(value, 'name')
    || !hasOwn(value, 'role')
    || typeof value.email !== 'string'
    || typeof value.name !== 'string'
    || typeof value.role !== 'string') return null;

  const user: AuthUser = {
    email: value.email,
    name: value.name,
    role: value.role,
  };

  for (const field of OPTIONAL_STRING_FIELDS) {
    if (!hasOwn(value, field)) continue;
    if (typeof value[field] !== 'string') return null;
    Object.assign(user, { [field]: value[field] });
  }
  for (const field of OPTIONAL_BOOLEAN_FIELDS) {
    if (!hasOwn(value, field)) continue;
    if (typeof value[field] !== 'boolean') return null;
    Object.assign(user, { [field]: value[field] });
  }
  return user;
}

function permissionFromPayload(
  payload: Record<string, unknown>,
  field: 'adminAllowed' | 'contestAdminAllowed',
): boolean | undefined | null {
  if (!hasOwn(payload, field)) return undefined;
  return typeof payload[field] === 'boolean' ? payload[field] : null;
}

export function authSessionFromPayload(payload: unknown): { user: AuthUser | null } | null {
  if (!isRecord(payload) || !hasOwn(payload, 'user')) return null;

  const adminAllowed = permissionFromPayload(payload, 'adminAllowed');
  const contestAdminAllowed = permissionFromPayload(payload, 'contestAdminAllowed');
  if (adminAllowed === null || contestAdminAllowed === null) return null;

  if (payload.user === null) return { user: null };
  const user = authUserFromValue(payload.user);
  if (!user) return null;
  if ((adminAllowed !== undefined && user.adminAllowed !== undefined && adminAllowed !== user.adminAllowed)
    || (contestAdminAllowed !== undefined
      && user.contestAdminAllowed !== undefined
      && contestAdminAllowed !== user.contestAdminAllowed)) return null;
  return {
    user: {
      ...user,
      adminAllowed: user.adminAllowed ?? adminAllowed ?? false,
      contestAdminAllowed: user.contestAdminAllowed ?? contestAdminAllowed ?? false,
    },
  };
}

export function authErrorFromPayload(payload: unknown): string | null {
  return isRecord(payload) && hasOwn(payload, 'error') && typeof payload.error === 'string'
    ? payload.error
    : null;
}
