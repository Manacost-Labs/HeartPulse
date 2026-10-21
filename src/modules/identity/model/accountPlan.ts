import type { SubscriptionStatus } from '../../subscriptions/public';

export type AccountPlanState = 'pending' | 'unknown' | 'active' | 'none';
export type AccountPlanProvider = 'boosty' | 'patreon' | 'telegram' | 'manual';

export type AccountPlanSummary = {
  state: AccountPlanState;
  provider: AccountPlanProvider | null;
  /** The plan name: the provider's level or tier, or what grants access. */
  title: string;
  /** Monthly price in roubles; null when the provider does not report one. */
  price: number | null;
  /** A future date access is paid until; never a past or unparsable one. */
  renewsAt: string | null;
  /** `unknown` when the provider does not say whether it charges again. */
  renewal: 'auto' | 'ends' | 'unknown';
  graceUntil: string | null;
  /** One line for the header: provider, date and what happens then. */
  statusLine: string;
};

const PROVIDER_NAMES: Record<AccountPlanProvider, string> = {
  boosty: 'Boosty',
  patreon: 'Patreon',
  telegram: 'Telegram',
  manual: 'Администрация',
};

/** `12 нояб.`, with the year only when it differs from the current one. */
export function formatPlanDate(value: string, now: number = Date.now()): string {
  const date = new Date(value);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString('ru-RU', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

function futureDate(value: unknown, now: number): string | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > now ? value : null;
}

function activeProvider(subscription: SubscriptionStatus): AccountPlanProvider | null {
  if (subscription.boosty?.hasAccess) return 'boosty';
  if (subscription.patreon?.hasAccess) return 'patreon';
  if (subscription.telegram?.hasAccess) return 'telegram';
  return subscription.source.includes('manual-access') ? 'manual' : null;
}

function planTitle(subscription: SubscriptionStatus, provider: AccountPlanProvider): string {
  if (provider === 'boosty') return subscription.boosty.levelName || 'Подписка Boosty';
  if (provider === 'patreon') return subscription.patreon.tierTitles?.[0] || 'Подписка Patreon';
  if (provider === 'telegram') return 'VIP-канал в Telegram';
  return 'Доступ от администрации';
}

function renewalText(renewal: AccountPlanSummary['renewal']): string {
  if (renewal === 'auto') return ', продлится автоматически';
  if (renewal === 'ends') return ', не продлится';
  return '';
}

/**
 * What the reader pays for, until when and what happens next, from the
 * subscription status alone. Presentation only: the server decides access.
 */
export function accountPlanSummary(subscription: SubscriptionStatus | null, checked: boolean, now: number = Date.now()): AccountPlanSummary {
  const empty = { provider: null, title: '', price: null, renewsAt: null, renewal: 'unknown', graceUntil: null } as const;
  if (!subscription) return { ...empty, state: checked ? 'unknown' : 'pending', statusLine: checked ? 'Не удалось проверить подписку' : 'Проверяем подписку…' };
  const provider = subscription.hasAccess ? activeProvider(subscription) : null;
  if (!provider) {
    return subscription.hasAccess
      ? { ...empty, state: 'active', title: 'Полный доступ', statusLine: 'Доступ открыт' }
      : { ...empty, state: 'none', statusLine: 'Без подписки' };
  }
  const boosty = provider === 'boosty' ? subscription.boosty : null;
  const renewsAt = futureDate(boosty?.dates?.nextPaymentAt, now);
  const renewal = typeof boosty?.willRenew === 'boolean' && renewsAt ? (boosty.willRenew ? 'auto' : 'ends') : 'unknown';
  const graceUntil = boosty?.grace ? futureDate(boosty.graceUntil, now) : null;
  const name = PROVIDER_NAMES[provider];
  let statusLine = `${name} · подписка активна`;
  if (graceUntil) statusLine = `Boosty не отвечает · доступ сохранён до ${formatPlanDate(graceUntil, now)}`;
  else if (renewsAt) statusLine = `${name} · ${renewal === 'unknown' ? 'оплачено ' : ''}до ${formatPlanDate(renewsAt, now)}${renewalText(renewal)}`;
  else if (provider === 'manual') statusLine = subscription.message || 'Доступ выдан администрацией';
  return {
    state: 'active',
    provider,
    title: planTitle(subscription, provider),
    price: boosty?.price ? boosty.price : null,
    renewsAt,
    renewal,
    graceUntil,
    statusLine,
  };
}
