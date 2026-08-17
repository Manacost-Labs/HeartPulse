import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  hasSubscriptionEntitlement,
  subscriptionEntitlementLabels,
  type SubscriptionEntitlementKey,
  type SubscriptionStatus,
} from '../src/modules/subscriptions/public';

function subscriptionStatus(overrides: Partial<SubscriptionStatus> = {}): SubscriptionStatus {
  return {
    hasAccess: false,
    source: 'test',
    checkedAt: null,
    stale: false,
    message: '',
    entitlements: {},
    boosty: {},
    telegram: {},
    ...overrides,
  };
}

assert.equal(hasSubscriptionEntitlement(null, null), false,
  'a missing subscription must not grant general access');
assert.equal(hasSubscriptionEntitlement(undefined, 'arena'), false,
  'a missing subscription must not grant a named entitlement');

assert.equal(hasSubscriptionEntitlement(subscriptionStatus({ hasAccess: true }), null), true,
  'general access must retain the top-level hasAccess contract');
assert.equal(hasSubscriptionEntitlement(subscriptionStatus({ hasAccess: false }), null), false,
  'general access must remain denied when hasAccess is false');
assert.equal(
  hasSubscriptionEntitlement(
    subscriptionStatus({ hasAccess: false, entitlements: { arena: true } }),
    null,
  ),
  false,
  'general access must not be inferred from a named entitlement',
);

assert.equal(
  hasSubscriptionEntitlement(subscriptionStatus({ hasAccess: true, entitlements: {} }), 'arena'),
  false,
  'general access must not silently widen a missing named entitlement',
);
assert.equal(
  hasSubscriptionEntitlement(
    subscriptionStatus({ hasAccess: true, entitlements: undefined }),
    'arena',
  ),
  false,
  'a missing entitlement map must deny named access even when general access is granted',
);
assert.equal(
  hasSubscriptionEntitlement(subscriptionStatus({ hasAccess: false, entitlements: { arena: true } }), 'arena'),
  true,
  'a named entitlement must be decided by its explicit flag',
);

const EXPECTED_ENTITLEMENTS = {
  battlegroundsArticles: true,
  arenaArticles: true,
  guidesArchive: true,
  contests: true,
  standard: true,
  battlegrounds: true,
  arena: true,
} as const satisfies Record<SubscriptionEntitlementKey, true>;
const entitlementKeys = Object.keys(EXPECTED_ENTITLEMENTS) as SubscriptionEntitlementKey[];
for (const entitlement of entitlementKeys) {
  assert.equal(
    hasSubscriptionEntitlement(subscriptionStatus({ entitlements: { [entitlement]: true } }), entitlement),
    true,
    `${entitlement} must remain part of the client subscription contract`,
  );
}
assert.equal(
  hasSubscriptionEntitlement(subscriptionStatus({ entitlements: { arena: false } }), 'arena'),
  false,
  'an explicitly disabled named entitlement must remain denied',
);

const EXPECTED_ENTITLEMENT_LABELS = [
  'Арена',
  'Поля Сражений',
  'Стандарт',
  'Конкурсы',
  'Архив гайдов',
  'Статьи Арены',
  'Статьи Полей',
] as const;

assert.deepEqual(subscriptionEntitlementLabels(null), [],
  'a missing subscription must not expose display labels');
assert.deepEqual(subscriptionEntitlementLabels(undefined), [],
  'an undefined subscription must not expose display labels');
assert.deepEqual(subscriptionEntitlementLabels({ hasAccess: false }), [],
  'a denied legacy subscription without an entitlement map must expose no labels');
assert.deepEqual(subscriptionEntitlementLabels({ hasAccess: true }), ['Все разделы'],
  'legacy general access without an entitlement map must retain its fallback label');
assert.deepEqual(subscriptionEntitlementLabels({ hasAccess: true, entitlements: undefined }), ['Все разделы'],
  'an explicitly undefined entitlement map must retain the legacy fallback label');
assert.deepEqual(subscriptionEntitlementLabels({ hasAccess: true, entitlements: {} }), [],
  'an explicit empty entitlement map must not widen into the legacy fallback');
assert.deepEqual(
  subscriptionEntitlementLabels({ hasAccess: false, entitlements: EXPECTED_ENTITLEMENTS }),
  EXPECTED_ENTITLEMENT_LABELS,
  'all named entitlements must retain their exact display order and Russian labels',
);
assert.deepEqual(
  subscriptionEntitlementLabels({
    hasAccess: true,
    entitlements: { arena: false, contests: true, arenaArticles: true },
  }),
  ['Конкурсы', 'Статьи Арены'],
  'an explicit entitlement map must include only enabled named sections',
);

for (const relativePath of [
  '../src/App.tsx',
  '../src/app/routing/routeManifest.ts',
  '../src/components/GlobalUtilityHeader.tsx',
  '../src/features/Contests.tsx',
  '../src/features/DeferredRoutes.tsx',
  '../src/modules/identity/ui/LoginPanel.tsx',
]) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  assert.match(source, /(?:modules\/subscriptions|\.\.\/\.\.\/subscriptions)\/public/,
    `${relativePath} must consume the subscriptions public entry`);
  assert.doesNotMatch(source, /type SubscriptionStatus\s*=/,
    `${relativePath} must not redeclare the subscription status contract`);
  assert.doesNotMatch(source, /type SubscriptionEntitlementKey\s*=/,
    `${relativePath} must not redeclare the entitlement key contract`);
  assert.doesNotMatch(source, /function hasSubscriptionEntitlement\s*\(/,
    `${relativePath} must not redeclare the entitlement access policy`);
  assert.doesNotMatch(source, /function subscriptionEntitlementLabels\s*\(/,
    `${relativePath} must not redeclare the entitlement display policy`);
  assert.doesNotMatch(source, /SUBSCRIPTION_ENTITLEMENT_LABELS/,
    `${relativePath} must not own the entitlement display metadata`);
}

const publicEntry = readFileSync(
  new URL('../src/modules/subscriptions/public.ts', import.meta.url),
  'utf8',
);
assert.doesNotMatch(
  publicEntry,
  /SubscriptionEntitlements/,
  'the entitlement storage shape must remain an internal implementation detail',
);

console.log(`subscription access contract tests passed (${entitlementKeys.length} entitlements)`);
