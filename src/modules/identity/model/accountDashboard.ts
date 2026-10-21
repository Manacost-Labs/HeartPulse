import type { SubscriptionEntitlementKey, SubscriptionStatus } from '../../subscriptions/public';
import type { AuthUser } from './authUser';

export type AccountAccessTile = {
  key: SubscriptionEntitlementKey;
  title: string;
  description: string;
  href: string;
  unlocked: boolean;
};

// Declaration order is the order on the page.
const ACCESS_SECTIONS: Record<SubscriptionEntitlementKey, Omit<AccountAccessTile, 'key' | 'unlocked'>> = {
  arena: { title: 'Арена', description: 'Тир-лист, классы, легендарки', href: '/tierlist/' },
  battlegrounds: { title: 'Поля сражений', description: 'Герои, библиотека, тир-лист', href: '/heroes/' },
  standard: { title: 'Стандарт', description: 'Мета, матчапы, архетипы', href: '/standard/meta/' },
  contests: { title: 'Конкурсы', description: 'Участие и призы', href: '/contests/' },
  guidesArchive: { title: 'Архив гайдов', description: 'Гайды прошлых сезонов', href: '/guides-archive/' },
  arenaArticles: { title: 'Статьи Арены', description: 'Платные разборы Арены', href: '/articles/' },
  battlegroundsArticles: { title: 'Статьи Полей', description: 'Платные разборы Полей', href: '/articles/' },
};

/**
 * The paid sections and whether this viewer has them. Without an entitlement
 * map the general access flag decides, as in `subscriptionEntitlementLabels`;
 * an explicit empty map unlocks nothing. Presentation only: protected APIs
 * authorize every request on the server.
 */
export function accountAccessTiles(subscription: SubscriptionStatus | null): AccountAccessTile[] {
  const entitlements = subscription?.entitlements;
  return (Object.keys(ACCESS_SECTIONS) as SubscriptionEntitlementKey[]).map(key => ({
    key,
    ...ACCESS_SECTIONS[key],
    unlocked: entitlements ? Boolean(entitlements[key]) : Boolean(subscription?.hasAccess),
  }));
}

/** The provider that grants access, as one line: `Boosty · level · price ₽`. */
export function accountAccessSource(subscription: SubscriptionStatus | null): string {
  if (!subscription?.hasAccess) return '';
  const { boosty, patreon, telegram } = subscription;
  if (boosty?.hasAccess) {
    return ['Boosty', boosty.levelName, boosty.price ? `${boosty.price} ₽` : ''].filter(Boolean).join(' · ');
  }
  if (patreon?.hasAccess) return ['Patreon', ...(patreon.tierTitles ?? [])].join(' · ');
  if (telegram?.hasAccess) return 'Telegram VIP-канал';
  return '';
}

/**
 * The server's own words when access rests on something other than a fresh
 * provider check: a Boosty grace period or an administrator grant.
 */
export function accountAccessNote(subscription: SubscriptionStatus | null): string {
  if (!subscription?.hasAccess) return '';
  return subscription.boosty?.grace || subscription.source.includes('manual-access') ? subscription.message : '';
}

/** Telegram can be linked through OIDC or through the bot's one-time code. */
export function hasTelegramLinkActions(mode: 'legacy-widget' | 'oidc' | 'disabled', botUsername: string): boolean {
  return mode === 'oidc' || Boolean(botUsername);
}

export type AccountSocialProvider = 'google' | 'discord' | 'yandex';

export type AccountLinkRow = {
  id: 'email' | 'telegram' | AccountSocialProvider | 'boosty' | 'patreon';
  title: string;
  detail: string;
  linked: boolean;
  /** Where linking starts while signed in; only for providers that are not linked yet. */
  linkUrl?: string;
};

/**
 * Sign-in providers the server offers, and the ones this account already uses.
 * `linked` is null while the account's identities are unknown: rows are then
 * left out rather than shown as unlinked.
 */
export type AccountSocialLinks = {
  providers: ReadonlyArray<{ provider: string; authUrl: string }>;
  linked: ReadonlySet<string> | null;
};

const SOCIAL_TITLES: Record<AccountSocialProvider, string> = { google: 'Google', discord: 'Discord', yandex: 'Яндекс ID' };

function socialRows(social: AccountSocialLinks | undefined): AccountLinkRow[] {
  if (!social?.linked) return [];
  const linked = social.linked;
  return social.providers.flatMap(({ provider, authUrl }): AccountLinkRow[] => {
    if (provider !== 'google' && provider !== 'discord' && provider !== 'yandex') return [];
    const isLinked = linked.has(provider);
    return [{
      id: provider,
      title: SOCIAL_TITLES[provider],
      detail: isLinked ? 'Привязан · можно входить' : 'Не привязан',
      linked: isLinked,
      ...(isLinked ? {} : { linkUrl: authUrl }),
    }];
  });
}

/** A Telegram-only account carries a placeholder address such as `id@telegram.local`. */
export function isRealAuthEmail(email?: string): boolean {
  return Boolean(email && email.includes('@') && !email.endsWith('@telegram.local') && !email.endsWith('.local'));
}

/** Every known way into the account, with whether it is linked. */
export function accountLinkRows(user: AuthUser, subscription: SubscriptionStatus | null, social?: AccountSocialLinks): AccountLinkRow[] {
  const realEmail = isRealAuthEmail(user.email);
  const boosty = subscription?.boosty;
  const patreon = subscription?.patreon;
  const rows: AccountLinkRow[] = [
    { id: 'email', title: 'Почта', detail: realEmail ? user.email : 'Не привязана', linked: realEmail },
    {
      id: 'telegram',
      title: 'Telegram',
      // Only the server-owned username: the contact handle is typed by the user.
      detail: user.telegramLinked ? (user.telegramUsername ? `@${user.telegramUsername}` : 'Привязан') : 'Не привязан',
      linked: Boolean(user.telegramLinked),
    },
    ...socialRows(social),
    {
      id: 'boosty',
      title: 'Boosty',
      detail: !subscription
        ? 'Статус появится после проверки'
        : boosty?.hasAccess
          ? `${boosty.email || 'Почта подтверждена'} · подписка активна`
          : boosty?.message || 'Почта подписки не подтверждена',
      linked: Boolean(boosty?.hasAccess),
    },
  ];
  if (patreon?.configured) {
    rows.push({
      id: 'patreon',
      title: 'Patreon',
      detail: patreon.hasAccess ? 'Подписка активна' : patreon.connected ? 'Подключён, подписки нет' : 'Не подключён',
      linked: Boolean(patreon.connected),
    });
  }
  return rows;
}

const LINK_PROVIDER_TITLES: Record<string, string> = { ...SOCIAL_TITLES, patreon: 'Patreon', telegram: 'Telegram' };

/**
 * The result a provider's link flow returns with: `?login&linked=google` after
 * success (Patreon keeps its own `?login&patreon=linked`), `?login&google=error`
 * after a refusal (server/socialOAuthRoutes.ts). Returns the message and the
 * query without those markers, or null.
 */
export function accountLinkReturn(search: string): { type: 'ok' | 'err'; text: string; search: string } | null {
  const params = new URLSearchParams(search);
  const legacyLinked = params.get('patreon') === 'linked' ? 'patreon' : '';
  const linked = legacyLinked || (params.get('linked') ?? '');
  const failed = Object.keys(LINK_PROVIDER_TITLES).find(provider => params.get(provider) === 'error');
  if (!LINK_PROVIDER_TITLES[linked] && !failed) return null;
  params.delete('linked');
  if (legacyLinked) params.delete('patreon');
  if (failed) params.delete(failed);
  const rest = params.toString().replace(/=(?=&|$)/g, '');
  return failed
    ? { type: 'err', text: `Не удалось привязать ${LINK_PROVIDER_TITLES[failed]}. Возможно, этот аккаунт уже привязан к другому профилю.`, search: rest ? `?${rest}` : '' }
    : { type: 'ok', text: `${LINK_PROVIDER_TITLES[linked]} привязан: теперь можно входить и так.`, search: rest ? `?${rest}` : '' };
}
