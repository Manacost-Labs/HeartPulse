import {
  TelegramAuthIdentityError,
  type TelegramAuthIdentityClaim,
  type TelegramAuthIdentityProvider,
  type TelegramAuthResolverDependencies,
  type TelegramAuthResolverInput,
  type TelegramAuthResolverResult,
  type TelegramAuthUser,
} from './model.js';
import {
  normalizedTelegramEmail,
  parseTelegramAuthPayload,
} from './schema.js';

function sameUser(
  left: TelegramAuthUser | undefined,
  right: TelegramAuthUser | undefined,
): boolean {
  return !left || !right || left.id === right.id;
}

function resolveIdentityOwner<User extends TelegramAuthUser, Profile>(
  dependencies: TelegramAuthResolverDependencies<User, Profile>,
  { store, payload, linkUserId }: TelegramAuthResolverInput<User>,
) {
    const { telegramId, oidcSub, firstName, lastName, username, photoUrl } = parseTelegramAuthPayload(payload);

    const usersById = new Map(store.users.map(user => [user.id, user]));
    const linkUser = linkUserId ? usersById.get(linkUserId) : undefined;
    if (linkUserId && !linkUser) {
      throw new TelegramAuthIdentityError(
        'LINK_TARGET_NOT_FOUND',
        'Пользователь для привязки Telegram не найден',
      );
    }

    const owner = (
      provider: TelegramAuthIdentityProvider,
      providerUserId: string,
    ): User | undefined => {
      if (!providerUserId) return undefined;
      const ownerId = dependencies.findIdentityOwnerId(provider, providerUserId);
      if (!ownerId) return undefined;
      const found = usersById.get(ownerId);
      if (!found) {
        throw new TelegramAuthIdentityError(
          'IDENTITY_OWNER_NOT_FOUND',
          'Связанный аккаунт Telegram не найден',
        );
      }
      return found;
    };

    const telegramOwner = owner('telegram', telegramId);
    const oidcOwner = owner('telegram_oidc', oidcSub);
    if (!sameUser(telegramOwner, oidcOwner)) {
      throw new TelegramAuthIdentityError(
        'TELEGRAM_IDENTITY_CONFLICT',
        'Этот Telegram уже привязан к другому аккаунту',
      );
    }
    const immutableOwner = telegramOwner ?? oidcOwner;

    const profile = telegramId ? dependencies.readVerifiedProfile(telegramId) : null;
    const verifiedEmail = normalizedTelegramEmail(dependencies.verifiedEmail(profile));
    const boostyOwner = owner('boosty-email', verifiedEmail);
    const verifiedEmailOwner = verifiedEmail
      ? store.users.find(user => normalizedTelegramEmail(user.email) === verifiedEmail)
      : undefined;
    if (!sameUser(boostyOwner, verifiedEmailOwner)) {
      throw new TelegramAuthIdentityError(
        'BOOSTY_IDENTITY_CONFLICT',
        'Эта Boosty-почта уже привязана к другому аккаунту',
      );
    }
    const verifiedOwner = boostyOwner ?? verifiedEmailOwner;
    if (!sameUser(immutableOwner, verifiedOwner)) {
      throw new TelegramAuthIdentityError(
        'BOOSTY_IDENTITY_CONFLICT',
        'Эта Boosty-почта уже привязана к другому аккаунту',
      );
    }

    const syntheticEmail = telegramId
      ? `telegram_${telegramId}@telegram.local`
      : `telegram_oidc_${dependencies.digest(oidcSub).slice(0, 16)}@telegram.local`;
    const syntheticEmailOwner = verifiedEmail ? undefined : store.users.find(
      user => normalizedTelegramEmail(user.email) === syntheticEmail,
    );

    if (linkUser) {
      if (!sameUser(linkUser, immutableOwner) || !sameUser(linkUser, syntheticEmailOwner)) {
        throw new TelegramAuthIdentityError(
          'TELEGRAM_IDENTITY_CONFLICT',
          'Этот Telegram уже привязан к другому аккаунту',
        );
      }
      if (!sameUser(linkUser, verifiedOwner)) {
        throw new TelegramAuthIdentityError(
          'BOOSTY_IDENTITY_CONFLICT',
          'Эта Boosty-почта уже привязана к другому аккаунту',
        );
      }
    }

    return { telegramId, oidcSub, firstName, lastName, username, photoUrl, usersById, profile, verifiedEmail, syntheticEmail, user: linkUser ?? immutableOwner ?? verifiedOwner ?? syntheticEmailOwner };
}

/**
 * Resolves a verified Telegram login without using mutable profile metadata as
 * identity. All conflicting candidates are rejected before store mutation.
 */
export function createTelegramAuthUserResolver<
  User extends TelegramAuthUser,
  Profile,
>(dependencies: TelegramAuthResolverDependencies<User, Profile>) {
  return ({ store, payload, linkUserId }: TelegramAuthResolverInput<User>):
  TelegramAuthResolverResult<User, Profile> => {
    const resolved = resolveIdentityOwner(dependencies, { store, payload, linkUserId });
    const { telegramId, oidcSub, firstName, lastName, username, photoUrl, usersById, profile, verifiedEmail, syntheticEmail } = resolved;
    const displayName = [firstName, lastName].filter(Boolean).join(' ').trim()
      || (username
        ? `@${username}`
        : `Telegram ${telegramId || dependencies.digest(oidcSub).slice(0, 10)}`);
    const now = dependencies.now();
    let user = resolved.user;

    if (user) {
      const conflictingTelegramId = telegramId && user.telegramId && user.telegramId !== telegramId;
      const conflictingStoredTelegramId = telegramId && dependencies
        .findIdentityProviderIds(user.id, 'telegram')
        .some(providerUserId => providerUserId !== telegramId);
      const conflictingStoredOidcSub = oidcSub && dependencies
        .findIdentityProviderIds(user.id, 'telegram_oidc')
        .some(providerUserId => providerUserId !== oidcSub);
      if (conflictingTelegramId || conflictingStoredTelegramId || conflictingStoredOidcSub) {
        throw new TelegramAuthIdentityError(
          'TELEGRAM_IDENTITY_CONFLICT',
          'Этот Telegram уже привязан к другому аккаунту',
        );
      }
    }

    if (!user) {
      const email = verifiedEmail || syntheticEmail;
      user = dependencies.createUser({
        id: `tg_${dependencies.digest(
          telegramId ? `telegram:${telegramId}` : `telegram_oidc:${oidcSub}`,
        ).slice(0, 12)}`,
        email,
        name: displayName,
        avatarInitials: displayName.slice(0, 2).toUpperCase(),
        telegramId: telegramId || undefined,
        telegramUsername: username,
        photoUrl,
        createdAt: now,
        updatedAt: now,
      });
      if (usersById.has(user.id)
        || store.users.some(candidate => (
          normalizedTelegramEmail(candidate.email) === normalizedTelegramEmail(user.email)
        ))) {
        throw new TelegramAuthIdentityError(
          'USER_CREATION_CONFLICT',
          'Не удалось безопасно создать аккаунт Telegram',
        );
      }
      store.users.push(user);
    } else {
      if (verifiedEmail && normalizedTelegramEmail(user.email) !== verifiedEmail) {
        const oldEmail = user.email;
        user.email = verifiedEmail;
        for (const session of store.sessions) {
          if (session.userId === user.id || session.email === oldEmail) session.email = verifiedEmail;
        }
      }
      if (!user.name || user.name.startsWith('Telegram ')) user.name = displayName;
      if (telegramId) user.telegramId = telegramId;
      user.telegramUsername = username;
      if (photoUrl) user.photoUrl = photoUrl;
      user.updatedAt = now;
    }

    const claims: TelegramAuthIdentityClaim[] = [];
    if (telegramId) {
      claims.push({
        provider: 'telegram',
        providerUserId: telegramId,
        email: '',
        username,
        photoUrl,
        verifiedAt: now,
      });
    }
    if (oidcSub) {
      claims.push({
        provider: 'telegram_oidc',
        providerUserId: oidcSub,
        email: '',
        username,
        photoUrl,
        verifiedAt: now,
      });
    }
    if (verifiedEmail) {
      claims.push({
        provider: 'boosty-email',
        providerUserId: verifiedEmail,
        email: verifiedEmail,
        username: verifiedEmail,
        photoUrl: '',
        verifiedAt: now,
      });
    }

    return {
      user,
      profile,
      claims,
    };
  };
}
