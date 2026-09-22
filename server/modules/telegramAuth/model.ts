export type TelegramAuthIdentityProvider = 'telegram' | 'telegram_oidc' | 'boosty-email';

export type TelegramAuthIdentityErrorCode =
  | 'IDENTITY_REQUIRED'
  | 'AUTH_INTENT_INVALID'
  | 'INVALID_TELEGRAM_ID'
  | 'INVALID_OIDC_SUB'
  | 'TELEGRAM_IDENTITY_CONFLICT'
  | 'BOOSTY_IDENTITY_CONFLICT'
  | 'LINK_SESSION_INVALID'
  | 'LINK_TOKEN_INVALID'
  | 'LINK_TARGET_NOT_FOUND'
  | 'IDENTITY_OWNER_NOT_FOUND'
  | 'USER_CREATION_CONFLICT';

export class TelegramAuthIdentityError extends Error {
  readonly code: TelegramAuthIdentityErrorCode;

  constructor(code: TelegramAuthIdentityErrorCode, message: string) {
    super(message);
    this.name = 'TelegramAuthIdentityError';
    this.code = code;
  }
}

export type TelegramAuthUser = {
  id: string;
  email: string;
  name: string;
  avatarInitials?: string;
  telegramId?: string;
  telegramUsername?: string;
  photoUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type TelegramAuthSession = {
  userId?: string;
  email: string;
};

export type TelegramAuthStore<User extends TelegramAuthUser> = {
  users: User[];
  sessions: TelegramAuthSession[];
};

export type TelegramAuthNewUser = {
  id: string;
  email: string;
  name: string;
  avatarInitials: string;
  telegramId?: string;
  telegramUsername: string;
  photoUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type TelegramAuthIdentityClaim = {
  provider: TelegramAuthIdentityProvider;
  providerUserId: string;
  email: string;
  username: string;
  photoUrl: string;
  verifiedAt: string;
};

/**
 * A bot link token is bound to the exact authenticated browser session that
 * issued it. The hash is persisted, never the bearer session token itself.
 */
export type TelegramBotLinkToken = {
  code: string;
  userId: string;
  sessionTokenHash: string;
  expiresAt: number;
  usedAt?: string | null;
};

export type TelegramAuthResolverDependencies<User extends TelegramAuthUser, Profile> = {
  findIdentityOwnerId: (
    provider: TelegramAuthIdentityProvider,
    providerUserId: string,
  ) => string | undefined;
  findIdentityProviderIds: (
    userId: string,
    provider: TelegramAuthIdentityProvider,
  ) => string[];
  readVerifiedProfile: (telegramId: string) => Profile | null;
  verifiedEmail: (profile: Profile | null) => string;
  digest: (value: string) => string;
  now: () => string;
  createUser: (candidate: TelegramAuthNewUser) => User;
};

export type TelegramAuthResolverInput<
  User extends TelegramAuthUser,
> = {
  store: TelegramAuthStore<User>;
  payload: Record<string, unknown>;
  linkUserId?: string;
};

export type TelegramAuthResolverResult<User extends TelegramAuthUser, Profile> = {
  user: User;
  profile: Profile | null;
  claims: readonly TelegramAuthIdentityClaim[];
};
