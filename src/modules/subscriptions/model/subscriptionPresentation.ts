import type {
  SubscriptionAccess,
  SubscriptionEntitlementKey,
} from './subscriptionAccess';

// Declaration order is the canonical UI order; contract tests keep it
// independent from the key order received in provider payloads.
const SUBSCRIPTION_ENTITLEMENT_LABELS = {
  arena: 'Арена',
  battlegrounds: 'Поля Сражений',
  standard: 'Стандарт',
  contests: 'Конкурсы',
  guidesArchive: 'Архив гайдов',
  arenaArticles: 'Статьи Арены',
  battlegroundsArticles: 'Статьи Полей',
} as const satisfies Record<SubscriptionEntitlementKey, string>;

type SubscriptionPresentationAccess = Partial<
  Pick<SubscriptionAccess, 'hasAccess' | 'entitlements'>
>;

/**
 * Returns ordered, human-readable labels for client presentation only.
 * A missing entitlement map keeps the legacy general-access fallback, while
 * an explicit empty map intentionally renders no named sections.
 */
export function subscriptionEntitlementLabels(
  subscription: SubscriptionPresentationAccess | null | undefined,
): string[] {
  const entitlements = subscription?.entitlements;
  if (!entitlements) return subscription?.hasAccess ? ['Все разделы'] : [];

  const labels: string[] = [];
  for (const key of Object.keys(SUBSCRIPTION_ENTITLEMENT_LABELS) as SubscriptionEntitlementKey[]) {
    if (entitlements[key]) labels.push(SUBSCRIPTION_ENTITLEMENT_LABELS[key]);
  }
  return labels;
}
