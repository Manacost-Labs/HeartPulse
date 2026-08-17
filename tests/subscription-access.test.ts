import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  hasSubscriptionEntitlement,
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
  arena: true,
  battlegrounds: true,
  standard: true,
  contests: true,
  guidesArchive: true,
  arenaArticles: true,
  battlegroundsArticles: true,
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

for (const relativePath of [
  '../src/App.tsx',
  '../src/app/routing/routeManifest.ts',
  '../src/components/GlobalUtilityHeader.tsx',
  '../src/features/Contests.tsx',
  '../src/features/DeferredRoutes.tsx',
]) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  assert.match(source, /modules\/subscriptions\/public/,
    `${relativePath} must consume the subscriptions public entry`);
  assert.doesNotMatch(source, /type SubscriptionStatus\s*=/,
    `${relativePath} must not redeclare the subscription status contract`);
  assert.doesNotMatch(source, /type SubscriptionEntitlementKey\s*=/,
    `${relativePath} must not redeclare the entitlement key contract`);
  assert.doesNotMatch(source, /function hasSubscriptionEntitlement\s*\(/,
    `${relativePath} must not redeclare the entitlement access policy`);
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
