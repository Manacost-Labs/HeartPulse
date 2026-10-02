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

export type AccountLinkRow = {
  id: 'email' | 'telegram' | 'boosty' | 'patreon';
  title: string;
  detail: string;
  linked: boolean;
};

/** A Telegram-only account carries a placeholder address such as `id@telegram.local`. */
export function isRealAuthEmail(email?: string): boolean {
  return Boolean(email && email.includes('@') && !email.endsWith('@telegram.local') && !email.endsWith('.local'));
}

/** Every known way into the account, with whether it is linked. */
export function accountLinkRows(user: AuthUser, subscription: SubscriptionStatus | null): AccountLinkRow[] {
  const realEmail = isRealAuthEmail(user.email);
  const telegramName = user.telegramUsername || user.contactTelegram;
  const boosty = subscription?.boosty;
  const patreon = subscription?.patreon;
  const rows: AccountLinkRow[] = [
    { id: 'email', title: 'Почта', detail: realEmail ? `${user.email} · вход по почте` : 'Не привязана', linked: realEmail },
    {
      id: 'telegram',
      title: 'Telegram',
      detail: user.telegramLinked ? (telegramName ? `@${telegramName}` : 'Привязан') : 'Не привязан',
      linked: Boolean(user.telegramLinked),
    },
    {
      id: 'boosty',
      title: 'Boosty',
      detail: boosty?.hasAccess
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
