/** The public profile projection served by `GET /api/profiles/:id`; see `docs/specs/public-profiles.md`. */
export type PublicProfile = {
  publicProfileId: string;
  nickname: string | null;
  displayName: string;
  avatarInitials: string;
  /** Registration month, `YYYY-MM`. */
  memberSince: string;
  isSubscriber: boolean;
};

/** The signed-in person's own public link and nickname state. */
export type OwnPublicProfile = {
  publicProfileId: string;
  nickname: string | null;
  /** ISO time when the nickname may change again; null when it may change now. */
  nicknameChangeAvailableAt: string | null;
};

const NUMERIC_PUBLIC_PROFILE_ID = /^[1-9]\d{0,9}$/;
const MAX_PUBLIC_PROFILE_ID = 2_147_483_647;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNumericPublicProfileId(value: unknown): value is string {
  return typeof value === 'string' && NUMERIC_PUBLIC_PROFILE_ID.test(value) && Number(value) <= MAX_PUBLIC_PROFILE_ID;
}

/** The canonical profile path; anything but a server-issued numeric ID falls back to the home page. */
export function publicProfilePath(publicProfileId: string): string {
  return isNumericPublicProfileId(publicProfileId) ? `/id/${publicProfileId}/` : '/';
}

/** Copies only the contract's fields out of an API answer, or null when it does not match. */
export function publicProfileFromPayload(payload: unknown): PublicProfile | null {
  if (!isRecord(payload) || !isRecord(payload.profile)) return null;
  const profile = payload.profile;
  if (!isNumericPublicProfileId(profile.publicProfileId)
    || (profile.nickname !== null && typeof profile.nickname !== 'string')
    || typeof profile.displayName !== 'string'
    || typeof profile.avatarInitials !== 'string'
    || typeof profile.memberSince !== 'string'
    || typeof profile.isSubscriber !== 'boolean') return null;
  return {
    publicProfileId: profile.publicProfileId,
    nickname: profile.nickname as string | null,
    displayName: profile.displayName,
    avatarInitials: profile.avatarInitials,
    memberSince: profile.memberSince,
    isSubscriber: profile.isSubscriber,
  };
}

export function ownPublicProfileFromPayload(payload: unknown): OwnPublicProfile | null {
  if (!isRecord(payload) || !isNumericPublicProfileId(payload.publicProfileId)) return null;
  return {
    publicProfileId: payload.publicProfileId,
    nickname: typeof payload.nickname === 'string' ? payload.nickname : null,
    nicknameChangeAvailableAt: typeof payload.nicknameChangeAvailableAt === 'string'
      ? payload.nicknameChangeAvailableAt : null,
  };
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** «На HearthPulse с марта 2026» from `2026-03`; empty when the month is unknown. */
export function memberSinceLabel(memberSince: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(memberSince);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `На HearthPulse с ${month} ${match[1]}` : '';
}
