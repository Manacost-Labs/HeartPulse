/**
 * The complete public profile contract. Every key here is reviewed as safe to
 * show anyone who guesses `/id/<n>/`; `PUBLIC_PROFILE_FIELDS` is the runtime
 * copy the allow-list test compares responses against.
 */
export type PublicProfileRecord = {
  publicProfileId: string;
  /** The nickname the person chose, or null before they choose one. */
  nickname: string | null;
  /** The nickname, or «Игрок #<n>»: never the account name. */
  displayName: string;
  avatarInitials: string;
  /** Registration month, `YYYY-MM`: the exact sign-up time is not public. */
  memberSince: string;
  /** Only whether a subscription is active: no level, price or source. */
  isSubscriber: boolean;
};

export const PUBLIC_PROFILE_FIELDS: readonly (keyof PublicProfileRecord)[] = [
  'publicProfileId', 'nickname', 'displayName', 'avatarInitials', 'memberSince', 'isSubscriber',
];

/**
 * Untrusted persistence row. It may carry more columns than the projection
 * reads; serialization copies only the allow-listed values out of it.
 */
export type PublicProfileCandidate = {
  publicNumericId: unknown;
  nickname: unknown;
  createdAt: unknown;
  hasSubscription: unknown;
} & Record<string, unknown>;

const NUMERIC_ID = /^[1-9][0-9]{0,9}$/;
const MONTH = /^(\d{4})-(\d{2})/;

function storedText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/\p{Cc}/gu, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Projects a stored row onto the public contract, or null when the row has no
 * usable public ID. The account name (`users.name`) is never read: it is often
 * filled from a Discord, Yandex or Boosty login, a mail address or a Telegram
 * ID, so only a nickname the person chose for this page is shown.
 */
export function serializePublicProfile(source: PublicProfileCandidate): PublicProfileRecord | null {
  const publicProfileId = String(source.publicNumericId ?? '');
  if (!NUMERIC_ID.test(publicProfileId)) return null;
  const nickname = storedText(source.nickname, 24) || null;
  const month = MONTH.exec(String(source.createdAt ?? ''));
  return {
    publicProfileId,
    nickname,
    displayName: nickname ?? `Игрок #${publicProfileId}`,
    avatarInitials: nickname ? [...nickname].slice(0, 2).join('').toUpperCase() : '#',
    memberSince: month ? `${month[1]}-${month[2]}` : '',
    isSubscriber: Number(source.hasSubscription) === 1,
  };
}
